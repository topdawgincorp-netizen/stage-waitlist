-- Persistent display counter: seed + synthetic (fake ticker) + real signups
-- Synthetic advances 25–100/day (irregular), stored server-side so refresh never resets.

create table if not exists public.waitlist_display_state (
  id smallint primary key default 1 check (id = 1),
  seed_base bigint not null default 2400,
  synthetic_total bigint not null default 0,
  state_date date,
  day_target int not null default 0,
  day_applied int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.waitlist_display_state (id, seed_base)
values (1, 2400)
on conflict (id) do nothing;

alter table public.waitlist_display_state enable row level security;
-- No public policies: only security definer functions touch this table.

create or replace function public._waitlist_day_target(p_day date)
returns int
language sql
immutable
as $$
  select 25 + (abs(hashtext(p_day::text)) % 76);
$$;

create or replace function public._waitlist_day_progress(p_day date, p_now timestamptz)
returns numeric
language plpgsql
immutable
as $$
declare
  secs numeric;
  base numeric;
  h int;
  bump numeric;
begin
  secs := extract(epoch from (p_now at time zone 'utc' - (p_day::timestamp at time zone 'utc')));
  if secs <= 0 then return 0; end if;
  if secs >= 86400 then return 1; end if;
  base := secs / 86400.0;
  h := extract(hour from p_now at time zone 'utc')::int;
  bump := (abs(hashtext(p_day::text || ':' || h::text)) % 17)::numeric / 100.0;
  return least(1.0, base * 0.82 + bump + 0.04);
end;
$$;

create or replace function public.waitlist_display_count()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.waitlist_display_state%rowtype;
  today date := (now() at time zone 'utc')::date;
  real_count bigint;
  should_applied int;
  delta int;
  progress numeric;
begin
  select * into st from public.waitlist_display_state where id = 1 for update;
  if not found then
    insert into public.waitlist_display_state (id, seed_base) values (1, 2400)
    returning * into st;
  end if;

  if st.state_date is distinct from today then
    update public.waitlist_display_state
    set state_date = today,
        day_target = public._waitlist_day_target(today),
        day_applied = 0,
        updated_at = now()
    where id = 1
    returning * into st;
  elsif st.day_target = 0 then
    update public.waitlist_display_state
    set day_target = public._waitlist_day_target(today),
        state_date = today,
        updated_at = now()
    where id = 1
    returning * into st;
  end if;

  progress := public._waitlist_day_progress(today, now());
  should_applied := floor(st.day_target * progress)::int;
  delta := greatest(0, should_applied - st.day_applied);

  if delta > 0 then
    update public.waitlist_display_state
    set synthetic_total = synthetic_total + delta,
        day_applied = day_applied + delta,
        updated_at = now()
    where id = 1
    returning * into st;
  end if;

  select count(*)::bigint into real_count from public.waitlist;

  return jsonb_build_object(
    'display', st.seed_base + st.synthetic_total + real_count,
    'real', real_count,
    'synthetic', st.synthetic_total,
    'seed', st.seed_base
  );
end;
$$;

revoke all on function public.waitlist_display_count() from public;
grant execute on function public.waitlist_display_count() to anon;

-- Legacy helper: real signups only (admin / internal)
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
