/**
 * What a line of a booking costs, decided here rather than in the browser.
 *
 * `create_booking` took `amount` from the payload for everything that was not
 * a paquet. The payload is a JSON object the browser composes, so the price of
 * a room was whatever the buyer's browser said it was: a 500 $ suite could be
 * bought for 1 $ by editing one number before the request left. Nothing on the
 * way in checked it, and `payments` then recorded the amount it was given.
 *
 * The paquets feature already had the rule — "the price of a sale comes from
 * the database, never the payload". This extends it to the other three métiers.
 *
 * The tariff is rebuilt from the same parts the fiche adds up, so the figure a
 * traveller was shown is the figure they are charged:
 *
 *   séjour     unit price (or the annonce's) × nights + cleaning + service
 *   voiture    day rate × days + driver × days when taken + the pickup's fee
 *   restaurant nothing; a table is not sold
 *
 * The browser still chooses the *options* — a driver, a pickup point — because
 * those are the traveller's decisions. It no longer chooses what they cost:
 * it names them and the tariff is read here.
 */
create or replace function public.quote_booking_item(
  p_kind    public.listing_kind,
  p_listing uuid,
  p_unit    uuid,
  p_from    date,
  p_to      date,
  p_options jsonb default '{}'::jsonb
)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_listing public.listings;
  v_attrs   jsonb;
  v_units   integer;
  v_rate    numeric;
  v_total   numeric;
  v_pickup  jsonb;
begin
  select * into v_listing from public.listings where id = p_listing;
  if not found then
    raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
  end if;
  v_attrs := coalesce(v_listing.attrs, '{}'::jsonb);

  -- A table costs nothing to reserve. Saying so here means the browser cannot
  -- say otherwise either.
  if p_kind = 'restaurant' then
    return 0;
  end if;

  v_units := greatest(coalesce(p_to, p_from + 1) - p_from, 1);

  if p_kind = 'stay' then
    -- The chosen room type carries its own tariff; the annonce's is the
    -- fallback the fiche uses when no unit is selected.
    select u.price into v_rate
      from public.listing_units u
     where u.id = p_unit and u.listing_id = p_listing;
    v_rate := coalesce(v_rate, v_listing.price);

    v_total := v_rate * v_units
             + coalesce((v_attrs->>'cleaning_fee')::numeric, 0)
             + coalesce((v_attrs->>'service_fee')::numeric, 0);

  elsif p_kind = 'car' then
    v_total := v_listing.price * v_units;

    if coalesce((p_options->>'with_driver')::boolean, false) then
      v_total := v_total + coalesce((v_attrs->>'driver_per_day')::numeric, 0) * v_units;
    end if;

    -- The pickup point is named, not priced. An unknown name costs nothing
    -- rather than guessing a fee onto the traveller's bill.
    select value into v_pickup
      from jsonb_array_elements(coalesce(v_attrs->'pickups', '[]'::jsonb))
     where value->>'name' = nullif(btrim(p_options->>'pickup'), '')
     limit 1;
    v_total := v_total + coalesce((v_pickup->>'fee')::numeric, 0);

  else
    v_total := v_listing.price * v_units;
  end if;

  return round(greatest(v_total, 0), 2);
end;
$fn$;

comment on function public.quote_booking_item(public.listing_kind, uuid, uuid, date, date, jsonb) is
  'The authoritative price of one booking line, rebuilt from the catalogue. The payload never sets a price.';

grant execute on function public.quote_booking_item(public.listing_kind, uuid, uuid, date, date, jsonb) to anon, authenticated;;
