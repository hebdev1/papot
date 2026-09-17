/**
 * The room list needs to know how many went, not only how many are left.
 *
 * A room type with one room always has "one left" until it has none, so a
 * scarcity line keyed on `units_left` alone would sit under every single-room
 * type forever. `units_taken` is what separates real scarcity from the size of
 * the inventory.
 */
drop function if exists public.stay_availability_units(uuid, date, date);

create function public.stay_availability_units(
  p_listing uuid,
  p_from    date,
  p_to      date
)
returns table (
  unit_id     uuid,
  available   boolean,
  reason      text,
  units_left  integer,
  units_taken integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select u.id,
         coalesce((a->>'available')::boolean, false),
         a->>'reason',
         nullif(a->>'left', '')::integer,
         nullif(a->>'taken', '')::integer
    from public.listing_units u
    cross join lateral public.stay_availability(p_listing, p_from, p_to, u.id) as a
   where u.listing_id = p_listing
   order by u.position, u.name;
$fn$;

comment on function public.stay_availability_units(uuid, date, date) is
  'Availability of every room type of one annonce for one window, in a single round trip.';

grant execute on function public.stay_availability_units(uuid, date, date) to anon, authenticated;;
