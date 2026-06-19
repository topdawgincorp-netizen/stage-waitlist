-- Persistent display counter: seed + synthetic (fake ticker) + real signups
-- Synthetic: 25–100/day, ~1–2/hour, irregular 15–30 min gaps, +1–3 per poll when catching up.

alter table public.waitlist_display_state
  add column if not exists last_tick_at timestamptz,
  add column if not exists tick_hour smallint,
  add column if not exists hour_applied int not null default 0;

create or replace function public._waitlist_day_target(p_day date)
returns int
language sql
immutable
as $$
  select 25 + (abs(hashtext(p_day::text)) % 76);
$$;

-- Synthetic: 25–100/day, 1–3/hour, asymmetric 15–30 min gaps.

create or replace function public._waitlist_tick_gap_minutes(p_day date, p_now timestamptz)
returns int
language plpgsql
immutable
as $$
declare
  h int := extract(hour from p_now at time zone 'utc')::int;
  m int := extract(minute from p_now at time zone 'utc')::int;
  bucket int;
  raw int;
begin
  bucket := (h * 5 + floor(m / 11)::int + (abs(hashtext(p_day::text)) % 7)) % 12;
  raw := abs(hashtext(p_day::text || ':g:' || bucket::text || ':' || h::text));
  if bucket in (2, 5, 9) then
    return 16 + (raw % 15);
  elsif bucket in (0, 7, 11) then
    return 15 + (raw % 9);
  else
    return 22 + (raw % 9);
  end if;
end;
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
  bump := (abs(hashtext(p_day::text || ':' || h::text)) % 13)::numeric / 100.0;
  return least(1.0, base * 0.78 + bump + 0.06);
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
  progress numeric;
  target_applied int;
  batch int;
  mins_since numeric;
  gap int;
  to_add int;
  added int := 0;
  curr_hour int;
  hour_quota int;
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
        hour_applied = 0,
        tick_hour = null,
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

  curr_hour := extract(hour from now() at time zone 'utc')::int;
  hour_quota := 1 + (abs(hashtext(today::text || ':' || curr_hour::text)) % 3);

  if st.tick_hour is distinct from curr_hour then
    update public.waitlist_display_state
    set tick_hour = curr_hour, hour_applied = 0, updated_at = now()
    where id = 1
    returning * into st;
  end if;

  progress := public._waitlist_day_progress(today, now());
  target_applied := floor(st.day_target * progress)::int;
  batch := greatest(0, target_applied - st.day_applied);

  if batch > 0 and st.hour_applied < hour_quota then
    gap := public._waitlist_tick_gap_minutes(today, now());
    mins_since := extract(epoch from (now() - coalesce(st.last_tick_at, now() - interval '2 days'))) / 60.0;

    if mins_since >= gap then
      if mins_since >= 28 then
        to_add := least(batch, hour_quota - st.hour_applied, 3);
      else
        to_add := 1;
      end if;

      update public.waitlist_display_state
      set synthetic_total = synthetic_total + to_add,
          day_applied = day_applied + to_add,
          hour_applied = hour_applied + to_add,
          last_tick_at = now(),
          updated_at = now()
      where id = 1
      returning * into st;

      added := to_add;
    end if;
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
