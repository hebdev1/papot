-- One row per seat on one departure. This is the central decision of the bus
-- vertical, and it is a deliberate departure from how a room is sold.
--
-- `assign_stay_inventory` takes `for update` on the row that carries the
-- capacity and then counts booking_items — correct, but the lock is a
-- convention: nothing in the schema stops a second writer inserting a line
-- without taking it, and AGENTS.md records that weakness. It also cannot
-- express "three seats on one sale line", because it counts rows and one row
-- means one unit.
--
-- Here capacity is shaped like the thing being sold. A seat is taken when its
-- row carries a booking_item_id, the primary key is (departure_id, seat_no),
-- and allocation is an `update … for update skip locked` over the free rows. Two
-- buyers of the last seat contend for one row: one wins, the other is told. The
-- second cannot be sold because there is no second row to sell — not because a
-- count came out right.
--
-- A hold during checkout lives on the same row, in held_by/held_until, for the
-- same reason: a hold and a sale must contend for one another. A separate holds
-- table could not be constrained — "one unexpired hold per seat" needs now() in
-- a unique index, which Postgres cannot express — so two buyers could hold the
-- same seat and both pass an aggregate count.
create table public.bus_departure_seats (
  departure_id    uuid not null references public.bus_departures(id) on delete cascade,
  seat_no         smallint not null check (seat_no > 0),
  code            text not null,
  class           text,
  -- A seat that exists and is not for sale: broken, beside the toilet, kept for
  -- the driver's relief. Blocking is an act; the default is open, the same rule
  -- as an empty availability calendar meaning open.
  blocked         boolean not null default false,
  blocked_reason  text,
  -- The sale. Null is free. A deleted booking line frees the seat rather than
  -- stranding it.
  booking_item_id uuid references public.booking_items(id) on delete set null,
  -- The checkout hold: an opaque session key and an expiry. Expired holds are
  -- ignored by every reader, so nothing has to sweep them for correctness.
  held_by         text,
  held_until      timestamptz,
  primary key (departure_id, seat_no),
  unique (departure_id, code),
  check ((held_by is null) = (held_until is null))
);

-- The allocator's index: the free seats of one departure, in boarding order.
create index bus_departure_seats_free_idx
  on public.bus_departure_seats (departure_id, seat_no)
  where booking_item_id is null;

-- The manifest's index: which seats a sale line holds.
create index bus_departure_seats_item_idx
  on public.bus_departure_seats (booking_item_id)
  where booking_item_id is not null;

/**
 * Give a departure its seats.
 *
 * From the coach's plan when it has one, so 1A/1B/1C/1D survive onto the
 * boarding pass; otherwise plain 1..N, which is what a company that sells "30
 * places" and never drew a plan actually means. A disabled seat in the template
 * arrives blocked rather than missing, so the numbering a passenger reads
 * matches the numbering painted in the coach.
 *
 * It is a copy, not a view. A company that re-draws a coach's plan next month
 * must not renumber the seat someone is already holding a ticket for.
 *
 * Idempotent through `on conflict do nothing`, so a re-run after a capacity
 * increase adds the new seats and leaves the sold ones alone.
 */
create or replace function public.bus_materialize_departure_seats(p_departure uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dep   public.bus_departures;
  v_made  integer;
begin
  select * into v_dep from public.bus_departures where id = p_departure;
  if v_dep.id is null then
    raise exception 'Ce départ n''existe plus.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.bus_coach_seats where coach_id = v_dep.coach_id) then
    insert into public.bus_departure_seats
      (departure_id, seat_no, code, class, blocked, blocked_reason)
    select p_departure, s.seat_no, s.code, s.class, s.disabled,
           case when s.disabled then 'Place hors service' end
      from public.bus_coach_seats s
     where s.coach_id = v_dep.coach_id
       and s.seat_no <= v_dep.seats_total
    on conflict (departure_id, seat_no) do nothing;
  else
    insert into public.bus_departure_seats (departure_id, seat_no, code)
    select p_departure, i::smallint, i::text
      from generate_series(1, v_dep.seats_total) i
    on conflict (departure_id, seat_no) do nothing;
  end if;

  select count(*) into v_made
    from public.bus_departure_seats where departure_id = p_departure;
  return v_made;
end;
$$;

/**
 * A departure never exists without its seats.
 *
 * In a trigger rather than in bus_materialize_departures, because the
 * alternative is a rule every future writer — a one-off holiday departure, an
 * admin fix, an import — has to remember. A departure with no seat rows would
 * not oversell; it would sell nothing, silently, which is the harder bug to see.
 */
create or replace function public.bus_departure_gets_its_seats()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bus_materialize_departure_seats(new.id);
  return new;
end;
$$;

create trigger bus_departures_materialize_seats
  after insert on public.bus_departures
  for each row execute function public.bus_departure_gets_its_seats();

alter table public.bus_departure_seats enable row level security;

-- Who may read a seat row: the company, and staff. Not the public — a seat map
-- is served by bus_seat_map(), which returns states and nothing else, because
-- this table knows which booking holds which seat and that is the passenger's
-- business, not the next buyer's.
create policy bus_departure_seats_partner_read on public.bus_departure_seats
  for select to authenticated
  using (exists (select 1 from public.bus_departures d
                  join public.listings l on l.id = d.listing_id
                 where d.id = departure_id
                   and (l.partner_id in (select my_partner_ids())
                     or admin_can('view_bookings'))));

-- Blocking a seat is the company's to do; selling one is not. The row scope is
-- this policy's; which columns may change is the grant's, below — the same
-- division as `the_kind_of_an_annonce_is_decided_once` uses on listings.
create policy bus_departure_seats_partner_block on public.bus_departure_seats
  for update to authenticated
  using (exists (select 1 from public.bus_departures d
                  join public.listings l on l.id = d.listing_id
                 where d.id = departure_id
                   and partner_can(l.partner_id, 'manage_departures')))
  with check (exists (select 1 from public.bus_departures d
                  join public.listings l on l.id = d.listing_id
                 where d.id = departure_id
                   and partner_can(l.partner_id, 'manage_departures')));

-- Seats are created by the trigger and sold by the checkout path, both of which
-- run as the owner. A partner may change two columns and no others: without
-- this, a company could free a sold seat — or sell one to nobody — by writing
-- booking_item_id directly, past every price and payment check.
revoke insert, update, delete on public.bus_departure_seats from authenticated;
grant update (blocked, blocked_reason) on public.bus_departure_seats to authenticated;;
