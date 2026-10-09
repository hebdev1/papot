-- quote_booking_item learns that a bus ticket is priced per passenger.
--
-- Replaced in full from pg_get_functiondef(); the three existing branches are
-- unchanged.
--
-- Two facts force the shape of the bus branch. `p_from`/`p_to` are dates, so a
-- 06:00 and a 14:00 departure on the same day are indistinguishable here — the
-- departure has to come from the options. And the unit of sale is a passenger,
-- not a night, so the day count every other branch multiplies by is ignored:
-- without this branch a bus fell through to `price × days` and a same-day trip
-- was priced as one night, which is almost right and therefore dangerous.
--
-- The browser names things and never prices them: `fare_class`, `passengers`,
-- `extra_bags`, `departure_id`. Every figure below is read from the catalogue.
create or replace function public.quote_booking_item(
  p_kind    public.listing_kind,
  p_listing uuid,
  p_unit    uuid,
  p_from    date,
  p_to      date,
  p_options jsonb default '{}'::jsonb
) returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_listing public.listings;
  v_attrs   jsonb;
  v_units   integer;
  v_rate    numeric;
  v_total   numeric;
  v_pickup  jsonb;
  v_dep     public.bus_departures;
  v_base    numeric;
  v_class   text;
  v_amt     numeric;
  v_pct     numeric;
  v_pax     integer;
  v_bags    integer;
  v_lug     public.bus_luggage_rules;
begin
  select * into v_listing from public.listings where id = p_listing;
  if not found then
    raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
  end if;
  v_attrs := coalesce(v_listing.attrs, '{}'::jsonb);

  -- A table costs nothing to reserve. Saying so here means the browser cannot
  -- say otherwise either.
  -- `p_kind` is ignored. The row it describes was just read into
  -- `v_listing`, so the argument was never information this function lacked --
  -- only an opportunity for a caller to disagree with the catalogue. It stays
  -- in the signature because that signature is granted to anon and
  -- authenticated and is typed in the generated client.
  if v_listing.kind = 'restaurant' then
    return 0;
  end if;

  -- ───────────────────────────────────────────────────────── transport ──
  if v_listing.kind = 'bus' then
    select * into v_dep
      from public.bus_departures
     -- The departure must belong to the annonce being bought. Without this
     -- pairing a payload could name a cheap route and an expensive route's
     -- departure, and the fare would be read from the wrong one.
     where id = nullif(p_options->>'departure_id', '')::uuid
       and listing_id = p_listing;
    if not found then
      raise exception 'Ce départ n''existe pas sur ce trajet.' using errcode = 'P0002';
    end if;

    -- One fare source: the annonce's price, which a departure may override.
    v_base := coalesce(v_dep.fare, v_listing.price);

    v_class := coalesce(nullif(btrim(p_options->>'fare_class'), ''), 'standard');
    select f.amount, f.percent_of_base into v_amt, v_pct
      from public.bus_fares f
     where f.listing_id = p_listing and f.class = v_class and f.active;
    -- A class the company does not offer is charged at the full fare rather
    -- than refused or discounted: naming "child" cannot make a seat cheaper
    -- than the operator decided it is.
    v_rate := coalesce(v_amt,
                       case when v_pct is not null then v_base * v_pct / 100 end,
                       v_base);

    v_pax := greatest(least(coalesce((p_options->>'passengers')::integer, 1), 20), 1);
    v_total := v_rate * v_pax;

    -- Extra bags, only as many as the route actually sells, and only at the
    -- price it set. A route with no luggage rule sells no extra bags.
    v_bags := greatest(coalesce((p_options->>'extra_bags')::integer, 0), 0);
    if v_bags > 0 then
      select * into v_lug from public.bus_luggage_rules where listing_id = p_listing;
      if found and v_lug.extra_price_per_bag is not null then
        v_bags := least(v_bags, coalesce(v_lug.max_extra_bags, 0));
        v_total := v_total + v_lug.extra_price_per_bag * v_bags;
      end if;
    end if;

    return round(greatest(v_total, 0), 2);
  end if;

  v_units := greatest(coalesce(p_to, p_from + 1) - p_from, 1);

  if v_listing.kind = 'stay' then
    -- The chosen room type carries its own tariff; the annonce's is the
    -- fallback the fiche uses when no unit is selected.
    select u.price into v_rate
      from public.listing_units u
     where u.id = p_unit and u.listing_id = p_listing;
    v_rate := coalesce(v_rate, v_listing.price);

    v_total := v_rate * v_units
             + coalesce((v_attrs->>'cleaning_fee')::numeric, 0)
             + coalesce((v_attrs->>'service_fee')::numeric, 0);

  elsif v_listing.kind = 'car' then
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
$$;;
