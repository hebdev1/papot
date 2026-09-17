/**
 * A vehicle has no room type, and neither does a stay whose annonce never
 * declared any. That is the absence of an argument, not a null passed in its
 * place — so `p_unit` moves to the end and carries a default, and a caller with
 * nothing to say about units simply does not mention them.
 *
 * This also keeps the generated client types honest: an argument that can be
 * omitted is typed as optional, where one that is merely nullable is typed as
 * required and the browser has to lie to satisfy it.
 */
drop function if exists public.stay_availability(uuid, uuid, date, date);
drop function if exists public.assign_stay_inventory(uuid, uuid, date, date);
drop function if exists public.stay_availability_units(uuid, date, date);

create or replace function public.stay_availability(
  p_listing uuid,
  p_from    date,
  p_to      date,
  p_unit    uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_kind      public.listing_kind;
  v_published boolean;
  v_nights    integer;
  v_capacity  integer;
  v_cap_day   integer;
  v_taken     integer;
  v_blocked   record;
  v_min_stay  smallint;
begin
  select l.kind, l.published into v_kind, v_published
    from public.listings l where l.id = p_listing;

  if v_kind is null then
    return jsonb_build_object('available', false, 'reason', 'Cette annonce n''existe plus.');
  end if;
  if not v_published then
    return jsonb_build_object('available', false, 'reason', 'Cette annonce n''est pas publiée.');
  end if;
  if v_kind = 'restaurant' then
    return jsonb_build_object('available', false,
      'reason', 'Une table se vérifie avec restaurant_availability.');
  end if;

  p_to := coalesce(p_to, p_from + 1);
  v_nights := p_to - p_from;
  if v_nights < 1 then
    return jsonb_build_object('available', false, 'reason', 'Le départ doit suivre l''arrivée.');
  end if;

  -- A day the partner closed, whatever reason they gave it.
  select a.day, a.status into v_blocked
    from public.listing_availability a
   where a.listing_id = p_listing
     and a.day >= p_from and a.day < p_to
     and a.status <> 'available'
   order by a.day
   limit 1;

  if found then
    return jsonb_build_object(
      'available', false,
      'reason', case v_blocked.status
        when 'blocked'     then 'Ces dates ne sont pas ouvertes à la réservation.'
        when 'booked'      then 'Ces dates sont déjà prises.'
        when 'maintenance' then 'L''établissement est fermé pour entretien à ces dates.'
        else 'L''établissement est fermé à ces dates.' end,
      'first_blocked', v_blocked.day);
  end if;

  select max(a.min_stay) into v_min_stay
    from public.listing_availability a
   where a.listing_id = p_listing and a.day >= p_from and a.day < p_to;

  if v_min_stay is not null and v_nights < v_min_stay then
    return jsonb_build_object('available', false,
      'reason', format('Le séjour minimum est de %s nuits à ces dates.', v_min_stay),
      'min_stay', v_min_stay);
  end if;

  -- How many of this thing exist.
  if p_unit is not null then
    select greatest(coalesce(u.units, 1), 1) into v_capacity
      from public.listing_units u
     where u.id = p_unit and u.listing_id = p_listing and u.available;
    if v_capacity is null then
      return jsonb_build_object('available', false,
        'reason', 'Ce type de chambre n''est plus proposé.');
    end if;
  else
    -- A vehicle is its own annonce; a stay with no room type is counted against
    -- the annonce as a whole.
    v_capacity := 1;
  end if;

  -- A day may cap the whole annonce below what the units would allow.
  select min(a.quantity) into v_cap_day
    from public.listing_availability a
   where a.listing_id = p_listing and a.day >= p_from and a.day < p_to
     and a.quantity is not null;
  if v_cap_day is not null then
    v_capacity := least(v_capacity, v_cap_day);
  end if;

  select count(*) into v_taken
    from public.booking_items bi
   where bi.kind = v_kind
     and bi.status <> 'cancelled'
     and bi.starts_on is not null
     and coalesce(bi.ends_on, bi.starts_on + 1) > p_from
     and bi.starts_on < p_to
     and (
       (p_unit is not null and bi.unit_id = p_unit)
       or (p_unit is null and bi.listing_id = p_listing and bi.unit_id is null)
     );

  return jsonb_build_object(
    'available', v_taken < v_capacity,
    'reason', case when v_taken < v_capacity then null
              else 'Ces dates viennent d''être prises.' end,
    'nights', v_nights,
    'capacity', v_capacity,
    'taken', v_taken,
    'left', greatest(v_capacity - v_taken, 0));
end;
$fn$;

comment on function public.stay_availability(uuid, date, date, uuid) is
  'What is left for a stay or a vehicle between two half-open dates. Counts other bookings without revealing them.';

create or replace function public.assign_stay_inventory(
  p_listing uuid,
  p_from    date,
  p_to      date,
  p_unit    uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_answer jsonb;
begin
  if p_from is null then
    raise exception 'Il manque les dates de cette réservation.';
  end if;

  -- The lock, before the count. Whoever holds it decides first.
  if p_unit is not null then
    perform 1 from public.listing_units where id = p_unit for update;
  else
    perform 1 from public.listings where id = p_listing for update;
  end if;

  v_answer := public.stay_availability(p_listing, p_from, p_to, p_unit);

  if coalesce((v_answer->>'available')::boolean, false) then
    return;
  end if;

  raise exception '%', coalesce(v_answer->>'reason', 'Ces dates ne sont plus disponibles.');
end;
$fn$;

comment on function public.assign_stay_inventory(uuid, date, date, uuid) is
  'Takes the capacity row''s lock and refuses the sale if the dates are gone. Called from create_booking.';

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
    cross join lateral public.stay_availability(p_listing, p_from, p_to, u.id) as a
   where u.listing_id = p_listing
   order by u.position, u.name;
$fn$;

comment on function public.stay_availability_units(uuid, date, date) is
  'Availability of every room type of one annonce for one window, in a single round trip.';

grant execute on function public.stay_availability(uuid, date, date, uuid) to anon, authenticated;
grant execute on function public.stay_availability_units(uuid, date, date) to anon, authenticated;

/* create_booking calls it positionally — the argument order moved, so the two
   call sites move with it. */
do $do$
declare
  src text := pg_get_functiondef('public.create_booking(jsonb)'::regprocedure);
  before text;
begin
  before := src;
  src := replace(src,
    'perform public.assign_stay_inventory(v_listing, v_unit, v_date, coalesce(v_end, v_date + 1));',
    'perform public.assign_stay_inventory(v_listing, v_date, coalesce(v_end, v_date + 1), v_unit);');
  if src = before then raise exception 'call site 1 not found'; end if;

  before := src;
  src := replace(src,
    'v_line.target, v_line.unit_id, v_date, coalesce(v_end, v_date + 1));',
    'v_line.target, v_date, coalesce(v_end, v_date + 1), v_line.unit_id);');
  if src = before then raise exception 'call site 2 not found'; end if;

  execute src;
end
$do$;;
