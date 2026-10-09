-- The two things a transport company owns before it owns a timetable: coaches
-- and the gares they leave from.
--
-- Neither is public. A plate number and a fleet number are the company's
-- business, and the passenger-facing surface (bus_search, bus_departure_detail)
-- is SECURITY DEFINER and hands out only what a traveller needs — the coach
-- type and its amenities, never the plate. A gare is different: its address,
-- hours and "arrive 30 minutes early" are exactly what a passenger must read,
-- so it is readable once the company has a published route.
create type public.bus_coach_status as enum
  ('active', 'maintenance', 'out_of_service', 'archived');

create type public.bus_seat_pattern as enum ('2+2', '2+1', '1+1', 'custom');

create table public.bus_coaches (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners(id) on delete cascade,
  fleet_no      text not null,
  plate         text,
  make          text,
  model         text,
  year          smallint check (year is null or year between 1950 and 2100),
  coach_type    text,
  seat_capacity smallint not null check (seat_capacity between 1 and 120),
  seat_pattern  public.bus_seat_pattern not null default '2+2',
  amenities     text[] not null default '{}',
  -- Storage paths, never URLs: the photos a company uploads during onboarding
  -- land in a private bucket, and a path that cannot be rendered is better than
  -- a URL that 404s on a public card. Same rule as build_partner_listings.
  photos        text[] not null default '{}',
  status        public.bus_coach_status not null default 'active',
  note          text,
  created_at    timestamptz not null default now(),
  unique (partner_id, fleet_no)
);

create index bus_coaches_partner_idx on public.bus_coaches (partner_id, status);

-- The seat template, and it is optional on purpose. A company that sells "30
-- places" and never draws a plan has no rows here, and a departure then
-- materialises seats 1..N. A company that wants 1A/1B/1C/1D fills this once per
-- coach and every departure inherits it.
create table public.bus_coach_seats (
  coach_id uuid not null references public.bus_coaches(id) on delete cascade,
  seat_no  smallint not null check (seat_no > 0),
  code     text not null,
  -- `row` and `col` are keywords; the grid is 1-based and counts seats only.
  -- Where the aisle falls is a property of seat_pattern, which the seat map
  -- reads — storing a gap column here would encode one layout's opinion.
  seat_row smallint check (seat_row is null or seat_row > 0),
  seat_col smallint check (seat_col is null or seat_col > 0),
  class    text,
  -- A seat that exists and is never sold: the one beside the toilet, a broken
  -- recliner. It stays in the plan so the numbering does not shift.
  disabled boolean not null default false,
  primary key (coach_id, seat_no),
  unique (coach_id, code)
);

create table public.bus_terminals (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete cascade,
  name           text not null,
  city           text not null,
  country        text not null default 'Haïti',
  address        text,
  lat            numeric(9,6) check (lat is null or lat between -90 and 90),
  lng            numeric(9,6) check (lng is null or lng between -180 and 180),
  phone          text,
  hours          text,
  instructions   text,
  arrive_minutes_before smallint not null default 30
    check (arrive_minutes_before between 0 and 240),
  photo_path     text,
  -- The marketing carousel's city row, when there is one. `destinations` is
  -- keyed `unique (city, country)` and drives the home page with measured
  -- counts, so forty stop-towns do not belong in it — but a gare in a city that
  -- is already a destination should point at it.
  destination_id uuid references public.destinations(id) on delete set null,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (partner_id, name)
);

create index bus_terminals_partner_idx on public.bus_terminals (partner_id, active);
create index bus_terminals_city_idx on public.bus_terminals (lower(city));

alter table public.bus_coaches enable row level security;
alter table public.bus_coach_seats enable row level security;
alter table public.bus_terminals enable row level security;

create policy bus_coaches_partner_read on public.bus_coaches
  for select to authenticated
  using (partner_id in (select my_partner_ids()) or admin_can('view_listings'));

create policy bus_coaches_partner_write on public.bus_coaches
  for all to authenticated
  using (partner_can(partner_id, 'manage_fleet'))
  with check (partner_can(partner_id, 'manage_fleet'));

create policy bus_coach_seats_partner_read on public.bus_coach_seats
  for select to authenticated
  using (exists (select 1 from public.bus_coaches c
                  where c.id = coach_id
                    and (c.partner_id in (select my_partner_ids())
                      or admin_can('view_listings'))));

create policy bus_coach_seats_partner_write on public.bus_coach_seats
  for all to authenticated
  using (exists (select 1 from public.bus_coaches c
                  where c.id = coach_id and partner_can(c.partner_id, 'manage_fleet')))
  with check (exists (select 1 from public.bus_coaches c
                  where c.id = coach_id and partner_can(c.partner_id, 'manage_fleet')));

-- A gare becomes public knowledge when the company has something published to
-- leave from, and not before: an application under review must not put its
-- address on the open internet.
create policy bus_terminals_public_read on public.bus_terminals
  for select to anon, authenticated
  using (active and exists (select 1 from public.listings l
                             where l.partner_id = bus_terminals.partner_id
                               and l.kind = 'bus' and l.published));

create policy bus_terminals_partner_read on public.bus_terminals
  for select to authenticated
  using (partner_id in (select my_partner_ids()) or admin_can('view_listings'));

create policy bus_terminals_partner_write on public.bus_terminals
  for all to authenticated
  using (partner_can(partner_id, 'manage_network'))
  with check (partner_can(partner_id, 'manage_network'));

/**
 * Draw a coach's seat plan from its pattern and its capacity.
 *
 * Numbering runs front to back, left to right, so seat 1 is the window seat
 * behind the driver and the codes read 1A 1B 1C 1D, 2A 2B… — the convention a
 * Haitian passenger already expects from a boarding slip. A 'custom' plan is
 * refused rather than guessed: an irregular coach is drawn by hand, and a
 * generated plan that does not match the vehicle sends someone to a seat that
 * is not there.
 *
 * Idempotent: it replaces the plan, so a company that corrects its capacity
 * runs it again. Departures already sold keep the seats they materialised —
 * bus_departure_seats is a copy, not a view, for exactly this reason.
 */
create or replace function public.bus_generate_coach_seats(p_coach uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_coach   public.bus_coaches;
  v_per_row smallint;
  v_letters text[];
  v_made    integer := 0;
  i         smallint;
begin
  select * into v_coach from public.bus_coaches where id = p_coach;
  if v_coach.id is null then
    raise exception 'Ce véhicule n''existe plus.' using errcode = 'P0002';
  end if;
  if not partner_can(v_coach.partner_id, 'manage_fleet') then
    raise exception 'Vous ne pouvez pas modifier cette flotte.' using errcode = '42501';
  end if;

  v_per_row := case v_coach.seat_pattern
                 when '2+2' then 4 when '2+1' then 3 when '1+1' then 2 end;
  if v_per_row is null then
    raise exception 'Un plan personnalisé se dessine à la main, il ne se devine pas.';
  end if;
  v_letters := array['A', 'B', 'C', 'D'];

  delete from public.bus_coach_seats where coach_id = p_coach;

  for i in 1 .. v_coach.seat_capacity loop
    insert into public.bus_coach_seats (coach_id, seat_no, code, seat_row, seat_col)
    values (p_coach, i,
            ((i - 1) / v_per_row + 1)::text || v_letters[((i - 1) % v_per_row) + 1],
            (i - 1) / v_per_row + 1,
            ((i - 1) % v_per_row) + 1);
    v_made := v_made + 1;
  end loop;

  return v_made;
end;
$$;

revoke all on function public.bus_generate_coach_seats(uuid) from public, anon;
grant execute on function public.bus_generate_coach_seats(uuid) to authenticated;;
