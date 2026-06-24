-- Waitlist automated emails (welcome, mid-campaign, launch eve)
-- Run in the waitlist Supabase project SQL editor after waitlist_setup.sql

alter table public.waitlist
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists mid_reminder_sent_at timestamptz,
  add column if not exists launch_eve_sent_at timestamptz;

create index if not exists waitlist_welcome_pending_idx
  on public.waitlist (created_at)
  where welcome_sent_at is null;

create index if not exists waitlist_mid_pending_idx
  on public.waitlist (created_at)
  where mid_reminder_sent_at is null and welcome_sent_at is not null;

create index if not exists waitlist_launch_eve_pending_idx
  on public.waitlist (created_at)
  where launch_eve_sent_at is null and welcome_sent_at is not null;

-- Single-row config (release date drives reminder scheduling)
create table if not exists public.waitlist_email_config (
  id smallint primary key default 1 check (id = 1),
  release_at timestamptz not null default '2026-09-18 23:00:00+00',
  updated_at timestamptz not null default now()
);

insert into public.waitlist_email_config (id, release_at)
values (1, '2026-09-18 23:00:00+00')
on conflict (id) do nothing;

alter table public.waitlist_email_config enable row level security;

-- No public access; edge functions use service role
revoke all on table public.waitlist_email_config from anon, authenticated;

comment on column public.waitlist.welcome_sent_at is 'Immediate confirmation email after signup';
comment on column public.waitlist.mid_reminder_sent_at is 'Sent once user passes midpoint between signup and release';
comment on column public.waitlist.launch_eve_sent_at is 'Sent on the calendar day before release_at';
