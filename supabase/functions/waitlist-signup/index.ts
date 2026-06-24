import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod/mod.ts";
import {
  buildWaitlistEmail,
  loadMailConfig,
  sendResendEmail
} from "../_shared/waitlist-mail.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};

const SignupSchema = z.object({
  email: z.string().email().max(320).transform((v) => v.trim().toLowerCase()),
  phone: z.string().max(40).optional().nullable(),
  artist_name: z.string().max(120).optional().nullable(),
  role: z.string().max(80).optional().nullable(),
  goals: z.array(z.string().max(80)).max(12).optional().nullable(),
  feature_suggestion: z.string().max(2000).optional().nullable(),
  heard_from: z.string().max(80).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  referral_source: z.string().max(80).optional().nullable()
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env_${name}`);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const admin = createClient(supabaseUrl, serviceKey);

    const parsed = SignupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json(400, { ok: false, error: "invalid_payload" });
    }
    const payload = parsed.data;

    const { data: existing, error: findErr } = await admin
      .from("waitlist")
      .select("id, welcome_sent_at, artist_name")
      .eq("email", payload.email)
      .maybeSingle();

    if (findErr) {
      console.error("waitlist_signup_lookup", findErr);
      return json(500, { ok: false, error: "lookup_failed" });
    }

    let row = existing;
    let rowId = row?.id as string | undefined;
    let duplicate = false;

    if (row) {
      duplicate = true;
      rowId = row.id;
    } else {
      const { data: inserted, error: insertErr } = await admin
        .from("waitlist")
        .insert({
          email: payload.email,
          phone: payload.phone ?? null,
          artist_name: payload.artist_name ?? null,
          role: payload.role ?? null,
          goals: payload.goals ?? null,
          feature_suggestion: payload.feature_suggestion ?? null,
          heard_from: payload.heard_from ?? null,
          location: payload.location ?? null,
          referral_source: payload.referral_source ?? "direct",
          account_status: "preregistered"
        })
        .select("id")
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          duplicate = true;
          const { data: again } = await admin
            .from("waitlist")
            .select("id, welcome_sent_at, artist_name")
            .eq("email", payload.email)
            .maybeSingle();
          row = again ?? row;
          rowId = row?.id;
        } else {
          console.error("waitlist_signup_insert", insertErr);
          return json(500, { ok: false, error: "insert_failed" });
        }
      } else {
        rowId = inserted.id;
      }
    }

    let emailSent = false;
    const shouldSendWelcome = !row?.welcome_sent_at;

    if (resendKey && shouldSendWelcome && rowId) {
      const mailCfg = loadMailConfig();
      const content = buildWaitlistEmail("welcome", mailCfg, {
        email: payload.email,
        artistName: payload.artist_name ?? row?.artist_name
      });
      const sent = await sendResendEmail({
        apiKey: resendKey,
        from: mailCfg.fromEmail,
        to: payload.email,
        ...content
      });
      if (sent.ok) {
        await admin
          .from("waitlist")
          .update({ welcome_sent_at: new Date().toISOString() })
          .eq("id", rowId);
        emailSent = true;
      } else {
        console.error("waitlist_welcome_email_failed", sent.error);
      }
    } else if (!resendKey) {
      console.warn("waitlist_welcome_skipped_no_resend_key");
    }

    return json(200, {
      ok: true,
      duplicate,
      email_sent: emailSent
    });
  } catch (e) {
    console.error("waitlist_signup_error", e);
    return json(500, { ok: false, error: "server_error" });
  }
});
