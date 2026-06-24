# Waitlist automated emails

Three automated emails for STĀGE waitlist signups:

| Email | When | Content |
|-------|------|---------|
| **Welcome** | Immediately after successful signup | Release date, access instructions (sign in with signup email), founders gift, founder note |
| **Mid reminder** | Once per user, halfway between their signup and release | Countdown + gift still reserved |
| **Launch eve** | Calendar day before release (all waitlist members) | Tomorrow doors open + how to get in |

Powered by **Supabase Edge Functions** + **Resend** (same provider used in the main STAGE app).

---

## 1. Run the SQL migration

In the **waitlist Supabase project** (`ktpyltvdxhnfquorrdsi`) → SQL Editor:

1. Run `waitlist_setup.sql` (if not already)
2. Run `waitlist_email_setup.sql`

This adds `welcome_sent_at`, `mid_reminder_sent_at`, `launch_eve_sent_at` columns and a `waitlist_email_config` row for the release date.

Update release date if needed:

```sql
update public.waitlist_email_config
set release_at = '2026-09-18 23:00:00+00', updated_at = now()
where id = 1;
```

---

## 2. Resend setup

1. Create / use your [Resend](https://resend.com) account
2. **Verify a sending domain** (e.g. `stage-app.com`) — required for production
3. Create an API key with **Send** permission

---

## 3. Deploy Edge Functions

From this repo (with [Supabase CLI](https://supabase.com/docs/guides/cli) linked to the waitlist project):

```bash
cd stage-waitlist
supabase link --project-ref ktpyltvdxhnfquorrdsi
supabase functions deploy waitlist-signup
supabase functions deploy waitlist-email-cron
```

### Secrets (Dashboard → Edge Functions → Secrets)

| Secret | Example | Required |
|--------|---------|----------|
| `RESEND_API_KEY` | `re_...` | Yes |
| `RESEND_FROM_EMAIL` | `STĀGE <hello@stage-app.com>` | Yes (verified domain) |
| `WAITLIST_RELEASE_AT` | `2026-09-18T19:00:00-04:00` | Yes |
| `WAITLIST_SITE_URL` | `https://topdawgincorp-netizen.github.io/stage-waitlist/` | Optional |
| `WAITLIST_FOUNDER_NOTE` | Your personal message (plain text) | Optional |
| `WAITLIST_CRON_SECRET` | Long random string | Yes (cron only) |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for Edge Functions.

---

## 4. Schedule reminder emails (daily cron)

The `waitlist-email-cron` function must run **once per day** (e.g. 10:00 AM Eastern).

### Option A — Supabase Cron (recommended)

Dashboard → **Edge Functions** → `waitlist-email-cron` → **Schedules** → add:

- Cron: `0 15 * * *` (15:00 UTC ≈ 10:00 AM ET)
- HTTP POST with header: `Authorization: Bearer <WAITLIST_CRON_SECRET>`

### Option B — GitHub Actions

Add a workflow that POSTs daily:

```yaml
curl -X POST \
  -H "Authorization: Bearer ${{ secrets.WAITLIST_CRON_SECRET }}" \
  https://ktpyltvdxhnfquorrdsi.supabase.co/functions/v1/waitlist-email-cron
```

### Option C — pg_cron + pg_net

Enable extensions in Supabase SQL editor and schedule `net.http_post` to the function URL with the bearer secret.

---

## 5. Landing page

`index.html` calls `waitlist-signup` instead of inserting directly. After deploy, new signups trigger the welcome email automatically.

Duplicate emails (same address twice) still show success but **do not** resend welcome if already sent.

---

## 6. Test checklist

1. Sign up with a real inbox → welcome email within ~1 min
2. Check `waitlist.welcome_sent_at` is set
3. Manually invoke cron (POST with secret) → `mid_sent` / `launch_eve_sent` in JSON response
4. For launch-eve test: temporarily set `WAITLIST_RELEASE_AT` to tomorrow in secrets, run cron, confirm email

---

## Customizing copy

- **Founder note:** set `WAITLIST_FOUNDER_NOTE` secret (no HTML — plain text)
- **Email templates:** edit `supabase/functions/_shared/waitlist-mail.ts`
- **Release date on site:** keep `TARGET_DATE` in `index.html` in sync with `WAITLIST_RELEASE_AT`
