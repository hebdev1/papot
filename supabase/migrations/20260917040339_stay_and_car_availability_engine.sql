/**
 * What is left, for a stay or a vehicle, between two dates.
 *
 * Restaurants have had this since the tables were built; séjours and voitures
 * never did. `create_booking` wrote the line and moved on, so the same room
 * could be sold twice on the same night and nothing anywhere would say so.
 *
 * Dates are half-open: a stay from the 12th to the 16th occupies the nights of
 * the 12th, 13th, 14th and 15th, and leaves the 16th free for the next guest.
 * Two stays overlap when `a.start < b.end and a.end > b.start` — the arrival
 * day of one being the departure day of the other is not a clash.
 *
 * Capacity comes from what the partner declared, in this order:
 *   - a room type sells `listing_units.units` of itself;
 *   - a vehicle is one listing, so exactly one;
 *   - a day in `listing_availability` may cap or close the whole annonce.
 *
 * An empty calendar means open. A partner who never touched it sells every
 * day — blocking is an act, not a default, and the opposite would silently
 * close every business that has not discovered the screen.
 *
 * SECURITY DEFINER because it counts other people's bookings. It answers with
 * a number and a reason, never with who booked what.
 */
create or replace function public.stay_availability(
  p_listing uuid,
  p_unit    uuid,
  p_from    date,
  p_to      date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_kind     public.listing_kind;
  v_published boolean;
  v_nights   integer;
  v_capacity integer;
  v_taken    integer;
  v_blocked  record;
  v_min_stay smallint;
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

  -- A day the partner closed, whatever the reason they gave it.
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
    -- A vehicle is its own annonce; a stay with no room type chosen is counted
    -- against the annonce as a whole.
    v_capacity := 1;
  end if;

  -- A day may cap the whole annonce below what the units would allow.
  select least(v_capacity, min(a.quantity)) into v_capacity
    from public.listing_availability a
   where a.listing_id = p_listing and a.day >= p_from and a.day < p_to
     and a.quantity is not null;
  v_capacity := coalesce(v_capacity, case when p_unit is not null then v_capacity else 1 end);

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

comment on function public.stay_availability(uuid, uuid, date, date) is
  'What is left for a stay or a vehicle between two half-open dates. Counts other bookings without revealing them.';

/**
 * The same question, asked with a lock, at the moment of sale.
 *
 * `stay_availability` can be read a second before someone else buys. This is
 * what makes the answer binding: it locks the row that carries the capacity —
 * the room type, or the vehicle's annonce — so two buyers of the last room are
 * serialised, and the second one is told rather than sold.
 *
 * It raises. The caller is `create_booking`, inside its transaction, and a
 * refusal there means nothing is written at all.
 */
create or replace function public.assign_stay_inventory(
  p_listing uuid,
  p_unit    uuid,
  p_from    date,
  p_to      date
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

  v_answer := public.stay_availability(p_listing, p_unit, p_from, p_to);

  if coalesce((v_answer->>'available')::boolean, false) then
    return;
  end if;

  raise exception '%', coalesce(v_answer->>'reason', 'Ces dates ne sont plus disponibles.');
end;
$fn$;

comment on function public.assign_stay_inventory(uuid, uuid, date, date) is
  'Takes the capacity row''s lock and refuses the sale if the dates are gone. Called from create_booking.';

grant execute on function public.stay_availability(uuid, uuid, date, date) to anon, authenticated;;
