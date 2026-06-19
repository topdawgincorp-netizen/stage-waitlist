-- STAGE waitlist backend (dedicated pre-registration store)
-- Public: anon can INSERT only. No anon SELECT — emails stay private until launch.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  phone text,
  artist_name text,
  role text,
  goals text[],
  feature_suggestion text,
  heard_from text,
  location text,
  referral_source text,
  account_status text not null default 'preregistered'
    check (account_status in ('preregistered', 'invited', 'activated')),
  constraint waitlist_email_unique unique (email)
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);
create index if not exists waitlist_account_status_idx on public.waitlist (account_status);

alter table public.waitlist enable row level security;

drop policy if exists "anyone can join the waitlist" on public.waitlist;
create policy "anyone can join the waitlist"
  on public.waitlist for insert to anon
  with check (
    email is not null
    and length(trim(email)) > 3
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and account_status = 'preregistered'
  );

-- Public signup counter only (no row data exposed)
create or replace function public.waitlist_count()
  returns bigint
  language sql
  security definer
  set search_path = public
as $$
  select count(*)::bigint from public.waitlist;
$$;

revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon;
