/**
 * Every room type of an annonce, answered for the same window, in one call.
 *
 * The fiche lists the room types and lets the traveller choose one. Asking the
 * single-unit function once per row would be a round trip per room, so the list
 * would either flicker its way to the truth or be built before it knew any of
 * it. This answers the whole list at once.
 *
 * It is the same `stay_availability` underneath — the fiche, the checkout and
 * this share one rule, and there is nowhere for a second opinion to live.
 */
create or replace function public.stay_availability_units(
  p_listing uuid,
  p_from    date,
  p_to      date
)
returns table (unit_id uuid, available boolean, reason text, units_left integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select u.id,
         coalesce((a->>'available')::boolean, false),
         a->>'reason',
         nullif(a->>'left', '')::integer
    from public.listing_units u
    cross join lateral public.stay_availability(p_listing, u.id, p_from, p_to) as a
   where u.listing_id = p_listing
   order by u.position, u.name;
$fn$;

comment on function public.stay_availability_units(uuid, date, date) is
  'Availability of every room type of one annonce for one window, in a single round trip.';

grant execute on function public.stay_availability_units(uuid, date, date) to anon, authenticated;;
