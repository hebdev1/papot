-- The timetable, and the dated departures it produces.
--
-- Two different things, deliberately two tables. A schedule is the company's
-- intent — "Monday to Saturday, 06:00 and 14:00, from the 1st of November" — and
-- a departure is one actual coach leaving on one actual morning. A ticket is
-- always sold against the departure, never against the intent, because a
-- Tuesday in December can be delayed, re-assigned to another coach or cancelled
-- without touching the other three hundred Tuesdays.
--
-- Times are a local clock time plus a duration in minutes, never a timestamptz.
-- Haiti observes daylight saving (US rules), so a stored absolute instant for
-- "the 06:00 bus" is wrong for part of the year, and an arrival after midnight
-- needs no date arithmetic when it is an offset.
create table public.bus_schedules (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  coach_id   uuid not null references public.bus_coaches(id) on delete restrict,
  -- 0 = Monday, matching listing_rates.weekdays and restaurant_hours.weekday.
  weekdays   smallint[] not null
    check (cardinality(weekdays) between 1 and 7
           and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  departs_at time not null,
  duration_minutes smallint not null check (duration_minutes between 5 and 2880),
  starts_on  date not null,
  -- Open-ended by default: most companies run a timetable until they change it.
  ends_on    date,
  -- A seasonal fare. Null means "the annonce's price", which is the one fare
  -- source — see bus_departures.fare.
  fare       numeric(10,2) check (fare is null or fare >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index bus_schedules_listing_idx on public.bus_schedules (listing_id, active);

create type public.bus_departure_status as enum
  ('scheduled', 'boarding', 'departed', 'delayed', 'arrived', 'cancelled', 'completed');

create table public.bus_departures (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  -- Null for a one-off departure a company adds by hand (a holiday extra).
  schedule_id uuid references public.bus_schedules(id) on delete set null,
  coach_id    uuid not null references public.bus_coaches(id) on delete restrict,
  departs_on  date not null,
  departs_at  time not null,
  duration_minutes smallint not null check (duration_minutes between 5 and 2880),
  -- Copied from the coach at creation, not read through it: a company that
  -- swaps a 52-seat coach for a 30-seat one must not retroactively oversell
  -- every departure already on sale.
  seats_total smallint not null check (seats_total between 1 and 120),
  -- The fare actually charged, when it differs from the annonce's price. Null
  -- is the normal case and means `listings.price` — one fare source, so the
  -- figure shown and the figure charged cannot part company.
  fare        numeric(10,2) check (fare is null or fare >= 0),
  status      public.bus_departure_status not null default 'scheduled',
  delayed_to  time,
  delay_reason text,
  created_at  timestamptz not null default now(),
  -- A schedule produces each date at most once, which is what makes
  -- bus_materialize_departures safe to run again.
  unique (schedule_id, departs_on),
  -- And a company cannot publish the same route twice at the same minute,
  -- whether by schedule or by hand.
  unique (listing_id, departs_on, departs_at)
);

create index bus_departures_route_day_idx on public.bus_departures (listing_id, departs_on);
create index bus_departures_day_idx on public.bus_departures (departs_on, status);

/**
 * A departure's coach belongs to the same company as its route.
 *
 * Same reasoning as bus_route_stops_same_company: no foreign key reaches from
 * the coach to the annonce's partner, and a departure on someone else's coach
 * would put that company's capacity on sale.
 */
create or replace function public.bus_departure_is_self_consistent()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing_partner uuid;
  v_coach_partner   uuid;
  v_kind public.listing_kind;
begin
  select l.partner_id, l.kind into v_listing_partner, v_kind
    from public.listings l where l.id = new.listing_id;

  if v_kind is distinct from 'bus' then
    raise exception 'Seule une annonce de transport peut avoir des départs.'
      using errcode = '23514';
  end if;

  select c.partner_id into v_coach_partner
    from public.bus_coaches c where c.id = new.coach_id;

  if v_listing_partner is distinct from v_coach_partner then
    raise exception 'Ce véhicule appartient à une autre entreprise.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger bus_departures_same_company
  before insert or update of listing_id, coach_id on public.bus_departures
  for each row execute function public.bus_departure_is_self_consistent();

create trigger bus_schedules_same_company
  before insert or update of listing_id, coach_id on public.bus_schedules
  for each row execute function public.bus_departure_is_self_consistent();

alter table public.bus_schedules enable row level security;
alter table public.bus_departures enable row level security;

-- A timetable is published knowledge; the company's draft is not.
create policy bus_schedules_public_read on public.bus_schedules
  for select to anon, authenticated
  using (active and exists (select 1 from public.listings l
                             where l.id = listing_id and l.kind = 'bus' and l.published));

create policy bus_schedules_partner_read on public.bus_schedules
  for select to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id
                    and (l.partner_id in (select my_partner_ids())
                      or admin_can('view_listings'))));

create policy bus_schedules_partner_write on public.bus_schedules
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_departures')))
  with check (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_departures')));

-- A cancelled departure stays readable: a passenger holding a ticket for it
-- must be able to see that it was cancelled, not find an empty page.
create policy bus_departures_public_read on public.bus_departures
  for select to anon, authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and l.kind = 'bus' and l.published));

create policy bus_departures_partner_read on public.bus_departures
  for select to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id
                    and (l.partner_id in (select my_partner_ids())
                      or admin_can('view_bookings'))));

create policy bus_departures_partner_write on public.bus_departures
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_departures')))
  with check (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_departures')));;
