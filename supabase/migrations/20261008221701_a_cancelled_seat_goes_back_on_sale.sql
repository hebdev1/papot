-- Cancelling a ticket, and what it is worth.
--
-- The money is computed here and never accepted from a caller, for the same
-- reason `quote_booking_item` rebuilds a price: a refund the browser proposes
-- is a refund the browser can inflate.
--
-- A cancellation does three things in one transaction or none of them: the
-- ticket is marked, **the seat goes back on sale**, and a `refunds` row is
-- filed for the admin to decide. The seat matters most — a cancelled ticket
-- still holding its seat is a seat nobody can ever buy again, and the loss is
-- silent.

create or replace function public.next_refund_reference()
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare ref text;
begin
  loop
    ref := 'RMB-' || to_char(now(), 'YYYY') || '-' || public.bus_ticket_code(6, true);
    exit when not exists (select 1 from public.refunds where reference = ref);
  end loop;
  return ref;
end;
$fn$;

-- What this ticket is worth back, right now. Internal: callers do their own
-- permission check first, and a quote names a passenger.
create or replace function public.bus_refund_quote(p_ticket uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  t           public.bus_tickets;
  d           public.bus_departures;
  l           public.listings;
  v_policy    jsonb;
  v_tier      jsonb;
  v_depart_at timestamptz;
  v_hours     numeric;
  v_percent   numeric := 0;
  v_fee       numeric := 0;
  v_refund    numeric := 0;
  v_outcome   text;
  v_floored   boolean := false;
  v_protected numeric;
  v_min       numeric;
begin
  select * into t from public.bus_tickets where id = p_ticket;
  if t.id is null then
    return null;
  end if;
  select * into d from public.bus_departures where id = t.departure_id;
  select * into l from public.listings where id = d.listing_id;

  v_policy    := public.bus_refund_policy(l.id);
  v_protected := (v_policy ->> 'protected_hours')::numeric;
  v_min       := (v_policy ->> 'min_percent')::numeric;

  -- Haiti observes DST, so the instant comes from the IANA zone and never from
  -- a fixed offset. A delayed coach is measured from its new time, because
  -- that is when it actually leaves.
  v_depart_at := (d.departs_on + coalesce(d.delayed_to, d.departs_at))
                   at time zone 'America/Port-au-Prince';
  v_hours     := round(extract(epoch from (v_depart_at - now())) / 3600.0, 2);

  if t.status in ('cancelled', 'refunded') then
    v_outcome := 'ALREADY_CANCELLED';
  elsif t.status = 'checked_in' then
    v_outcome := 'ALREADY_BOARDED';
  elsif d.status = 'cancelled' then
    -- The company called it off. The passenger chose nothing, so the ladder
    -- does not apply and no fee is kept.
    v_outcome := 'FULL_REFUND';
    v_percent := 100;
  else
    v_outcome := 'REFUNDABLE';
    select e.value into v_tier
      from jsonb_array_elements(v_policy -> 'tiers') as e
     where (e.value ->> 'hours_before')::numeric <= v_hours
     order by (e.value ->> 'hours_before')::numeric desc
     limit 1;

    if v_tier is not null then
      v_percent := (v_tier ->> 'refund_percent')::numeric;
      v_fee     := (v_tier ->> 'fee_flat')::numeric;
    end if;

    -- The platform floor, applied to the computed figure rather than to each
    -- rule, so a company cannot step around it by not writing a generous rung.
    if v_hours >= v_protected and v_percent < v_min then
      v_percent := v_min;
      v_fee     := 0;
      v_floored := true;
    end if;
  end if;

  if v_outcome in ('REFUNDABLE', 'FULL_REFUND') then
    v_refund := greatest(0, least(t.amount, round(t.amount * v_percent / 100.0, 2) - v_fee));
  end if;

  return jsonb_build_object(
    'ticket_id',           t.id,
    'ticket_no',           t.ticket_no,
    'outcome',             v_outcome,
    'amount_paid',         t.amount,
    'currency',            'USD',
    'hours_before',        v_hours,
    'refund_percent',      v_percent,
    'fee',                 v_fee,
    'refund',              v_refund,
    'kept',                round(t.amount - v_refund, 2),
    'policy_source',       v_policy ->> 'source',
    'floored_by_platform', v_floored,
    'departs_at',          v_depart_at);
end;
$fn$;

revoke execute on function public.bus_refund_quote(uuid) from public;
revoke execute on function public.bus_refund_quote(uuid) from anon;
revoke execute on function public.bus_refund_quote(uuid) from authenticated;

-- The passenger's own view of it. The 128-bit token is the whole credential,
-- exactly as it is for reading the ticket.
create or replace function public.bus_ticket_refund_quote(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_id uuid;
begin
  select id into v_id from public.bus_tickets
   where access_token = btrim(coalesce(p_token, ''));
  if v_id is null then
    return null;
  end if;
  return public.bus_refund_quote(v_id);
end;
$fn$;

grant execute on function public.bus_ticket_refund_quote(text) to anon, authenticated;

-- The one place a ticket is actually cancelled. Both entry points below reach
-- it, so the seat release, the refund row and the audit event cannot drift
-- apart between the passenger's path and the company's.
create or replace function public.bus_cancel_ticket_internal(
  p_ticket uuid, p_reason text, p_source text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  t           public.bus_tickets;
  d           public.bus_departures;
  l           public.listings;
  b           public.bookings;
  q           jsonb;
  v_booking   uuid;
  v_payment   uuid;
  v_refund_id uuid;
  v_ref       text;
begin
  select * into t from public.bus_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Billet introuvable.' using errcode = 'P0002';
  end if;

  q := public.bus_refund_quote(t.id);
  if (q ->> 'outcome') = 'ALREADY_CANCELLED' then
    raise exception 'Ce billet est déjà annulé.' using errcode = '23514';
  end if;
  if (q ->> 'outcome') = 'ALREADY_BOARDED' then
    raise exception 'Ce billet a déjà servi à embarquer ; il ne peut plus être annulé.'
      using errcode = '23514';
  end if;

  select * into d from public.bus_departures where id = t.departure_id;
  select * into l from public.listings where id = d.listing_id;
  select bi.booking_id into v_booking from public.booking_items bi where bi.id = t.booking_item_id;
  select * into b from public.bookings where id = v_booking;

  update public.bus_tickets set status = 'cancelled' where id = t.id;

  update public.bus_departure_seats
     set booking_item_id = null, held_by = null, held_until = null
   where departure_id    = t.departure_id
     and seat_no         = t.seat_no
     and booking_item_id = t.booking_item_id;

  select p.id into v_payment
    from public.payments p
   where p.booking_id = v_booking and p.partner_id = l.partner_id
   order by p.created_at
   limit 1;

  v_ref := public.next_refund_reference();

  insert into public.refunds (
    reference, booking_id, booking_ref, payment_id, customer_id, customer_label,
    partner_id, booking_total, amount_paid, cancellation_fee, eligible_amount,
    requested_amount, currency, status, reason)
  values (
    v_ref, v_booking, b.reference, v_payment, b.user_id,
    nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), ''),
    l.partner_id, coalesce(b.total, 0), (q ->> 'amount_paid')::numeric,
    (q ->> 'kept')::numeric, (q ->> 'refund')::numeric, (q ->> 'refund')::numeric,
    'USD', 'requested',
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Annulation de billet')
      || ' — ' || t.ticket_no)
  returning id into v_refund_id;

  insert into public.bus_trip_events (
    departure_id, ticket_id, kind, actor, from_value, to_value, reason, payload)
  values (
    t.departure_id, t.id, 'ticket_cancelled', auth.uid(), t.status, 'cancelled',
    nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('source', p_source, 'refund_id', v_refund_id,
                       'refund_reference', v_ref, 'quote', q));

  return q || jsonb_build_object(
    'cancelled', true, 'refund_id', v_refund_id, 'refund_reference', v_ref,
    'seat_released', coalesce(t.seat_code, t.seat_no::text));
end;
$fn$;

revoke execute on function public.bus_cancel_ticket_internal(uuid, text, text) from public;
revoke execute on function public.bus_cancel_ticket_internal(uuid, text, text) from anon;
revoke execute on function public.bus_cancel_ticket_internal(uuid, text, text) from authenticated;

-- The passenger cancels with the link they were emailed. Whoever holds the
-- token holds the ticket; this is the same credential that displays it. The
-- printed QR carries `qr_code`, not this, so a photograph of a boarding pass
-- does not let a stranger cancel the trip.
create or replace function public.bus_cancel_ticket(p_token text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_id uuid;
begin
  select id into v_id from public.bus_tickets
   where access_token = btrim(coalesce(p_token, ''));
  if v_id is null then
    raise exception 'Billet introuvable.' using errcode = 'P0002';
  end if;
  return public.bus_cancel_ticket_internal(v_id, p_reason, 'passenger');
end;
$fn$;

grant execute on function public.bus_cancel_ticket(text, text) to anon, authenticated;

-- The counter cancels on a passenger's behalf.
create or replace function public.bus_cancel_ticket_for(p_ticket uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_partner uuid;
begin
  select l.partner_id into v_partner
    from public.bus_tickets t
    join public.bus_departures d on d.id = t.departure_id
    join public.listings l on l.id = d.listing_id
   where t.id = p_ticket;

  if v_partner is null then
    raise exception 'Billet introuvable.' using errcode = 'P0002';
  end if;
  if not (public.partner_can(v_partner, 'manage_reservations')
          or public.admin_can('issue_refunds')) then
    raise exception 'Permission requise : manage_reservations' using errcode = '42501';
  end if;

  return public.bus_cancel_ticket_internal(p_ticket, p_reason, 'company');
end;
$fn$;

grant execute on function public.bus_cancel_ticket_for(uuid, text) to authenticated;

-- A company must see the refunds raised against its own sales. The decision
-- stays with the admin — this adds a read, not a write.
create policy refunds_partner_read on public.refunds
  for select using (partner_id in (select public.my_partner_ids()));;