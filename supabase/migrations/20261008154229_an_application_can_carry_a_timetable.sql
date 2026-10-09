-- submit_partner_application learns the two lists a transport company sends.
--
-- Replaced in full rather than patched: the body below is
-- pg_get_functiondef() of the live function with the bus parts added, so the
-- next change has a textual base and the repository holds what the database
-- actually runs.
--
-- What is new: cities_served on the application, a coaches loop, a routes loop,
-- and the post-check that mirrors the hotel and car ones — a transport company
-- that declares neither a coach nor a route has not told us enough to publish
-- anything, and finding that out at approval time wastes the admin's review.
create or replace function public.submit_partner_application(p_payload jsonb)
returns json
language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_id     uuid;
  v_type   public.partner_type;
  v_item   jsonb;
  v_pos    smallint := 0;
  v_amen   text;
  v_count  int;
  v_days   smallint[];
  v_times  text[];
  v_time   text;
  v_dur    int;
  v_fare   numeric;
begin
  if p_payload->>'type' is null then
    raise exception 'Le type de partenaire est requis.';
  end if;
  v_type := (p_payload->>'type')::public.partner_type;

  if coalesce((p_payload->>'agree')::boolean, false) is not true then
    raise exception 'Les conditions générales doivent être acceptées.';
  end if;

  insert into public.partner_applications (
    type, user_id,
    first_name, last_name, email, phone, whatsapp, locale,
    business_name, legal_name, business_subtype, year_established,
    business_email, business_phone, website, short_desc, full_desc,
    country, department, city, commune, neighborhood, postal_code, landmark, arrival_notes,
    rooms_count, floors, max_capacity, fleet_size, seats_capacity, price_band, stars,
    min_party, max_party, meal_duration_minutes, min_notice_hours,
    confirmation_mode, cancellation_policy,
    daily_rate, weekly_rate, monthly_rate, deposit, included_km_per_day, extra_km_price,
    payout_method, payout_holder, payout_bank, payout_country, payout_currency,
    payout_account_last4, payout_mobile_service,
    agree, photos, cuisines, cities_served
  ) values (
    v_type, auth.uid(),
    trim(p_payload#>>'{contact,firstName}'),
    trim(p_payload#>>'{contact,lastName}'),
    lower(trim(p_payload#>>'{contact,email}')),
    trim(p_payload#>>'{contact,phone}'),
    nullif(trim(coalesce(p_payload#>>'{contact,whatsapp}', '')), ''),
    coalesce(nullif(p_payload#>>'{contact,locale}', ''), 'fr'),

    trim(p_payload#>>'{business,name}'),
    nullif(trim(coalesce(p_payload#>>'{business,legalName}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{business,subtype}', '')), ''),
    public.parse_int(p_payload#>'{business,yearEstablished}', 'Année d''ouverture')::smallint,
    nullif(lower(trim(coalesce(p_payload#>>'{business,email}', ''))), ''),
    nullif(trim(coalesce(p_payload#>>'{business,phone}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{business,website}', '')), ''),
    trim(p_payload#>>'{business,shortDesc}'),
    nullif(trim(coalesce(p_payload#>>'{business,fullDesc}', '')), ''),

    coalesce(nullif(trim(coalesce(p_payload#>>'{location,country}', '')), ''), 'Haïti'),
    nullif(trim(coalesce(p_payload#>>'{location,department}', '')), ''),
    trim(p_payload#>>'{location,city}'),
    nullif(trim(coalesce(p_payload#>>'{location,commune}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{location,neighborhood}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{location,postalCode}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{location,landmark}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{location,arrivalNotes}', '')), ''),

    public.parse_int(p_payload#>'{capacity,rooms}',       'Nombre de chambres')::smallint,
    public.parse_int(p_payload#>'{capacity,floors}',      'Nombre d''étages')::smallint,
    public.parse_int(p_payload#>'{capacity,maxCapacity}', 'Capacité maximale')::smallint,
    public.parse_int(p_payload#>'{capacity,fleetSize}',   'Nombre de véhicules')::smallint,
    public.parse_int(p_payload#>'{capacity,seats}',       'Capacité (couverts)')::smallint,
    nullif(p_payload#>>'{capacity,priceBand}', '')::public.price_band,
    public.parse_int(p_payload#>'{capacity,stars}',       'Classement étoiles')::smallint,

    public.parse_int(p_payload#>'{service,minParty}',     'Taille min. du groupe')::smallint,
    public.parse_int(p_payload#>'{service,maxParty}',     'Taille max. du groupe')::smallint,
    public.parse_int(p_payload#>'{service,mealDuration}', 'Durée d''un repas')::smallint,
    public.parse_int(p_payload#>'{service,minNotice}',    'Délai minimum')::smallint,
    nullif(p_payload#>>'{service,confirmation}', '')::public.confirmation_mode,
    nullif(p_payload#>>'{service,cancellation}', '')::public.cancellation_policy,

    public.parse_num(p_payload#>'{pricing,daily}',      'Tarif / jour'),
    public.parse_num(p_payload#>'{pricing,weekly}',     'Tarif / semaine'),
    public.parse_num(p_payload#>'{pricing,monthly}',    'Tarif / mois'),
    public.parse_num(p_payload#>'{pricing,deposit}',    'Dépôt de garantie'),
    public.parse_int(p_payload#>'{pricing,includedKm}', 'Kilométrage inclus'),
    public.parse_num(p_payload#>'{pricing,extraKm}',    'Supplément kilométrage'),

    nullif(p_payload#>>'{payout,method}', '')::public.payout_method,
    nullif(trim(coalesce(p_payload#>>'{payout,holder}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{payout,bank}', '')), ''),
    nullif(trim(coalesce(p_payload#>>'{payout,country}', '')), ''),
    nullif(p_payload#>>'{payout,currency}', ''),
    nullif(right(regexp_replace(coalesce(p_payload#>>'{payout,accountNum}', ''), '[^0-9]', '', 'g'), 4), ''),
    nullif(trim(coalesce(p_payload#>>'{payout,mobileService}', '')), ''),

    true,
    coalesce(array(select jsonb_array_elements_text(p_payload->'photos')), '{}'),
    -- Free-text labels the applicant ticked; blanks are dropped rather than
    -- stored as an empty cuisine the filters would then offer.
    coalesce(array(
      select btrim(c)
        from jsonb_array_elements_text(coalesce(p_payload->'cuisines', '[]'::jsonb)) as t(c)
       where btrim(c) <> ''
    ), '{}'),
    -- The towns a transport company serves. Same blank-dropping rule: an empty
    -- city would become a gare nobody can find.
    coalesce(array(
      select btrim(c)
        from jsonb_array_elements_text(coalesce(p_payload->'citiesServed', '[]'::jsonb)) as t(c)
       where btrim(c) <> ''
    ), '{}')
  )
  returning id into v_id;

  for v_amen in select jsonb_array_elements_text(coalesce(p_payload->'amenities', '[]'::jsonb)) loop
    insert into public.partner_application_amenities (application_id, amenity_code)
    values (v_id, v_amen) on conflict do nothing;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'rooms', '[]'::jsonb)) loop
    insert into public.partner_application_rooms
      (application_id, name, room_type, capacity, beds, price, units, position)
    values (
      v_id, trim(v_item->>'name'),
      nullif(trim(coalesce(v_item->>'type', '')), ''),
      public.parse_int(v_item->'capacity', 'Capacité de la chambre')::smallint,
      nullif(trim(coalesce(v_item->>'beds', '')), ''),
      public.parse_num(v_item->'price', 'Prix de la chambre'),
      coalesce(public.parse_int(v_item->'units', 'Nombre d''unités')::smallint, 1),
      v_pos);
    v_pos := v_pos + 1;
  end loop;

  v_pos := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'vehicles', '[]'::jsonb)) loop
    insert into public.partner_application_vehicles
      (application_id, make, model, year, body_type, seats, transmission, position)
    values (
      v_id, trim(v_item->>'make'), trim(v_item->>'model'),
      public.parse_int(v_item->'year', 'Année du véhicule')::smallint,
      nullif(trim(coalesce(v_item->>'bodyType', '')), ''),
      public.parse_int(v_item->'seats', 'Nombre de places')::smallint,
      coalesce(nullif(trim(coalesce(v_item->>'transmission', '')), ''), 'Automatique'),
      v_pos);
    v_pos := v_pos + 1;
  end loop;

  -- The fleet. `seats` is the only figure that must be there: it becomes the
  -- capacity of every departure the coach runs, and a guessed capacity either
  -- oversells the coach or leaves seats unsold.
  v_pos := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'coaches', '[]'::jsonb)) loop
    if public.parse_int(v_item->'seats', 'Nombre de places') is null then
      raise exception 'Indiquez le nombre de places de chaque autocar.';
    end if;
    insert into public.partner_application_coaches
      (application_id, label, seats, seat_pattern, coach_type, make, model, year, plate, position)
    values (
      v_id,
      coalesce(nullif(trim(coalesce(v_item->>'label', '')), ''), 'Autocar ' || (v_pos + 1)),
      public.parse_int(v_item->'seats', 'Nombre de places')::smallint,
      coalesce(nullif(v_item->>'seatPattern', '')::public.bus_seat_pattern, '2+2'),
      nullif(trim(coalesce(v_item->>'coachType', '')), ''),
      nullif(trim(coalesce(v_item->>'make', '')), ''),
      nullif(trim(coalesce(v_item->>'model', '')), ''),
      public.parse_int(v_item->'year', 'Année de l''autocar')::smallint,
      nullif(trim(coalesce(v_item->>'plate', '')), ''),
      v_pos);
    v_pos := v_pos + 1;
  end loop;

  -- The routes. The fare and the duration are refused when absent rather than
  -- defaulted: both become facts a passenger buys on, and the car branch sets
  -- the precedent that a vertical never invents a tariff the form did not ask
  -- for. Departure times are optional — a company that gives none gets a
  -- published route and builds the timetable in its dashboard.
  v_pos := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'routes', '[]'::jsonb)) loop
    v_dur  := public.parse_int(v_item->'durationMinutes', 'Durée du trajet');
    v_fare := public.parse_num(v_item->'fare', 'Tarif du trajet');
    if v_dur is null then
      raise exception 'Indiquez la durée de chaque trajet.';
    end if;
    if v_fare is null then
      raise exception 'Indiquez le tarif de chaque trajet.';
    end if;

    v_times := coalesce(array(
      select btrim(t)
        from jsonb_array_elements_text(coalesce(v_item->'departures', '[]'::jsonb)) as x(t)
       where btrim(t) <> ''), '{}');
    foreach v_time in array v_times loop
      if v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Heure de départ invalide: "%". Utilisez le format 06:00.', v_time;
      end if;
    end loop;

    v_days := coalesce(array(
      select (btrim(w))::smallint
        from jsonb_array_elements_text(coalesce(v_item->'weekdays', '[]'::jsonb)) as x(w)
       where btrim(w) <> ''), '{}');
    if cardinality(v_days) = 0 then
      v_days := array[0,1,2,3,4,5,6]::smallint[];
    end if;

    insert into public.partner_application_routes
      (application_id, origin_city, destination_city, stops,
       duration_minutes, fare, departures, weekdays, position)
    values (
      v_id,
      trim(v_item->>'originCity'),
      trim(v_item->>'destinationCity'),
      coalesce(array(
        select btrim(s)
          from jsonb_array_elements_text(coalesce(v_item->'stops', '[]'::jsonb)) as x(s)
         where btrim(s) <> ''), '{}'),
      v_dur::smallint, v_fare, v_times, v_days, v_pos);
    v_pos := v_pos + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'hours', '[]'::jsonb)) loop
    insert into public.partner_application_hours (application_id, weekday, is_open, opens_at, closes_at)
    values (
      v_id,
      public.parse_int(v_item->'weekday', 'Jour')::smallint,
      coalesce((v_item->>'isOpen')::boolean, false),
      case when coalesce((v_item->>'isOpen')::boolean, false) then nullif(v_item->>'opensAt',  '')::time end,
      case when coalesce((v_item->>'isOpen')::boolean, false) then nullif(v_item->>'closesAt', '')::time end)
    on conflict (application_id, weekday) do nothing;
  end loop;

  -- Verification documents, with the required set enforced.
  perform public.attach_application_documents(v_id, v_type, p_payload->'documents');

  if v_type in ('hotel', 'guesthouse') then
    select count(*) into v_count from public.partner_application_rooms where application_id = v_id;
    if v_count = 0 then raise exception 'Ajoutez au moins une chambre avant de soumettre.'; end if;
  end if;
  if v_type = 'car' then
    select count(*) into v_count from public.partner_application_vehicles where application_id = v_id;
    if v_count = 0 then raise exception 'Ajoutez au moins un véhicule avant de soumettre.'; end if;
  end if;
  if v_type = 'bus' then
    select count(*) into v_count from public.partner_application_coaches where application_id = v_id;
    if v_count = 0 then raise exception 'Ajoutez au moins un autocar avant de soumettre.'; end if;
    select count(*) into v_count from public.partner_application_routes where application_id = v_id;
    if v_count = 0 then raise exception 'Ajoutez au moins un trajet avant de soumettre.'; end if;
  end if;

  return json_build_object('id', v_id, 'status', 'new');
end;
$function$;;
