-- Reading a ticket, and checking someone in.
--
-- Four functions, three audiences. A passenger opens their own ticket with a
-- secret; a purchaser lists the tickets they bought with a reference and the
-- email they bought with; a gare agent reads the manifest and scans. Each one
-- is a SECURITY DEFINER function with its own check, because bus_tickets has no
-- write grant at all and its read policies cover only signed-in people — a
-- guest holds a link, not an account.

/**
 * One ticket, opened from its own link.
 *
 * The 128-bit `access_token` IS the credential, which is why this takes
 * nothing else. That is a different bargain from `get_booking`, which needs a
 * reference *and* an email precisely because a reference is short and
 * guessable; a token is neither, so it stands alone — the same reasoning that
 * lets a password-reset link work.
 *
 * It returns the passenger's own name and nothing about the other seats.
 */
create or replace function public.bus_ticket_by_token(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t   public.bus_tickets;
  d   public.bus_departures;
  l   public.listings;
begin
  if coalesce(btrim(p_token), '') = '' then
    return null;
  end if;

  select * into t from public.bus_tickets where access_token = btrim(p_token);
  if t.id is null then
    return null;   -- indistinguishable from a wrong token
  end if;

  select * into d from public.bus_departures where id = t.departure_id;
  select * into l from public.listings where id = d.listing_id;

  return jsonb_build_object(
    'ticket_no',   t.ticket_no,
    'qr_code',     t.qr_code,
    'status',      t.status,
    'passenger',   btrim(t.passenger_first || ' ' || t.passenger_last),
    'seat',        coalesce(t.seat_code, t.seat_no::text),
    'fare_class',  t.fare_class,
    'amount',      t.amount,
    'checked_in_at', t.checked_in_at,
    'route',       l.name,
    'operator',    (select p.business_name from public.partners p where p.id = l.partner_id),
    'departs_on',  d.departs_on,
    'departs_at',  d.departs_at,
    'duration_minutes', d.duration_minutes,
    'departure_status', d.status,
    'delayed_to', d.delayed_to,
    'delay_reason', d.delay_reason,
    'reference',   (select b.reference from public.bookings b
                      join public.booking_items bi on bi.booking_id = b.id
                     where bi.id = t.booking_item_id),
    'origin',      (select jsonb_build_object('city', btrim(tm.city), 'terminal', tm.name,
                                              'address', tm.address,
                                              'arrive_minutes_before', tm.arrive_minutes_before,
                                              'instructions', tm.instructions)
                      from public.bus_route_stops rs
                      join public.bus_terminals tm on tm.id = rs.terminal_id
                     where rs.listing_id = l.id and rs.boarding
                     order by rs.position limit 1),
    'destination', (select jsonb_build_object('city', btrim(tm.city), 'terminal', tm.name)
                      from public.bus_route_stops rs
                      join public.bus_terminals tm on tm.id = rs.terminal_id
                     where rs.listing_id = l.id and rs.alighting
                     order by rs.position desc limit 1));
end;
$$;

grant execute on function public.bus_ticket_by_token(text) to anon, authenticated;

/**
 * The tickets a purchase produced.
 *
 * Reference plus email, exactly as `get_booking` requires, and for the same
 * reason: `PPT-2026-XXXXXX` is printed on a receipt and read aloud, so it is an
 * identifier and not a secret. A signed-in buyer is recognised without the
 * email.
 */
create or replace function public.bus_tickets_for_booking(
  p_reference text,
  p_email     text default null
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  b    public.bookings;
  v_ok boolean := false;
begin
  select * into b from public.bookings where reference = btrim(p_reference);
  if b.id is null then
    return '[]'::jsonb;
  end if;

  if b.user_id is not null and b.user_id = auth.uid() then
    v_ok := true;
  elsif auth.uid() is not null and exists (
    select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = lower(b.email)
  ) then
    v_ok := true;
  elsif p_email is not null and lower(btrim(p_email)) = lower(b.email) then
    v_ok := true;
  end if;

  if not v_ok then
    return '[]'::jsonb;   -- same answer as "no such reference"
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'ticket_no',    t.ticket_no,
             'access_token', t.access_token,
             'passenger',    btrim(t.passenger_first || ' ' || t.passenger_last),
             'seat',         coalesce(t.seat_code, t.seat_no::text),
             'status',       t.status,
             'amount',       t.amount,
             'route',        l.name,
             'departs_on',   d.departs_on,
             'departs_at',   d.departs_at)
           order by d.departs_on, d.departs_at, t.seat_no)
      from public.bus_tickets t
      join public.booking_items bi on bi.id = t.booking_item_id
      join public.bus_departures d on d.id = t.departure_id
      join public.listings l on l.id = d.listing_id
     where bi.booking_id = b.id), '[]'::jsonb);
end;
$$;

grant execute on function public.bus_tickets_for_booking(text, text) to anon, authenticated;

/**
 * The passenger list for one departure.
 *
 * Staff only, and scoped to the company that runs the coach. A manifest is a
 * list of named people with their phone numbers — the most personal thing this
 * vertical holds — so it answers null rather than an empty list when the caller
 * has no business with the departure, and never says whether the departure
 * exists.
 *
 * Any member with view_reservations can read it today. Restricting a driver to
 * the departures actually assigned to them needs bus_staff_assignments, which
 * arrives with the lifecycle work; until then a driver sees their company's
 * manifests, which is wider than intended and narrower than any other company's.
 */
create or replace function public.bus_manifest(p_departure uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.bus_departures;
  l public.listings;
begin
  select * into d from public.bus_departures where id = p_departure;
  if d.id is null then
    return null;
  end if;
  select * into l from public.listings where id = d.listing_id;

  if not (public.partner_can(l.partner_id, 'view_reservations')
          or public.admin_can('view_bookings')) then
    return null;
  end if;

  return jsonb_build_object(
    'departure_id', d.id,
    'route',        l.name,
    'departs_on',   d.departs_on,
    'departs_at',   d.departs_at,
    'status',       d.status,
    'seats_total',  d.seats_total,
    'sold',         (select count(*) from public.bus_tickets t
                      where t.departure_id = d.id and t.status <> 'cancelled'),
    'checked_in',   (select count(*) from public.bus_tickets t
                      where t.departure_id = d.id and t.status = 'checked_in'),
    'passengers',   coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'ticket_no', t.ticket_no,
                               'name', btrim(t.passenger_first || ' ' || t.passenger_last),
                               'seat', coalesce(t.seat_code, t.seat_no::text),
                               'seat_no', t.seat_no,
                               'phone', t.passenger_phone,
                               'fare_class', t.fare_class,
                               'status', t.status,
                               'checked_in_at', t.checked_in_at,
                               'reference', b.reference)
                             order by t.seat_no, t.passenger_last)
                        from public.bus_tickets t
                        join public.booking_items bi on bi.id = t.booking_item_id
                        join public.bookings b on b.id = bi.booking_id
                       where t.departure_id = d.id), '[]'::jsonb));
end;
$$;

revoke all on function public.bus_manifest(uuid) from public, anon;
grant execute on function public.bus_manifest(uuid) to authenticated;

/**
 * Scan a ticket at the gare.
 *
 * Returns one of five words, and the agent's screen says what each means:
 *
 *   VALID        — let them on, and the ticket is now checked in
 *   ALREADY_USED — this ticket boarded already; when, and who scanned it
 *   WRONG_TRIP   — a real ticket, for another departure
 *   CANCELLED    — refunded, cancelled, or the departure was called off
 *   INVALID      — no such code
 *
 * INVALID is deliberately the same answer for a malformed code, an unknown one
 * and a ticket belonging to another company: a scanner must not become an
 * oracle that confirms which codes exist.
 *
 * The check-in is written in the same statement that reads the ticket, with the
 * row locked, so two agents scanning the same ticket at two doors cannot both
 * see VALID.
 */
create or replace function public.bus_validate_ticket(
  p_code      text,
  p_departure uuid default null,
  p_note      text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t   public.bus_tickets;
  d   public.bus_departures;
  l   public.listings;
begin
  if coalesce(btrim(p_code), '') = '' then
    return jsonb_build_object('result', 'INVALID');
  end if;

  -- Locked before anything is decided: the second scanner waits here and then
  -- reads the row the first one already checked in.
  select * into t from public.bus_tickets
   where qr_code = btrim(p_code) or ticket_no = upper(btrim(p_code))
   for update;

  if t.id is null then
    return jsonb_build_object('result', 'INVALID');
  end if;

  select * into d from public.bus_departures where id = t.departure_id;
  select * into l from public.listings where id = d.listing_id;

  -- A scanner belonging to another company learns nothing beyond "no".
  if not (public.partner_can(l.partner_id, 'board_passengers')
          or public.admin_can('view_bookings')) then
    return jsonb_build_object('result', 'INVALID');
  end if;

  if p_departure is not null and t.departure_id <> p_departure then
    return jsonb_build_object(
      'result', 'WRONG_TRIP',
      'passenger', btrim(t.passenger_first || ' ' || t.passenger_last),
      'its_departure', jsonb_build_object(
        'on', d.departs_on, 'at', d.departs_at, 'route', l.name));
  end if;

  if t.status in ('cancelled', 'refunded') or d.status = 'cancelled' then
    return jsonb_build_object(
      'result', 'CANCELLED',
      'passenger', btrim(t.passenger_first || ' ' || t.passenger_last),
      'reason', case when d.status = 'cancelled'
                     then 'Ce départ a été annulé.'
                     else 'Ce billet a été annulé.' end);
  end if;

  if t.status = 'checked_in' then
    return jsonb_build_object(
      'result', 'ALREADY_USED',
      'passenger', btrim(t.passenger_first || ' ' || t.passenger_last),
      'seat', coalesce(t.seat_code, t.seat_no::text),
      'checked_in_at', t.checked_in_at);
  end if;

  update public.bus_tickets
     set status = 'checked_in',
         checked_in_at = now(),
         checked_in_by = auth.uid(),
         checked_in_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = t.id;

  return jsonb_build_object(
    'result',     'VALID',
    'passenger',  btrim(t.passenger_first || ' ' || t.passenger_last),
    'seat',       coalesce(t.seat_code, t.seat_no::text),
    'fare_class', t.fare_class,
    'ticket_no',  t.ticket_no,
    'route',      l.name,
    'departs_at', d.departs_at);
end;
$$;

revoke all on function public.bus_validate_ticket(text, uuid, text) from public, anon;
grant execute on function public.bus_validate_ticket(text, uuid, text) to authenticated;

/**
 * Undo a scan.
 *
 * Agents scan the wrong person, and a ticket stuck at "checked in" is a
 * passenger who cannot board on the next attempt. Allowed while the coach has
 * not left, by someone who could have scanned it in the first place.
 */
create or replace function public.bus_undo_checkin(p_ticket_no text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.bus_tickets;
  d public.bus_departures;
  l public.listings;
begin
  select * into t from public.bus_tickets where ticket_no = upper(btrim(p_ticket_no)) for update;
  if t.id is null then
    return jsonb_build_object('result', 'INVALID');
  end if;

  select * into d from public.bus_departures where id = t.departure_id;
  select * into l from public.listings where id = d.listing_id;

  if not (public.partner_can(l.partner_id, 'board_passengers')
          or public.admin_can('view_bookings')) then
    return jsonb_build_object('result', 'INVALID');
  end if;

  if d.status in ('departed', 'arrived', 'completed') then
    raise exception 'Ce départ est déjà parti : l''embarquement ne peut plus être modifié.';
  end if;

  update public.bus_tickets
     set status = 'issued', checked_in_at = null, checked_in_by = null, checked_in_note = null
   where id = t.id;

  return jsonb_build_object('result', 'UNDONE', 'ticket_no', t.ticket_no);
end;
$$;

revoke all on function public.bus_undo_checkin(text) from public, anon;
grant execute on function public.bus_undo_checkin(text) to authenticated;;
