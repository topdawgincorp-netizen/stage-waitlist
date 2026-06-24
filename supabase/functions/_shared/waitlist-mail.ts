export type WaitlistEmailKind = "welcome" | "mid_reminder" | "launch_eve";

export type MailRecipient = {
  email: string;
  artistName?: string | null;
};

export type MailConfig = {
  releaseAt: Date;
  siteUrl: string;
  fromEmail: string;
  founderNote: string;
};

function displayName(r: MailRecipient): string {
  const n = r.artistName?.trim();
  return n || "there";
}

function formatReleaseDate(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function daysUntil(releaseAt: Date): number {
  const ms = releaseAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function buildWelcome(cfg: MailConfig, r: MailRecipient) {
  const name = displayName(r);
  const when = formatReleaseDate(cfg.releaseAt);
  const subject = "You're on the STĀGE list — doors open soon";
  const text = [
    `Hey ${name},`,
    "",
    "You're officially on the STĀGE early access list.",
    "",
    `RELEASE DATE: ${when}`,
    "",
    "WHAT HAPPENS NEXT",
    "- Your spot is locked. Early access unlocks for this email when doors open.",
    "- Sign in with this same email — your account will be ready for you.",
    "- Your exclusive founders gift is reserved and waiting at launch.",
    "",
    "A NOTE FROM THE FOUNDER",
    cfg.founderNote,
    "",
    `Stay close: ${cfg.siteUrl}`,
    "",
    "— STĀGE",
    "Questions? Reply to this email or write hello@stage-app.com"
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Segoe UI,sans-serif;background:#080810;color:#f4f3ff;padding:32px 20px;line-height:1.6;">
      <div style="max-width:520px;margin:0 auto;background:#15151f;border:1px solid rgba(167,139,250,.25);border-radius:16px;padding:28px 24px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#4dffb4;">STĀGE · Early access</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#fff;">You're on the list</h1>
        <p style="margin:0 0 20px;color:#a3a1c0;">Hey ${name}, your spot is locked. Here's what you need to know.</p>
        <div style="background:rgba(77,255,180,.08);border:1px solid rgba(77,255,180,.25);border-radius:12px;padding:14px 16px;margin-bottom:20px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#4dffb4;">Release date</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#fff;">${when}</p>
        </div>
        <p style="margin:0 0 12px;color:#f4f3ff;"><strong>Access at launch</strong><br/>Sign in with <strong>${r.email}</strong> when doors open — early access is tied to this email.</p>
        <p style="margin:0 0 12px;color:#f4f3ff;"><strong>Founders gift</strong><br/>Your exclusive reward is reserved and unlocks when STĀGE goes live.</p>
        <div style="border-left:3px solid #a78bfa;padding:12px 14px;margin:20px 0;background:rgba(167,139,250,.08);border-radius:0 10px 10px 0;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#a78bfa;">From the founder</p>
          <p style="margin:0;color:#e8e6ff;font-style:italic;">${cfg.founderNote}</p>
        </div>
        <p style="margin:0 0 20px;color:#a3a1c0;font-size:14px;">We'll send a reminder halfway to launch and again the day before doors open.</p>
        <a href="${cfg.siteUrl}" style="display:inline-block;background:linear-gradient(90deg,#a78bfa,#4dffb4);color:#04121a;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;">Visit the waitlist page</a>
      </div>
    </div>`;

  return { subject, text, html };
}

function buildMidReminder(cfg: MailConfig, r: MailRecipient) {
  const name = displayName(r);
  const left = daysUntil(cfg.releaseAt);
  const when = formatReleaseDate(cfg.releaseAt);
  const subject = "Halfway there — your STĀGE spot is still locked in";
  const text = [
    `Hey ${name},`,
    "",
    "Quick reminder — you're halfway to STĀGE launch.",
    "",
    `Doors open: ${when}`,
    left > 0 ? `That's about ${left} day(s) from now.` : "Launch is almost here.",
    "",
    "Your early access and founders gift are still reserved for this email.",
    "No action needed — we'll email you again the day before launch.",
    "",
    `— STĀGE · ${cfg.siteUrl}`
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Segoe UI,sans-serif;background:#080810;color:#f4f3ff;padding:32px 20px;">
      <div style="max-width:520px;margin:0 auto;background:#15151f;border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px 24px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f5c842;">STĀGE · Midway reminder</p>
        <h1 style="margin:0 0 12px;font-size:22px;color:#fff;">Halfway to launch</h1>
        <p style="margin:0 0 16px;color:#a3a1c0;">Hey ${name} — you're still on the list. Early access + founders gift reserved for <strong style="color:#fff;">${r.email}</strong>.</p>
        <p style="margin:0 0 8px;color:#4dffb4;font-weight:700;">${when}</p>
        <p style="margin:0;color:#a3a1c0;font-size:14px;">${left > 0 ? `About ${left} day(s) to go.` : "Launch is right around the corner."} We'll ping you again the day before doors open.</p>
      </div>
    </div>`;

  return { subject, text, html };
}

function buildLaunchEve(cfg: MailConfig, r: MailRecipient) {
  const name = displayName(r);
  const when = formatReleaseDate(cfg.releaseAt);
  const subject = "Tomorrow — STĀGE doors open for you";
  const text = [
    `Hey ${name},`,
    "",
    "Tomorrow is the day.",
    "",
    `STĀGE opens: ${when}`,
    "",
    "HOW TO GET IN",
    `- Use this email to sign in: ${r.email}`,
    "- Early access unlocks automatically for waitlist members.",
    "- Your founders gift will be waiting inside.",
    "",
    "Get sleep. Tomorrow you walk in like you own the room.",
    "",
    `— STĀGE · ${cfg.siteUrl}`
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Segoe UI,sans-serif;background:#080810;color:#f4f3ff;padding:32px 20px;">
      <div style="max-width:520px;margin:0 auto;background:#15151f;border:1px solid rgba(77,255,180,.28);border-radius:16px;padding:28px 24px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#4dffb4;">STĀGE · Launch eve</p>
        <h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Doors open tomorrow</h1>
        <p style="margin:0 0 16px;color:#a3a1c0;">Hey ${name} — launch is tomorrow.</p>
        <p style="margin:0 0 16px;color:#fff;font-weight:700;">${when}</p>
        <p style="margin:0 0 12px;color:#f4f3ff;">Sign in with <strong>${r.email}</strong>. Early access + founders gift unlock at launch.</p>
        <p style="margin:0;color:#a3a1c0;font-size:14px;">See you on the stage.</p>
      </div>
    </div>`;

  return { subject, text, html };
}

export function buildWaitlistEmail(
  kind: WaitlistEmailKind,
  cfg: MailConfig,
  recipient: MailRecipient
): { subject: string; text: string; html: string } {
  if (kind === "welcome") return buildWelcome(cfg, recipient);
  if (kind === "mid_reminder") return buildMidReminder(cfg, recipient);
  return buildLaunchEve(cfg, recipient);
}

export async function sendResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html
      })
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `resend_${res.status}:${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "resend_unknown" };
  }
}

export function loadMailConfig(): MailConfig {
  const releaseRaw =
    Deno.env.get("WAITLIST_RELEASE_AT") ?? "2026-09-18T19:00:00-04:00";
  const releaseAt = new Date(releaseRaw);
  if (Number.isNaN(releaseAt.getTime())) {
    throw new Error("invalid_WAITLIST_RELEASE_AT");
  }
  return {
    releaseAt,
    siteUrl: Deno.env.get("WAITLIST_SITE_URL") ??
      "https://topdawgincorp-netizen.github.io/stage-waitlist/",
    fromEmail: Deno.env.get("RESEND_FROM_EMAIL") ??
      "STĀGE <onboarding@resend.dev>",
    founderNote: Deno.env.get("WAITLIST_FOUNDER_NOTE") ??
      "We built STĀGE because the industry was never built for artists like us. You're not just on a list — you're in the room before the doors open. — The STĀGE Team"
  };
}
