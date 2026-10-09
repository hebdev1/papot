-- One row per passenger per leg.
--
-- Brought forward from the ticketing tranche because create_booking is being
-- rewritten now and a sale needs somewhere to put the passengers' names.
-- Rewriting that function twice would be worse than creating this table early;
-- the QR validation, the boarding screen and the PDF that use the last three
-- columns come next.
--
-- Why its own table rather than one booking_items row per passenger:
-- booking_items has no qr_code, no access_token and no checked_in_at, the
-- kind-matches-annonce trigger would fire once per passenger, and
-- attach_items_to_trips would file four copies of one journey in the traveller's
-- trip planner.
--
-- `qr_code` and `access_token` are 128-bit random values, and they are the only
-- secrets here. `ticket_no` is readable and printable and therefore not one —
-- the same distinction get_booking draws for a booking reference.
create table public.bus_tickets (
  id              uuid primary key default gen_random_uuid(),
  booking_item_id uuid not null references public.booking_items(id) on delete cascade,
  departure_id    uuid not null references public.bus_departures(id) on delete restrict,
  -- The seat as it was sold. Null when the route sells unnumbered places.
  seat_no         smallint,
  seat_code       text,
  passenger_first text not null,
  passenger_last  text not null,
  passenger_phone text,
  -- Only the purchaser's, and only when they gave one: a companion's email is
  -- not needed to carry them, so it is not collected.
  passenger_email text,
  fare_class      text not null default 'standard'
    check (fare_class in ('standard', 'child', 'senior', 'promo', 'vip')),
  amount          numeric(10,2) not null check (amount >= 0),
  ticket_no       text not null unique,
  qr_code         text not null unique,
  access_token    text not null unique,
  status          text not null default 'issued'
    check (status in ('issued', 'checked_in', 'cancelled', 'refunded', 'no_show')),
  checked_in_at   timestamptz,
  checked_in_by   uuid references auth.users(id) on delete set null,
  checked_in_note text,
  ticket_sent_at  timestamptz,
  created_at      timestamptz not null default now()
);

create index bus_tickets_item_idx on public.bus_tickets (booking_item_id);
create index bus_tickets_departure_idx on public.bus_tickets (departure_id, status);

/**
 * A readable ticket number, and two unguessable secrets.
 *
 * Base32 without the letters that are misread aloud at a gare — no I, O, 0 or
 * 1 — because a passenger reads this number to an agent over a bad phone line.
 * The secrets use the full alphabet: nobody dictates them.
 */
create or replace function public.bus_ticket_code(p_len integer, p_readable boolean default true)
returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_alphabet text := case when p_readable
    then 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    else 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' end;
  v_out text := '';
  i integer;
begin
  for i in 1 .. p_len loop
    v_out := v_out || substr(v_alphabet,
      1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.bus_ticket_code(integer, boolean) from public, anon, authenticated;

alter table public.bus_tickets enable row level security;

-- The purchaser reads their own tickets; the company reads the tickets for its
-- own departures. Nobody writes directly: tickets are issued by the checkout
-- path, which runs as the owner, and cancelled by an RPC that records why.
create policy bus_tickets_customer_read on public.bus_tickets
  for select to authenticated
  using (exists (select 1 from public.booking_items bi
                  join public.bookings b on b.id = bi.booking_id
                 where bi.id = booking_item_id and b.user_id = auth.uid()));

create policy bus_tickets_partner_read on public.bus_tickets
  for select to authenticated
  using (exists (select 1 from public.bus_departures d
                  join public.listings l on l.id = d.listing_id
                 where d.id = departure_id
                   and (l.partner_id in (select my_partner_ids())
                     or admin_can('view_bookings'))));

revoke insert, update, delete on public.bus_tickets from authenticated;
grant select on public.bus_tickets to authenticated;;
