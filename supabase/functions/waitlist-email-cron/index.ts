import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildWaitlistEmail,
  loadMailConfig,
  sendResendEmail,
  type WaitlistEmailKind
} from "../_shared/waitlist-mail.ts";

const cors = { "Content-Type": "application/json" };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env_${name}`);
  return v;
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isLaunchEveDay(now: Date, releaseAt: Date): boolean {
  const launchDay = utcDayStart(releaseAt);
  const eve = new Date(launchDay.getTime() - 86_400_000);
  const today = utcDayStart(now);
  return today.getTime() === eve.getTime();
}

function isPastMidpoint(createdAt: Date, releaseAt: Date, now: Date): boolean {
  const span = releaseAt.getTime() - createdAt.getTime();
  if (span < 7 * 86_400_000) return false;
  const midpoint = createdAt.getTime() + span / 2;
  return now.getTime() >= midpoint;
}

type WaitlistRow = {
  id: string;
  email: string;
  artist_name: string | null;
  created_at: string;
  welcome_sent_at: string | null;
  mid_reminder_sent_at: string | null;
  launch_eve_sent_at: string | null;
};

async function sendBatch(
  admin: ReturnType<typeof createClient>,
  rows: WaitlistRow[],
  kind: WaitlistEmailKind,
  mailCfg: ReturnType<typeof loadMailConfig>,
  resendKey: string,
  column: "welcome_sent_at" | "mid_reminder_sent_at" | "launch_eve_sent_at"
): Promise<string[]> {
  const sentIds: string[] = [];
  for (const row of rows) {
    const content = buildWaitlistEmail(kind, mailCfg, {
      email: row.email,
      artistName: row.artist_name
    });
    const result = await sendResendEmail({
      apiKey: resendKey,
      from: mailCfg.fromEmail,
      to: row.email,
      ...content
    });
    if (!result.ok) {
      console.error(`waitlist_${kind}_failed`, row.id, result.error);
      continue;
    }
    const { error } = await admin
      .from("waitlist")
      .update({ [column]: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      console.error(`waitlist_${kind}_stamp_failed`, row.id, error);
      continue;
    }
    sentIds.push(row.id);
  }
  return sentIds;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const cronSecret = Deno.env.get("WAITLIST_CRON_SECRET");
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!cronSecret || auth !== cronSecret) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json(503, { ok: false, error: "resend_not_configured" });
    }

    const admin = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );
    const mailCfg = loadMailConfig();
    const now = new Date();

    const { data: rows, error } = await admin
      .from("waitlist")
      .select(
        "id, email, artist_name, created_at, welcome_sent_at, mid_reminder_sent_at, launch_eve_sent_at"
      );

    if (error) {
      console.error("waitlist_cron_fetch", error);
      return json(500, { ok: false, error: "fetch_failed" });
    }

    const all = (rows ?? []) as WaitlistRow[];

    const welcomePending = all.filter((r) => !r.welcome_sent_at);
    const welcomeIds = await sendBatch(
      admin,
      welcomePending,
      "welcome",
      mailCfg,
      resendKey,
      "welcome_sent_at"
    );
    const welcomed = new Set([
      ...all.filter((r) => r.welcome_sent_at).map((r) => r.id),
      ...welcomeIds
    ]);

    const midCandidates = all.filter((r) => {
      if (!welcomed.has(r.id)) return false;
      if (r.mid_reminder_sent_at) return false;
      return isPastMidpoint(new Date(r.created_at), mailCfg.releaseAt, now);
    });

    const launchEveCandidates = isLaunchEveDay(now, mailCfg.releaseAt)
      ? all.filter((r) => welcomed.has(r.id) && !r.launch_eve_sent_at)
      : [];

    const midIds = await sendBatch(
      admin,
      midCandidates,
      "mid_reminder",
      mailCfg,
      resendKey,
      "mid_reminder_sent_at"
    );

    const eveIds = await sendBatch(
      admin,
      launchEveCandidates,
      "launch_eve",
      mailCfg,
      resendKey,
      "launch_eve_sent_at"
    );

    return json(200, {
      ok: true,
      welcome_pending: welcomePending.length,
      welcome_sent: welcomeIds.length,
      mid_candidates: midCandidates.length,
      mid_sent: midIds.length,
      launch_eve_candidates: launchEveCandidates.length,
      launch_eve_sent: eveIds.length,
      launch_eve_today: isLaunchEveDay(now, mailCfg.releaseAt)
    });
  } catch (e) {
    console.error("waitlist_cron_error", e);
    return json(500, { ok: false, error: "server_error" });
  }
});
