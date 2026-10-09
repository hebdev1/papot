-- A route is a listings row of kind 'bus'; this is the shape of the journey.
--
-- Every stop sits here, the origin at position 0 and the terminus last, so
-- "Port-au-Prince → Saint-Marc → Gonaïves → Cap-Haïtien" is four rows and the
-- origin and destination are read off the ends. Keeping them here rather than
-- as two columns on the annonce means an intermediate stop is not a second
-- class of thing, and a route gains a stop without a migration.
--
-- `boarding` and `alighting` exist because a stop is not always both: a company
-- running Port-au-Prince → Cap-Haïtien often lets passengers off at Gonaïves
-- without selling Gonaïves → Cap-Haïtien seats on the same coach.
create table public.bus_route_stops (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,
  position       smallint not null check (position >= 0),
  terminal_id    uuid not null references public.bus_terminals(id) on delete restrict,
  -- Minutes after the departure time. The origin is 0; a terminus two hundred
  -- minutes later is 200. Stored as an offset rather than a clock time so a
  -- departure that arrives after midnight needs no date arithmetic and no
  -- timezone — Haiti observes DST, and a stored local clock time would be wrong
  -- for part of the year.
  arrive_offset_minutes smallint not null default 0
    check (arrive_offset_minutes between 0 and 2880),
  boarding       boolean not null default true,
  alighting      boolean not null default true,
  note           text,
  unique (listing_id, position)
);

create index bus_route_stops_listing_idx on public.bus_route_stops (listing_id, position);
create index bus_route_stops_terminal_idx on public.bus_route_stops (terminal_id);

/**
 * A route stops at its own company's gares.
 *
 * There is no foreign key that can say this — the terminal and the annonce
 * reach the partner by different paths — so it is a trigger. Without it one
 * company could publish a timetable that sends passengers to a competitor's
 * gare, and the passenger would have no way to know which of the two was
 * mistaken.
 */
create or replace function public.bus_route_stop_belongs_to_the_company()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing_partner uuid;
  v_terminal_partner uuid;
  v_kind public.listing_kind;
begin
  select l.partner_id, l.kind into v_listing_partner, v_kind
    from public.listings l where l.id = new.listing_id;

  if v_kind is distinct from 'bus' then
    raise exception 'Seule une annonce de transport peut avoir des arrêts.'
      using errcode = '23514';
  end if;

  select t.partner_id into v_terminal_partner
    from public.bus_terminals t where t.id = new.terminal_id;

  if v_listing_partner is distinct from v_terminal_partner then
    raise exception 'Cette gare appartient à une autre entreprise.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger bus_route_stops_same_company
  before insert or update of listing_id, terminal_id on public.bus_route_stops
  for each row execute function public.bus_route_stop_belongs_to_the_company();

alter table public.bus_route_stops enable row level security;

-- The itinerary of a published route is public: it is the first thing a
-- traveller compares.
create policy bus_route_stops_public_read on public.bus_route_stops
  for select to anon, authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and l.kind = 'bus' and l.published));

create policy bus_route_stops_partner_read on public.bus_route_stops
  for select to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id
                    and (l.partner_id in (select my_partner_ids())
                      or admin_can('view_listings'))));

create policy bus_route_stops_partner_write on public.bus_route_stops
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_network')))
  with check (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_network')));;
