-- One row per departure, with its seat counts already counted.
--
-- The Départs screen needs "12 vendues, 40 libres" for every departure in a
-- three-month window. Fetching the seat rows to count them in the browser is
-- 90 days × 2 departures × 52 seats ≈ 9 000 rows for one page, so the counting
-- happens here and the console reads one row per departure.
--
-- `security_invoker` on purpose, like the other six views in this schema: the
-- caller's own policies decide which departures and which seats they can see,
-- so a company reading this view sees its own and an admin with view_bookings
-- sees all. The view holds no permission of its own.
--
-- `fare` is `coalesce(d.fare, l.price)` — the one-fare-source rule made visible,
-- so a screen can never show a figure the checkout would not charge.
create view public.bus_departure_rows with (security_invoker = on) as
  select
    d.id,
    d.listing_id,
    l.partner_id,
    l.name            as route,
    l.published,
    d.schedule_id,
    d.coach_id,
    c.fleet_no,
    c.seat_pattern,
    d.departs_on,
    d.departs_at,
    d.duration_minutes,
    d.seats_total,
    d.status,
    d.delayed_to,
    d.delay_reason,
    coalesce(d.fare, l.price) as fare,
    (select count(*) from public.bus_departure_seats s
      where s.departure_id = d.id and s.booking_item_id is not null) as sold,
    -- Free means sellable now: not taken, not blocked, and not inside a live
    -- checkout hold. An expired hold is ignored rather than swept.
    (select count(*) from public.bus_departure_seats s
      where s.departure_id = d.id
        and s.booking_item_id is null
        and not s.blocked
        and (s.held_until is null or s.held_until < now())) as free,
    (select count(*) from public.bus_departure_seats s
      where s.departure_id = d.id
        and s.booking_item_id is null
        and s.held_until > now()) as held,
    (select count(*) from public.bus_departure_seats s
      where s.departure_id = d.id and s.blocked) as blocked
  from public.bus_departures d
  join public.listings l on l.id = d.listing_id
  left join public.bus_coaches c on c.id = d.coach_id;

-- The consoles read it; the public site uses bus_search, which shapes its own
-- answer and never exposes a coach's fleet number.
revoke all on public.bus_departure_rows from anon;
grant select on public.bus_departure_rows to authenticated;;
