-- What a traveller may ask about buses, and nothing more.
--
-- The same shape as reservia's marketplace_* family and this project's own
-- public reads: SECURITY DEFINER functions that return exactly the shaped,
-- published-only data a public client needs, so the base tables stay closed.
-- bus_coaches has no anon policy at all, and these functions hand out a coach's
-- type and amenities while never mentioning its plate.
--
-- All three are read-only. Nothing a visitor can call writes a row — in
-- particular, departures are never materialised from here, because a definer
-- inserter reachable by `anon` is the "loop over dates" hole AGENTS.md records.

/**
 * The towns the FROM and TO pickers offer.
 *
 * Built from the gares of published routes rather than a list written in a
 * component: §7 of the specification is explicit that cities come from the
 * database, and a hardcoded list would drift the day a company starts serving
 * Ouanaminthe. `as_origin` and `as_destination` are separate because a stop is
 * not always both — a company may let passengers off at Gonaïves without
 * selling seats from it.
 */
create or replace function public.bus_cities_served()
returns table (city text, country text, as_origin bigint, as_destination bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select btrim(t.city) as city,
         min(t.country) as country,
         count(*) filter (where rs.boarding)  as as_origin,
         count(*) filter (where rs.alighting) as as_destination
    from public.bus_route_stops rs
    join public.bus_terminals t on t.id = rs.terminal_id and t.active
    join public.listings l on l.id = rs.listing_id
   where l.kind = 'bus' and l.published
   group by btrim(t.city)
   order by 3 desc, 1;
$$;

grant execute on function public.bus_cities_served() to anon, authenticated;

/**
 * Find the buses leaving on one date between two towns.
 *
 * The two lateral joins pick the first boarding stop in the origin town and the
 * last alighting stop in the destination town, which is what makes an
 * intermediate leg sellable (Port-au-Prince → Gonaïves on a coach bound for
 * Cap-Haïtien) without producing a row per pair of matching gares.
 *
 * `seats_left` counts seats, not bookings: a sold seat, a blocked seat and a
 * seat inside a live checkout hold are all unavailable, and an expired hold is
 * ignored rather than swept. A departure with fewer free seats than the party
 * asked for is not returned at all — showing it and refusing at checkout is how
 * a marketplace wastes someone's afternoon.
 */
create or replace function public.bus_search(
  p_from       text,
  p_to         text,
  p_date       date,
  p_passengers integer default 1
) returns table (
  departure_id     uuid,
  listing_id       uuid,
  route            text,
  operator         text,
  partner_id       uuid,
  departs_on       date,
  departs_at       time,
  duration_minutes smallint,
  origin_city      text,
  origin_terminal  text,
  origin_address   text,
  arrive_minutes_before smallint,
  destination_city text,
  destination_terminal text,
  destination_address  text,
  intermediate_stops   bigint,
  amenities        text[],
  coach_type       text,
  seat_pattern     public.bus_seat_pattern,
  fare             numeric,
  rating           numeric,
  reviews          integer,
  seats_total      smallint,
  seats_left       integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  with routes as (
    select l.id as listing_id, l.name, l.amenities, l.price, l.rating, l.reviews,
           l.partner_id, p.business_name,
           o.position as o_pos, o.terminal_id as o_term,
           dd.position as d_pos, dd.terminal_id as d_term
      from public.listings l
      join public.partners p on p.id = l.partner_id and p.status = 'active'
      cross join lateral (
        select rs.position, rs.terminal_id
          from public.bus_route_stops rs
          join public.bus_terminals t on t.id = rs.terminal_id and t.active
         where rs.listing_id = l.id and rs.boarding
           and lower(btrim(t.city)) = lower(btrim(p_from))
         order by rs.position
         limit 1) o
      cross join lateral (
        select rs.position, rs.terminal_id
          from public.bus_route_stops rs
          join public.bus_terminals t on t.id = rs.terminal_id and t.active
         where rs.listing_id = l.id and rs.alighting
           and lower(btrim(t.city)) = lower(btrim(p_to))
         order by rs.position desc
         limit 1) dd
     where l.kind = 'bus'
       and l.published
       and dd.position > o.position
  )
  select d.id, r.listing_id, r.name, r.business_name, r.partner_id,
         d.departs_on, d.departs_at, d.duration_minutes,
         btrim(ot.city), ot.name, ot.address, ot.arrive_minutes_before,
         btrim(dt.city), dt.name, dt.address,
         (select count(*) from public.bus_route_stops rs
           where rs.listing_id = r.listing_id
             and rs.position > r.o_pos and rs.position < r.d_pos),
         r.amenities, c.coach_type, c.seat_pattern,
         coalesce(d.fare, r.price), r.rating, r.reviews,
         d.seats_total, free.n
    from routes r
    join public.bus_departures d on d.listing_id = r.listing_id
    join public.bus_terminals ot on ot.id = r.o_term
    join public.bus_terminals dt on dt.id = r.d_term
    left join public.bus_coaches c on c.id = d.coach_id
    cross join lateral (
      select count(*)::integer as n
        from public.bus_departure_seats s
       where s.departure_id = d.id
         and s.booking_item_id is null
         and not s.blocked
         and (s.held_until is null or s.held_until < now())) free
   where d.departs_on = p_date
     and d.status not in ('cancelled', 'departed', 'arrived', 'completed')
     and free.n >= greatest(coalesce(p_passengers, 1), 1)
   order by d.departs_at, coalesce(d.fare, r.price);
$$;

grant execute on function public.bus_search(text, text, date, integer) to anon, authenticated;

/**
 * Everything the trip page shows, in one round trip.
 *
 * The itinerary, the coach, the luggage policy, the fare classes and the seat
 * counts. A stop with no declared time comes back with a null offset and the
 * page renders it without an hour — the company never said when the coach
 * reaches Saint-Marc, and inventing a time would put a fiction on a timetable.
 */
create or replace function public.bus_departure_detail(p_departure uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d   public.bus_departures;
  l   public.listings;
  c   public.bus_coaches;
  res jsonb;
begin
  select * into d from public.bus_departures where id = p_departure;
  if d.id is null then
    return null;
  end if;

  select * into l from public.listings where id = d.listing_id;
  if not l.published or l.kind <> 'bus' then
    return null;
  end if;

  select * into c from public.bus_coaches where id = d.coach_id;

  res := jsonb_build_object(
    'departure_id',     d.id,
    'listing_id',       l.id,
    'route',            l.name,
    'operator',         (select p.business_name from public.partners p where p.id = l.partner_id),
    'rating',           l.rating,
    'reviews',          l.reviews,
    'departs_on',       d.departs_on,
    'departs_at',       d.departs_at,
    'duration_minutes', d.duration_minutes,
    'status',           d.status,
    'delayed_to',       d.delayed_to,
    'delay_reason',     d.delay_reason,
    'fare',             coalesce(d.fare, l.price),
    'amenities',        to_jsonb(coalesce(l.amenities, '{}')),
    'description',      l.attrs->>'description',
    -- The coach, minus everything that is the company's own business.
    'coach',            case when c.id is null then null else jsonb_build_object(
                          'type', c.coach_type,
                          'pattern', c.seat_pattern,
                          'seats', d.seats_total) end,
    'availability',     public.bus_availability(p_departure),
    'stops',            coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'position', rs.position,
                                   'city', btrim(t.city),
                                   'terminal', t.name,
                                   'address', t.address,
                                   'arrive_offset_minutes', rs.arrive_offset_minutes,
                                   'boarding', rs.boarding,
                                   'alighting', rs.alighting,
                                   'arrive_minutes_before', t.arrive_minutes_before,
                                   'instructions', t.instructions)
                                 order by rs.position)
                            from public.bus_route_stops rs
                            join public.bus_terminals t on t.id = rs.terminal_id
                           where rs.listing_id = l.id), '[]'::jsonb),
    'fares',            coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'class', f.class,
                                   'label', f.label,
                                   -- The figure the checkout will actually
                                   -- charge, resolved here so a page can never
                                   -- show a different one.
                                   'amount', round(coalesce(
                                       f.amount,
                                       coalesce(d.fare, l.price) * f.percent_of_base / 100), 2))
                                 order by f.class)
                            from public.bus_fares f
                           where f.listing_id = l.id and f.active), '[]'::jsonb),
    'luggage',          (select jsonb_build_object(
                                  'free_kg', g.free_kg,
                                  'carry_on_kg', g.carry_on_kg,
                                  'extra_price_per_bag', g.extra_price_per_bag,
                                  'max_extra_bags', g.max_extra_bags,
                                  'oversize_rule', g.oversize_rule,
                                  'note', g.note)
                           from public.bus_luggage_rules g
                          where g.listing_id = l.id));

  return res;
end;
$$;

grant execute on function public.bus_departure_detail(uuid) to anon, authenticated;;
