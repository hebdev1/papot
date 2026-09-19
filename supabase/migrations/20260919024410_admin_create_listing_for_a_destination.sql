/**
 * An établissement created from the admin console, attached to a destination.
 *
 * The city is not typed here. It is read from the destination, which is the
 * whole point: a listing entered by hand was how "cap haitien" came to exist
 * beside "Cap-Haïtien" and matched neither the counter nor the search. Choosing
 * a destination fixes the city, the country and the département together.
 *
 * It creates what each métier needs to actually work, not just the row:
 *   - a séjour gets its first room type, or it is not bookable;
 *   - a restaurant gets its details and its reservation settings.
 *
 * It refuses to invent. A restaurant's cuisine and price band are required
 * arguments rather than defaults, for the same reason `build_partner_listings`
 * writes no `car_details`: a guessed spec on a card reads as fact to a
 * traveller. A vehicle therefore gets no `car_details` here either — the form
 * does not collect a fuel type or a drivetrain.
 */
create or replace function public.admin_create_listing(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_dest      public.destinations;
  v_kind      public.listing_kind;
  v_name      text;
  v_type      text;
  v_price     numeric;
  v_published boolean;
  v_id        uuid;
  v_location  text;
  v_cuisine   text;
  v_band      public.price_band;
  v_unit_name text;
begin
  if not public.admin_can('moderate_listings') then
    raise exception 'Permission requise : moderate_listings' using errcode = '42501';
  end if;

  select * into v_dest
    from public.destinations
   where id = nullif(p_payload->>'destination_id', '')::uuid;
  if not found then
    raise exception 'Destination introuvable.' using errcode = 'P0002';
  end if;

  v_kind      := nullif(p_payload->>'kind', '')::public.listing_kind;
  v_name      := nullif(btrim(p_payload->>'name'), '');
  v_type      := nullif(btrim(p_payload->>'type'), '');
  v_price     := nullif(btrim(p_payload->>'price'), '')::numeric;
  v_published := coalesce((p_payload->>'published')::boolean, true);

  if v_kind is null then raise exception 'Le métier est obligatoire.'   using errcode = '23514'; end if;
  if v_name is null then raise exception 'Le nom est obligatoire.'      using errcode = '23514'; end if;
  if v_type is null then raise exception 'Le type est obligatoire.'     using errcode = '23514'; end if;
  if v_price is null or v_price < 0 then
    raise exception 'Un prix valide est obligatoire.' using errcode = '23514';
  end if;

  v_location := nullif(btrim(concat_ws(', ', v_dest.city, v_dest.region)), '');

  insert into public.listings
    (kind, name, type, city, country, location, price, published, status, stars, attrs)
  values (
    v_kind, v_name, v_type, v_dest.city, v_dest.country, coalesce(v_location, v_dest.city),
    v_price, v_published,
    case when v_published then 'published' else 'draft' end::public.listing_status,
    nullif(btrim(p_payload->>'stars'), '')::smallint,
    jsonb_strip_nulls(jsonb_build_object(
      'subtitle',    nullif(btrim(p_payload->>'subtitle'), ''),
      'description', nullif(btrim(p_payload->>'description'), ''),
      'breadcrumb',  nullif(btrim(concat_ws(' · ',
                       case v_kind when 'stay' then 'Hébergements'
                                   when 'car' then 'Voitures'
                                   else 'Restaurants' end,
                       v_dest.region, v_dest.city)), '')))
  )
  returning id into v_id;

  -- A séjour without a room type has nothing to sell.
  if v_kind = 'stay' then
    v_unit_name := coalesce(nullif(btrim(p_payload->>'unit_name'), ''), 'Chambre standard');
    insert into public.listing_units (listing_id, name, detail, price, units, available)
    values (
      v_id,
      v_unit_name,
      coalesce(nullif(btrim(p_payload->>'unit_detail'), ''), '2 voyageurs'),
      coalesce(nullif(btrim(p_payload->>'unit_price'), '')::numeric, v_price),
      greatest(coalesce(nullif(btrim(p_payload->>'unit_units'), '')::integer, 1), 1),
      true);
  end if;

  -- A restaurant's fiche reads these, and both columns are required. They are
  -- asked for rather than guessed.
  if v_kind = 'restaurant' then
    v_cuisine := nullif(btrim(p_payload->>'cuisine'), '');
    v_band    := nullif(btrim(p_payload->>'price_band'), '')::public.price_band;
    if v_cuisine is null then
      raise exception 'La cuisine est obligatoire pour un restaurant.' using errcode = '23514';
    end if;
    if v_band is null then
      raise exception 'La gamme de prix est obligatoire pour un restaurant.' using errcode = '23514';
    end if;

    insert into public.restaurant_details (listing_id, cuisine, price_band)
    values (v_id, v_cuisine, v_band);

    insert into public.restaurant_settings (listing_id)
    values (v_id)
    on conflict (listing_id) do nothing;
  end if;

  perform public.admin_log(
    'listing_created', 'listing', v_id::text, v_name,
    null,
    jsonb_build_object('kind', v_kind, 'city', v_dest.city, 'price', v_price, 'published', v_published),
    null, 'notice');

  return jsonb_build_object('id', v_id, 'city', v_dest.city, 'kind', v_kind);
end;
$fn$;

comment on function public.admin_create_listing(jsonb) is
  'Creates an établissement attached to a destination, with the companion rows its métier needs. Requires moderate_listings.';

revoke execute on function public.admin_create_listing(jsonb) from public, anon;
grant  execute on function public.admin_create_listing(jsonb) to authenticated;;
