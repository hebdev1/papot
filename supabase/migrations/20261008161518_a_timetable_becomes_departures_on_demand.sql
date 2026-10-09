-- Turning a timetable into dated departures, and the two rules that keep it safe.
--
-- There is no scheduler on this project: pg_cron and pg_net are available but
-- not installed. So departures are materialised on the partner's own save path,
-- within a bounded horizon, and the public search never writes. Calling a
-- SECURITY DEFINER inserter from a function `anon` can reach would re-open
-- exactly the hole AGENTS.md records for create_booking — a loop over dates
-- filling the table — and the lock that stops double-selling is what would give
-- that its teeth.
--
-- The horizon is a ceiling, not a promise: a company publishes three months,
-- extends when it wants to, and its Départs screen says how far it has gone.
-- Nothing beyond the horizon is for sale, which is the honest answer to "do you
-- run in March?" when the company has not said yet.
create or replace function public.bus_materialize_departures(
  p_schedule uuid,
  p_from     date,
  p_to       date
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s        public.bus_schedules;
  v_coach  public.bus_coaches;
  v_day    date;
  v_made   integer := 0;
  -- A hard ceiling, independent of what the caller asks for. A year of
  -- departures for one schedule is already 365 rows and 19 000 seats.
  v_ceiling constant integer := 365;
begin
  select * into s from public.bus_schedules where id = p_schedule;
  if s.id is null then
    raise exception 'Cet horaire n''existe plus.' using errcode = 'P0002';
  end if;
  if not s.active then
    return 0;   -- a paused schedule produces nothing, and says so by producing nothing
  end if;

  select * into v_coach from public.bus_coaches where id = s.coach_id;
  if v_coach.id is null then
    raise exception 'Le véhicule de cet horaire n''existe plus.' using errcode = 'P0002';
  end if;
  if v_coach.status <> 'active' then
    raise exception 'Le véhicule % n''est pas en service : remplacez-le avant de publier.',
      v_coach.fleet_no;
  end if;

  -- Never behind today, never before the schedule starts, never past its end,
  -- never past the ceiling. A past departure cannot be sold and a departure
  -- outside the season was never offered.
  p_from := greatest(coalesce(p_from, current_date), s.starts_on, current_date);
  p_to   := least(coalesce(p_to, current_date), current_date + v_ceiling);
  if s.ends_on is not null then
    p_to := least(p_to, s.ends_on);
  end if;
  if p_to < p_from then
    return 0;
  end if;

  for v_day in select d::date from generate_series(p_from, p_to, interval '1 day') d loop
    -- 0 = Monday, matching bus_schedules.weekdays and the rest of the schema.
    -- isodow gives 1 for Monday, hence the shift.
    if (extract(isodow from v_day)::int - 1) = any (s.weekdays) then
      insert into public.bus_departures
        (listing_id, schedule_id, coach_id, departs_on, departs_at,
         duration_minutes, seats_total, fare)
      values
        (s.listing_id, s.id, s.coach_id, v_day, s.departs_at,
         s.duration_minutes, v_coach.seat_capacity, s.fare)
      -- Two unique keys guard this: (schedule_id, departs_on) makes a re-run
      -- idempotent, and (listing_id, departs_on, departs_at) means a one-off
      -- departure the company added by hand is left alone rather than doubled.
      on conflict do nothing;
      if found then
        v_made := v_made + 1;
      end if;
    end if;
  end loop;

  return v_made;
end;
$$;

-- Internal: reachable only through bus_publish_timetable, which checks the
-- capability first. Half a lock is no lock.
revoke all on function public.bus_materialize_departures(uuid, date, date)
  from public, anon, authenticated;

/**
 * Publish, or extend, a route's timetable.
 *
 * The one action behind the "Publier l'horaire" button: every active schedule of
 * the route is expanded up to `p_until`, default three months out. Safe to press
 * twice — the unique keys make each date appear once — so "extend" and
 * "publish" are the same operation and the company never has to reason about
 * which it is doing.
 */
create or replace function public.bus_publish_timetable(
  p_listing uuid,
  p_until   date default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_partner uuid;
  v_kind    public.listing_kind;
  v_until   date;
  v_sched   uuid;
  v_schedules integer := 0;
  v_created integer := 0;
begin
  select l.partner_id, l.kind into v_partner, v_kind
    from public.listings l where l.id = p_listing;
  if v_kind is null then
    raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
  end if;
  if v_kind <> 'bus' then
    raise exception 'Seule une annonce de transport a un horaire.' using errcode = '22023';
  end if;
  if not (public.partner_can(v_partner, 'manage_departures')
          or public.admin_can('moderate_listings')) then
    raise exception 'Vous ne pouvez pas publier cet horaire.' using errcode = '42501';
  end if;

  v_until := least(coalesce(p_until, current_date + 90), current_date + 365);

  for v_sched in
    select id from public.bus_schedules
     where listing_id = p_listing and active
     order by departs_at
  loop
    v_schedules := v_schedules + 1;
    v_created := v_created + public.bus_materialize_departures(v_sched, current_date, v_until);
  end loop;

  return jsonb_build_object(
    'schedules', v_schedules,
    'created',   v_created,
    'horizon',   (select max(departs_on) from public.bus_departures
                   where listing_id = p_listing));
end;
$$;

revoke all on function public.bus_publish_timetable(uuid, date) from public, anon;
grant execute on function public.bus_publish_timetable(uuid, date) to authenticated;

/**
 * How far a route is actually on sale.
 *
 * The Départs screen opens on this. A company whose horizon is eleven days away
 * needs to be told, not left to notice in a month that it stopped selling.
 */
create or replace function public.bus_timetable_status(p_listing uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_partner uuid;
begin
  select l.partner_id into v_partner from public.listings l
   where l.id = p_listing and l.kind = 'bus';
  if v_partner is null then
    return null;
  end if;
  if not (public.partner_can(v_partner, 'view_reservations')
          or public.admin_can('view_bookings')) then
    return null;   -- indistinguishable from "no such route", as get_booking does
  end if;

  return jsonb_build_object(
    'schedules',       (select count(*) from public.bus_schedules
                         where listing_id = p_listing and active),
    'departures',      (select count(*) from public.bus_departures
                         where listing_id = p_listing and departs_on >= current_date
                           and status <> 'cancelled'),
    'horizon',         (select max(departs_on) from public.bus_departures
                         where listing_id = p_listing and status <> 'cancelled'),
    'days_published',  (select greatest((max(departs_on) - current_date), 0)
                         from public.bus_departures
                        where listing_id = p_listing and status <> 'cancelled'),
    'next_departure',  (select jsonb_build_object('on', d.departs_on, 'at', d.departs_at)
                          from public.bus_departures d
                         where d.listing_id = p_listing and d.departs_on >= current_date
                           and d.status <> 'cancelled'
                         order by d.departs_on, d.departs_at limit 1),
    'seats_sold',      (select count(*) from public.bus_departure_seats s
                          join public.bus_departures d on d.id = s.departure_id
                         where d.listing_id = p_listing and d.departs_on >= current_date
                           and s.booking_item_id is not null));
end;
$$;

revoke all on function public.bus_timetable_status(uuid) from public, anon;
grant execute on function public.bus_timetable_status(uuid) to authenticated;

/**
 * A departure cannot put more seats on sale than the coach has.
 *
 * Fewer is legitimate and common — a company keeps a row back for passengers
 * who pay at the gare — so only the upper bound is enforced. Without it a typo
 * in the seats field sells a seat that does not exist, and the passenger finds
 * out while standing in the aisle.
 */
create or replace function public.bus_departure_is_self_consistent()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing_partner uuid;
  v_coach_partner   uuid;
  v_capacity        smallint;
  v_kind public.listing_kind;
begin
  select l.partner_id, l.kind into v_listing_partner, v_kind
    from public.listings l where l.id = new.listing_id;

  if v_kind is distinct from 'bus' then
    raise exception 'Seule une annonce de transport peut avoir des départs.'
      using errcode = '23514';
  end if;

  select c.partner_id, c.seat_capacity into v_coach_partner, v_capacity
    from public.bus_coaches c where c.id = new.coach_id;

  if v_listing_partner is distinct from v_coach_partner then
    raise exception 'Ce véhicule appartient à une autre entreprise.'
      using errcode = '23514';
  end if;

  -- bus_schedules shares this trigger and has no seats_total.
  if to_jsonb(new) ? 'seats_total' and new.seats_total > v_capacity then
    raise exception 'Ce véhicule n''a que % places.', v_capacity
      using errcode = '23514';
  end if;

  return new;
end;
$$;;
