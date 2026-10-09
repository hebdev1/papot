-- What a transport company declares when it applies.
--
-- It cannot borrow another vertical's slots: `fleet_size` is locked to cars by
-- fleet_only_on_cars, `seats_capacity` to restaurants by
-- seats_only_on_restaurants, and the whole daily/weekly/monthly block to cars by
-- car_pricing_only_on_cars. A bus company's numbers are a list of coaches and a
-- list of routes, so they are child tables, and the one genuinely new scalar is
-- the set of cities it serves.
--
-- Nothing redundant: the number of coaches is `count(*)` over the children, and
-- years in business is the existing `year_established`. A second copy of either
-- is a second answer waiting to disagree with the first.
alter table public.partner_applications
  add column cities_served text[] not null default '{}';

alter table public.partner_applications
  add constraint cities_served_only_on_bus
  check (type = 'bus' or cardinality(cities_served) = 0);

-- A coach, as the company describes it before anyone has approved anything.
-- `label` is what they call it ("Autocar 52 places", "Bus 3"); `seats` is the
-- only figure that must be there, because it becomes capacity and capacity
-- cannot be guessed. Make, model and year are optional: a company that does not
-- fill them gets a coach with no specification rather than an invented one.
create table public.partner_application_coaches (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.partner_applications(id) on delete cascade,
  label          text not null,
  seats          smallint not null check (seats between 1 and 120),
  seat_pattern   public.bus_seat_pattern not null default '2+2',
  coach_type     text,
  make           text,
  model          text,
  year           smallint check (year is null or year between 1950 and 2100),
  plate          text,
  position       smallint not null default 0
);

create index partner_application_coaches_app_idx
  on public.partner_application_coaches (application_id, position);

-- A route, as declared. The fare and the duration are required because both
-- become published facts a passenger buys on: a route with no fare cannot be
-- priced, and one with no duration cannot say when it arrives. Departure times
-- are optional — a company that leaves them empty gets a published route and
-- builds its timetable in the dashboard, which is the honest outcome of an
-- application form that did not ask.
create table public.partner_application_routes (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references public.partner_applications(id) on delete cascade,
  origin_city      text not null,
  destination_city text not null,
  -- Intermediate stop towns, in order, as free text. They become gares.
  stops            text[] not null default '{}',
  duration_minutes smallint not null check (duration_minutes between 5 and 2880),
  fare             numeric(10,2) not null check (fare >= 0),
  -- 'HH:MM' local clock times, e.g. {06:00,14:00}.
  departures       text[] not null default '{}',
  -- 0 = Monday, as everywhere else in this schema.
  weekdays         smallint[] not null default array[0,1,2,3,4,5,6]::smallint[]
    check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  position         smallint not null default 0,
  check (origin_city <> destination_city)
);

create index partner_application_routes_app_idx
  on public.partner_application_routes (application_id, position);

/**
 * Coaches and routes belong to a transport application.
 *
 * The same guard the other two verticals have (assert_lodging_application,
 * assert_car_application): the child table has no idea what type its parent is,
 * so without this a restaurant application could arrive carrying a timetable.
 */
create or replace function public.assert_bus_application()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type public.partner_type;
begin
  select type into v_type from public.partner_applications where id = new.application_id;
  if v_type <> 'bus' then
    raise exception 'Les autocars et les itinéraires ne s''appliquent qu''au transport (type: %).', v_type;
  end if;
  return new;
end;
$$;

create trigger coaches_type_guard
  before insert or update on public.partner_application_coaches
  for each row execute function public.assert_bus_application();

create trigger routes_type_guard
  before insert or update on public.partner_application_routes
  for each row execute function public.assert_bus_application();

alter table public.partner_application_coaches enable row level security;
alter table public.partner_application_routes enable row level security;

-- Read is staff's, exactly as for rooms and vehicles. Writing is
-- submit_partner_application's, which runs as the owner.
create policy app_coaches_staff_read on public.partner_application_coaches
  for select to authenticated using (admin_can('view_partners'));

create policy app_routes_staff_read on public.partner_application_routes
  for select to authenticated using (admin_can('view_partners'));

grant select on public.partner_application_coaches,
                public.partner_application_routes to authenticated;

revoke insert, update, delete on public.partner_application_coaches,
                                 public.partner_application_routes from authenticated;;
