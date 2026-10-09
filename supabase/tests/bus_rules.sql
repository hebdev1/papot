-- PAPOT — the bus vertical's rules, checked against the real schema.
--
-- Run it whole, in the Supabase SQL editor or through the MCP server. It
-- builds its own fixture, asserts, and **ends by raising**, which rolls the
-- entire thing back: nothing it creates survives, so it is safe against
-- production. Success looks like the error message
-- `ALL BUS RULES PASSED (rolled back)`; a failure looks like the assertion
-- that broke.
--
-- Why SQL and not vitest: almost every rule worth protecting here lives in
-- Postgres — pricing, seat allocation, refunds, permissions, RLS. Testing them
-- from Node would mean mocking the database, which only proves the mock agrees
-- with itself. `tests/` holds the parts Node can genuinely check (clock
-- arithmetic, slugs, the PDF sanitiser); this file holds the rest.
--
-- Two traps this file is written around, both of which produced false results
-- before they were understood:
--   * `current_date` is UTC. Everything customer-facing uses `haiti_today()`,
--     and between 20:00 and midnight Haiti time they are different days.
--   * PAPOT's first two auth users are `super_admin`. A permission test run as
--     one of them measures `admin_can()`, not company isolation.
do $$
declare
  v_agent uuid; v_rival uuid;
  v_p uuid; v_rival_co uuid; v_l uuid; v_c uuid; v_d uuid; v_d2 uuid;
  v_term_a uuid; v_term_b uuid;
  v_b uuid; v_bi uuid; v_t1 uuid; v_t2 uuid;
  v_local timestamp;
  v_seats smallint[];
  q jsonb; res jsonb; verdict jsonb;
  v_sold int; v_free int;
  r1 json; r2 json; v_pay record; v_total numeric;
  v_ok boolean;
begin
  -- Ordinary users only: offsets 0 and 1 are super_admins.
  select id into v_agent from auth.users order by created_at offset 2 limit 1;
  select id into v_rival from auth.users order by created_at offset 3 limit 1;

  update public.platform_settings set value = 'true'::jsonb where key = 'demo_payments';

  insert into public.partners (type, business_name, status)
  values ('bus', 'TEST Suite', 'active') returning id into v_p;
  insert into public.partners (type, business_name, status)
  values ('bus', 'TEST Rival', 'active') returning id into v_rival_co;

  insert into public.listings (partner_id, kind, name, location, city, country, type, price, published, status)
  values (v_p, 'bus', 'Port-au-Prince → Cap-Haïtien', 'PAP', 'Cap-Haïtien', 'Haïti', 'bus', 20, true, 'published')
  returning id into v_l;
  insert into public.bus_coaches (partner_id, fleet_no, seat_capacity)
  values (v_p, 'T-01', 4) returning id into v_c;
  insert into public.bus_terminals (partner_id, name, city, country)
  values (v_p, 'Gare Portail', 'Port-au-Prince', 'Haïti') returning id into v_term_a;
  insert into public.bus_terminals (partner_id, name, city, country)
  values (v_p, 'Gare Okap', 'Cap-Haïtien', 'Haïti') returning id into v_term_b;
  insert into public.bus_route_stops (listing_id, position, terminal_id, boarding, alighting)
  values (v_l, 1, v_term_a, true, false), (v_l, 2, v_term_b, false, true);

  v_local := (now() + interval '72 hours') at time zone 'America/Port-au-Prince';
  insert into public.bus_departures (listing_id, coach_id, departs_on, departs_at, duration_minutes, seats_total)
  values (v_l, v_c, v_local::date, v_local::time, 360, 4) returning id into v_d;
  v_local := (now() + interval '96 hours') at time zone 'America/Port-au-Prince';
  insert into public.bus_departures (listing_id, coach_id, departs_on, departs_at, duration_minutes, seats_total)
  values (v_l, v_c, v_local::date, v_local::time, 360, 4) returning id into v_d2;

  insert into public.partner_members (partner_id, user_id, email, full_name, role, status)
  values (v_p, v_agent, 'agent@test.invalid', 'Agent', 'owner', 'active'),
         (v_rival_co, v_rival, 'rival@test.invalid', 'Rival', 'owner', 'active');

  ---------------------------------------------------------------------------
  -- 1. A seat is a row, so a coach cannot be oversold.
  ---------------------------------------------------------------------------
  assert (select count(*) from public.bus_departure_seats where departure_id = v_d) = 4,
    'the departure trigger did not materialise one row per seat';

  insert into public.bookings (reference, first_name, last_name, email, phone, payment_method, total)
  values ('TEST-SUITE-1', 'Jean', 'Pierre', 'jean@test.invalid', '+50933000000', 'card', 0)
  returning id into v_b;
  insert into public.booking_items (booking_id, kind, title, detail, listing_id, amount, party)
  values (v_b, 'bus', 'Trajet', 'Test', v_l, 80, 4) returning id into v_bi;

  v_seats := public.assign_bus_seats(v_d, v_bi, 4, null, null);
  assert array_length(v_seats, 1) = 4, 'four seats were asked for and not given';

  begin
    perform public.assign_bus_seats(v_d, v_bi, 1, null, null);
    assert false, 'OVERSOLD: a fifth seat was allocated on a four-seat coach';
  exception
    when assert_failure then raise;
    when others then null;  -- refused, which is the point
  end;

  select (public.bus_availability(v_d) ->> 'sold')::int,
         (public.bus_availability(v_d) ->> 'left')::int
    into v_sold, v_free;
  assert v_sold = 4 and v_free = 0,
    format('availability disagrees with the seat rows: sold=%s left=%s', v_sold, v_free);

  ---------------------------------------------------------------------------
  -- 2. The refund ladder, and the platform floor that cannot be stepped around.
  ---------------------------------------------------------------------------
  insert into public.bus_tickets
    (booking_item_id, departure_id, seat_no, seat_code, passenger_first, passenger_last,
     amount, ticket_no, qr_code, access_token)
  values (v_bi, v_d, v_seats[1], '1A', 'Jean', 'Pierre', 20,
          'BUS-SUITE1', 'QR-SUITE1', 'TOK-SUITE1') returning id into v_t1;
  insert into public.bus_tickets
    (booking_item_id, departure_id, seat_no, seat_code, passenger_first, passenger_last,
     amount, ticket_no, qr_code, access_token)
  values (v_bi, v_d, v_seats[2], '1B', 'Marie', 'Jean', 20,
          'BUS-SUITE2', 'QR-SUITE2', 'TOK-SUITE2') returning id into v_t2;

  -- No rules anywhere: the platform ladder applies. 72 h out is its top rung.
  q := public.bus_refund_quote(v_t1);
  assert (q ->> 'policy_source') = 'platform', 'a company with no rules should fall back to the platform ladder';
  assert (q ->> 'refund_percent')::numeric = 90, format('expected 90 pct at 72 h, got %s', q ->> 'refund_percent');
  assert (q ->> 'refund')::numeric = 18.00, format('expected 18.00 back on 20.00, got %s', q ->> 'refund');

  -- A company that files only a mean rung must still not beat the floor.
  insert into public.bus_cancellation_rules (partner_id, hours_before, refund_percent)
  values (v_p, 0, 0);
  q := public.bus_refund_quote(v_t1);
  assert (q ->> 'floored_by_platform')::boolean,
    'EVADED: a 0 pct rung at 72 h was not lifted to the platform minimum';
  assert (q ->> 'refund_percent')::numeric = 50, format('floor should be 50 pct, got %s', q ->> 'refund_percent');
  delete from public.bus_cancellation_rules where partner_id = v_p;

  ---------------------------------------------------------------------------
  -- 3. Cancelling frees the seat and files a refund, in one transaction.
  ---------------------------------------------------------------------------
  res := public.bus_cancel_ticket('TOK-SUITE1', 'test');
  assert (res ->> 'cancelled')::boolean, 'the cancellation did not report success';
  assert (select booking_item_id is null from public.bus_departure_seats
           where departure_id = v_d and seat_no = v_seats[1]),
    'LOST SEAT: a cancelled ticket still holds its seat, so nobody can ever buy it';
  assert exists (select 1 from public.refunds where id = (res ->> 'refund_id')::uuid),
    'no refund row was filed for the cancellation';
  assert exists (select 1 from public.bus_trip_events
                  where ticket_id = v_t1 and kind = 'ticket_cancelled'),
    'the cancellation left no audit event';

  begin
    perform public.bus_cancel_ticket('TOK-SUITE1', 'again');
    assert false, 'a ticket was cancelled twice';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  ---------------------------------------------------------------------------
  -- 4. A company calling a trip off refunds in full, with no fee.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  set local role authenticated;
    res := public.bus_cancel_departure(v_d, 'Panne');
  reset role;
  assert (res ->> 'tickets_refunded')::int = 1,
    format('expected the one live ticket to be refunded, got %s', res ->> 'tickets_refunded');
  assert (res ->> 'refund_total')::numeric = 20.00,
    format('a company cancellation must refund in full, got %s', res ->> 'refund_total');

  ---------------------------------------------------------------------------
  -- 5. An overnight delay moves forward, not twenty-two hours back.
  ---------------------------------------------------------------------------
  assert public.bus_departure_instant(date '2026-03-10', time '23:00', time '01:00')
         > public.bus_departure_instant(date '2026-03-10', time '23:00', null),
    'OVERNIGHT: 23:00 delayed to 01:00 was read as earlier, which refunds nobody';
  assert extract(epoch from (
           public.bus_departure_instant(date '2026-03-10', time '23:00', time '01:00')
           - public.bus_departure_instant(date '2026-03-10', time '23:00', null))) / 60 = 120,
    'a 23:00 -> 01:00 delay should be 120 minutes';

  ---------------------------------------------------------------------------
  -- 6. A rival company's scanner is not an oracle.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  set local role authenticated;
    verdict := public.bus_validate_ticket('QR-SUITE2', v_d2);
  reset role;
  assert (verdict ->> 'result') = 'WRONG_TRIP',
    format('own agent scanning the wrong departure should read WRONG_TRIP, got %s', verdict ->> 'result');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rival, 'role', 'authenticated')::text, true);
  set local role authenticated;
    verdict := public.bus_validate_ticket('QR-SUITE2', v_d);
    v_ok := public.bus_manifest(v_d) is null;
  reset role;
  assert (verdict ->> 'result') = 'INVALID',
    format('LEAK: a rival company learned something from a scan (%s)', verdict ->> 'result');
  assert v_ok, 'LEAK: a rival company read another company''s manifest';

  ---------------------------------------------------------------------------
  -- 7. A promo code is paid for by whoever offered it.
  ---------------------------------------------------------------------------
  insert into public.partner_discounts (partner_id, name, kind, percent, code, active)
  values (v_p, 'Rabè konpayi', 'promo_code', 10, 'SUITE-CO', true);
  insert into public.promotions (name, code, kind, discount_value, status)
  values ('Kanpay PAPOT', 'SUITE-PAPOT', 'percentage', 10, 'active');

  r1 := public.demo_checkout(jsonb_build_object(
    'first_name','A','last_name','B','email','a@test.invalid','phone','+50933000001',
    'payment_method','card','promo_code','SUITE-CO',
    'items', jsonb_build_array(jsonb_build_object(
      'listing_id', v_l, 'title','T','detail','T','party',1,'departure_id', v_d2,
      'passengers', jsonb_build_array(jsonb_build_object('first','A','last','B'))))
  ), '4242424242424242');
  select * into v_pay from public.payments where booking_id = (r1->>'id')::uuid;
  select total into v_total from public.bookings where id = (r1->>'id')::uuid;
  assert v_total = 18.00, format('a 10 pct code on 20.00 should leave 18.00, got %s', v_total);
  assert v_pay.amount = 18.00 and v_pay.discount_borne_by = 'partner',
    format('the company offered the code, so it should absorb it: amount=%s borne=%s',
           v_pay.amount, v_pay.discount_borne_by);
  assert v_pay.amount = v_total, 'a partner-borne discount must keep payments in step with the total';

  r2 := public.demo_checkout(jsonb_build_object(
    'first_name','C','last_name','D','email','c@test.invalid','phone','+50933000002',
    'payment_method','card','promo_code','SUITE-PAPOT',
    'items', jsonb_build_array(jsonb_build_object(
      'listing_id', v_l, 'title','T','detail','T','party',1,'departure_id', v_d2,
      'passengers', jsonb_build_array(jsonb_build_object('first','C','last','D'))))
  ), '4242424242424242');
  select * into v_pay from public.payments where booking_id = (r2->>'id')::uuid;
  select total into v_total from public.bookings where id = (r2->>'id')::uuid;
  assert v_total = 18.00, 'the passenger should pay the same either way';
  assert v_pay.amount = 20.00 and v_pay.discount_borne_by = 'platform',
    format('PAPOT offered the code, so the company is paid in full: amount=%s borne=%s',
           v_pay.amount, v_pay.discount_borne_by);
  assert v_pay.commission = 0.00,
    format('a platform-funded discount comes off the commission, got %s', v_pay.commission);

  -- A code worth more than the cart never makes a negative booking.
  insert into public.promotions (name, code, kind, discount_value, status)
  values ('Twòp', 'SUITE-BIG', 'fixed', 500, 'active');
  r1 := public.demo_checkout(jsonb_build_object(
    'first_name','E','last_name','F','email','e@test.invalid','phone','+50933000003',
    'payment_method','card','promo_code','SUITE-BIG',
    'items', jsonb_build_array(jsonb_build_object(
      'listing_id', v_l, 'title','T','detail','T','party',1,'departure_id', v_d2,
      'passengers', jsonb_build_array(jsonb_build_object('first','E','last','F'))))
  ), '4242424242424242');
  select total into v_total from public.bookings where id = (r1->>'id')::uuid;
  assert v_total = 0.00, format('an oversized code should floor the total at 0, got %s', v_total);

  ---------------------------------------------------------------------------
  -- 8. A review has to be earned.
  ---------------------------------------------------------------------------
  begin
    perform public.submit_review('TEST-SUITE-1', v_l, 5::smallint, 'jean@test.invalid');
    assert false, 'a review was accepted before the journey happened';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  raise exception 'ALL BUS RULES PASSED (rolled back)';
end;
$$;
