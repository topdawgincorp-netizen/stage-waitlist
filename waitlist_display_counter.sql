-- Synthetic ticker: max 100/day, max 4/hour, max 3/30min, +1 only, irregular gaps.

alter table public.waitlist_display_state
  add column if not exists last_tick_at timestamptz,
  add column if not exists tick_hour smallint,
  add column if not exists hour_applied int not null default 0,
  add column if not exists window_30_start timestamptz,
  add column if not exists window_30_count int not null default 0;

create or replace function public._waitlist_day_cap(p_day date)
returns int
language sql
immutable
as $$
  select least(100, 55 + (abs(hashtext(p_day::text)) % 46));
$$;

create or replace function public._waitlist_tick_gap_minutes(p_day date, p_now timestamptz)
returns int
language plpgsql
immutable
as $$
declare
  h int := extract(hour from p_now at time zone 'utc')::int;
  m int := extract(minute from p_now at time zone 'utc')::int;
  slot int;
  raw int;
begin
  slot := (h * 7 + floor(m / 7)::int + (abs(hashtext(p_day::text)) % 5)) % 17;
  raw := abs(hashtext(p_day::text || ':t:' || slot::text || ':' || h::text || ':' || m::text));
  if slot in (3, 9, 14) then
    return 14 + (raw % 12);
  elsif slot in (1, 7, 12) then
    return 18 + (raw % 13);
  else
    return 11 + (raw % 10);
  end if;
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
  mins_since numeric;
  gap int;
  day_cap int;
  curr_hour int;
  added int := 0;
  can_tick boolean := false;
begin
  select * into st from public.waitlist_display_state where id = 1 for update;
  if not found then
    insert into public.waitlist_display_state (id, seed_base) values (1, 2400)
    returning * into st;
  end if;

  day_cap := public._waitlist_day_cap(today);

  if st.state_date is distinct from today then
    update public.waitlist_display_state
    set state_date = today,
        day_target = day_cap,
        day_applied = 0,
        hour_applied = 0,
        tick_hour = null,
        window_30_start = null,
        window_30_count = 0,
        updated_at = now()
    where id = 1
    returning * into st;
  elsif st.day_target = 0 then
    update public.waitlist_display_state
    set day_target = day_cap, state_date = today, updated_at = now()
    where id = 1
    returning * into st;
  end if;

  curr_hour := extract(hour from now() at time zone 'utc')::int;
  if st.tick_hour is distinct from curr_hour then
    update public.waitlist_display_state
    set tick_hour = curr_hour, hour_applied = 0, updated_at = now()
    where id = 1
    returning * into st;
  end if;

  if st.window_30_start is null
     or (now() - st.window_30_start) >= interval '30 minutes' then
    update public.waitlist_display_state
    set window_30_start = now(), window_30_count = 0, updated_at = now()
    where id = 1
    returning * into st;
  end if;

  gap := public._waitlist_tick_gap_minutes(today, now());
  mins_since := extract(epoch from (now() - coalesce(st.last_tick_at, now() - interval '1 day'))) / 60.0;

  can_tick := st.day_applied < least(st.day_target, 100)
    and st.hour_applied < 4
    and st.window_30_count < 3
    and mins_since >= gap;

  if can_tick then
    update public.waitlist_display_state
    set synthetic_total = synthetic_total + 1,
        day_applied = day_applied + 1,
        hour_applied = hour_applied + 1,
        window_30_count = window_30_count + 1,
        last_tick_at = now(),
        updated_at = now()
    where id = 1
    returning * into st;
    added := 1;
  end if;

  select count(*)::bigint into real_count from public.waitlist;

  return jsonb_build_object(
    'display', st.seed_base + st.synthetic_total + real_count,
    'real', real_count,
    'synthetic', st.synthetic_total,
    'seed', st.seed_base,
    'added', added
  );
end;
$$;

revoke all on function public.waitlist_display_count() from public;
grant execute on function public.waitlist_display_count() to anon;
