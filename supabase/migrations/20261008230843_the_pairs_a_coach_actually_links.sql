-- Which cities are actually joined by a published route.
--
-- `bus_cities_served` says a city is an origin and a city is a destination,
-- which is not the same thing: listing every origin against every destination
-- would put pages in the sitemap for pairs nobody drives, and a crawler that
-- finds a hundred empty result pages learns to distrust the rest.
--
-- One row per pair, with how many companies run it, so the sitemap and a
-- "popular routes" block can both read the same truth.
create or replace function public.bus_route_pairs()
returns table (
  from_city  text,
  to_city    text,
  companies  integer,
  routes     integer,
  from_price numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with ends as (
    select l.id, l.partner_id, l.price,
           (select t.city from public.bus_route_stops s
              join public.bus_terminals t on t.id = s.terminal_id
             where s.listing_id = l.id and s.boarding
             order by s.position limit 1) as origin,
           (select t.city from public.bus_route_stops s
              join public.bus_terminals t on t.id = s.terminal_id
             where s.listing_id = l.id and s.alighting
             order by s.position desc limit 1) as destination
      from public.listings l
     where l.kind = 'bus' and l.published
  )
  select origin, destination,
         count(distinct partner_id)::integer,
         count(*)::integer,
         min(price)
    from ends
   where origin is not null and destination is not null and origin <> destination
   group by origin, destination
   order by count(*) desc, origin, destination
$fn$;

grant execute on function public.bus_route_pairs() to anon, authenticated;;