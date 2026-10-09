-- build_partner_listings learns the transport branch.
--
-- Replaced in full from pg_get_functiondef() rather than patched textually, so
-- the repository holds the body the database runs and the next change has a
-- base to work from.
--
-- Until now, approving a bus application created the partner, the owner
-- membership and zero listings — silently, with `listings_created: 0` in the
-- audit row and nothing to tell the admin that a whole metier had no branch.
--
-- The branch builds, in dependency order: the coaches, the gares, one annonce
-- per declared route with its stops, and the timetable. It invents nothing — an
-- intermediate stop with no declared time gets no time, a route with no declared
-- departure times gets no schedule, and a gare in a town we have no address for
-- gets no address. Everything lands as 'draft', for the company to finish.
create or replace function public.build_partner_listings(p_partner uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  p          partners%rowtype;
  a          partner_applications%rowtype;
  v          partner_application_vehicles%rowtype;
  v_dept     text;
  v_city     text;
  v_commune  text;
  v_location text;
  v_subtype  text;
  v_cuisine  text;
  v_amen     text[];
  v_photos   jsonb;
  v_hours    text;
  v_terms    jsonb;
  v_listing  uuid;
  v_created  integer := 0;
  v_min_party smallint;
  v_max_party smallint;
  n_open     integer;
  n_closed   integer;
  n_times    integer;
  t_open     time;
  t_close    time;
  v_days     text;
  c          partner_application_coaches%rowtype;
  r          partner_application_routes%rowtype;
  v_fleet    text;
  v_coach    uuid;
  v_term     uuid;
  v_town     text;
  v_pos      smallint;
  v_time     text;
  v_address  text;
begin
  select * into p from partners where id = p_partner;
  if not found then
    return 0;
  end if;

  -- Idempotent on purpose. Approving twice, retrying after a failure or
  -- backfilling an older partner must never hand anyone a duplicate
  -- catalogue, so a partner that already owns a listing is left untouched.
  if exists (select 1 from listings where partner_id = p_partner) then
    return 0;
  end if;

  select * into a from partner_applications where id = p.application_id;
  if not found then
    return 0;   -- a partner created by hand has no file to build from
  end if;

  v_city     := nullif(btrim(coalesce(a.city, '')), '');
  v_dept     := nullif(btrim(coalesce(a.department, '')), '');
  v_commune  := nullif(btrim(coalesce(a.commune, '')), '');
  if lower(coalesce(v_commune, '')) = lower(coalesce(v_city, '')) then
    v_commune := null;
  end if;
  v_location := nullif(btrim(concat_ws(', ', v_city, v_dept)), '');
  v_subtype  := nullif(btrim(coalesce(a.business_subtype, '')), '');

  -- What the kitchen actually cooks. business_subtype is the restaurant's
  -- format ("Bistrot", "Pizzeria", "Café"), never a cuisine, so it stands in
  -- only for the older files submitted before the form recorded one.
  v_cuisine  := coalesce(nullif(btrim(coalesce(a.cuisines[1], '')), ''), v_subtype);

  v_photos   := case when coalesce(array_length(a.photos, 1), 0) > 0
                     then to_jsonb(a.photos) end;

  -- The codes the applicant ticked become the French labels the public search
  -- filters compare against ("Générateur", "Wi-Fi", "Piscine").
  select coalesce(array_agg(pa.label_fr order by pa.position, pa.label_fr), '{}')
    into v_amen
    from partner_application_amenities m
    join partner_amenities pa on pa.code = m.amenity_code
   where m.application_id = a.id;

  -- One sentence of opening hours, and only when every open day shares the
  -- same times. A schedule that varies by day is left for the partner to
  -- describe rather than flattened into something untrue.
  select count(*) filter (where h.is_open),
         count(*) filter (where not h.is_open),
         count(distinct (h.opens_at, h.closes_at))
           filter (where h.is_open and h.opens_at is not null and h.closes_at is not null),
         min(h.opens_at)  filter (where h.is_open),
         max(h.closes_at) filter (where h.is_open)
    into n_open, n_closed, n_times, t_open, t_close
    from partner_application_hours h
   where h.application_id = a.id;

  if coalesce(n_open, 0) > 0 and n_times = 1 then
    if n_open >= 7 then
      v_days := 'tous les jours';
    elsif n_closed between 1 and 2 then
      select 'tous les jours sauf ' || string_agg(d.label, ' et ' order by h.weekday)
        into v_days
        from partner_application_hours h
        join (values (0, 'lundi'), (1, 'mardi'), (2, 'mercredi'), (3, 'jeudi'),
                     (4, 'vendredi'), (5, 'samedi'), (6, 'dimanche')) as d(wd, label)
          on d.wd = h.weekday
       where h.application_id = a.id and not h.is_open;
    else
      select string_agg(d.label, ', ' order by h.weekday)
        into v_days
        from partner_application_hours h
        join (values (0, 'lundi'), (1, 'mardi'), (2, 'mercredi'), (3, 'jeudi'),
                     (4, 'vendredi'), (5, 'samedi'), (6, 'dimanche')) as d(wd, label)
          on d.wd = h.weekday
       where h.application_id = a.id and h.is_open;
    end if;

    v_hours := 'Ouvert ' || v_days || ', '
      || to_char(t_open,  'FMHH24') || ' h'
      || case when extract(minute from t_open)  > 0 then ' ' || to_char(t_open,  'MI') else '' end
      || ' – '
      || to_char(t_close, 'FMHH24') || ' h'
      || case when extract(minute from t_close) > 0 then ' ' || to_char(t_close, 'MI') else '' end;
  end if;

  ------------------------------------------------------------------ lodging --
  -- A hotel or a guesthouse is one property; the declared room types become
  -- the units the Chambres screen manages.
  if p.type in ('hotel', 'guesthouse') then
    insert into listings (partner_id, kind, type, name, location, city, country,
                          vendor, price, currency, stars, amenities, status, attrs)
    values (
      p_partner,
      'stay',
      coalesce(v_subtype, case when p.type = 'hotel' then 'Hôtel' else 'Maison d''hôtes' end),
      p.business_name,
      coalesce(v_location, p.business_name),
      coalesce(v_city, coalesce(p.city, '')),
      coalesce(a.country, 'Haïti'),
      p.business_name,
      -- The cheapest declared room is the "à partir de" price a card shows.
      coalesce((select min(r.price) from partner_application_rooms r
                 where r.application_id = a.id), 0),
      'USD',
      -- Only a hotel declares one; a guesthouse leaves it null rather than
      -- being handed a rating nobody awarded it.
      a.stars,
      v_amen,
      'draft',
      jsonb_strip_nulls(jsonb_build_object(
        'blurb',       nullif(btrim(coalesce(a.short_desc, '')), ''),
        'description', nullif(btrim(coalesce(a.full_desc, a.short_desc, '')), ''),
        'subtitle',    nullif(btrim(concat_ws(' · ', v_location,
                         case when a.rooms_count  is not null then a.rooms_count  || ' chambres'   end,
                         case when a.max_capacity is not null then a.max_capacity || ' voyageurs' end)), ''),
        'breadcrumb',  nullif(btrim(concat_ws(' · ', 'Hébergements', v_dept, v_city)), ''),
        'facilities',  case when coalesce(array_length(v_amen, 1), 0) > 0 then to_jsonb(v_amen) end,
        'verified',    (p.verification = 'verified'),
        'host_since',  a.year_established::text,
        -- Storage paths, not URLs: the bucket is private, so the public card
        -- still has no image until someone gives the listing one.
        'photos',      v_photos
      ))
    )
    returning id into v_listing;
    v_created := 1;

    insert into listing_units (listing_id, name, detail, price, units, position)
    select v_listing,
           r.name,
           coalesce(nullif(btrim(concat_ws(' · ',
             nullif(btrim(coalesce(r.room_type, '')), ''),
             r.capacity || ' personnes',
             nullif(btrim(coalesce(r.beds, '')), ''))), ''), ''),
           r.price,
           greatest(coalesce(r.units, 1), 1),
           r.position
      from partner_application_rooms r
     where r.application_id = a.id;

  --------------------------------------------------------------------- cars --
  -- A rental company is a fleet: every declared vehicle is its own listing,
  -- because that is what a traveller books.
  elsif p.type = 'car' then
    v_terms :=
        (case when a.deposit is not null then jsonb_build_array(jsonb_build_object(
           'k', 'Caution', 'v', to_char(a.deposit, 'FM999999990.00') || ' USD')) else '[]'::jsonb end)
     || (case when a.included_km_per_day is not null then jsonb_build_array(jsonb_build_object(
           'k', 'Kilométrage inclus', 'v', a.included_km_per_day || ' km / jour')) else '[]'::jsonb end)
     || (case when a.extra_km_price is not null then jsonb_build_array(jsonb_build_object(
           'k', 'Kilomètre supplémentaire', 'v', to_char(a.extra_km_price, 'FM999999990.00') || ' USD')) else '[]'::jsonb end)
     || (case when a.weekly_rate is not null then jsonb_build_array(jsonb_build_object(
           'k', 'Tarif semaine', 'v', to_char(a.weekly_rate, 'FM999999990.00') || ' USD')) else '[]'::jsonb end)
     || (case when a.monthly_rate is not null then jsonb_build_array(jsonb_build_object(
           'k', 'Tarif mois', 'v', to_char(a.monthly_rate, 'FM999999990.00') || ' USD')) else '[]'::jsonb end);

    for v in
      select * from partner_application_vehicles
       where application_id = a.id
       order by position, make, model
    loop
      insert into listings (partner_id, kind, type, name, location, city, country,
                            vendor, price, currency, amenities, status, attrs)
      values (
        p_partner,
        'car',
        coalesce(nullif(btrim(coalesce(v.body_type, '')), ''), 'Voiture'),
        btrim(concat_ws(' ', v.make, v.model, v.year::text)),
        coalesce(v_city, p.business_name),
        coalesce(v_city, coalesce(p.city, '')),
        coalesce(a.country, 'Haïti'),
        p.business_name,
        coalesce(a.daily_rate, 0),
        'USD',
        -- No car_details row: that table requires a fuel type and a drivetrain
        -- the form never asks for. The card falls back to these badges, which
        -- hold only what the partner actually declared.
        array_remove(array[
          nullif(btrim(coalesce(v.transmission, '')), ''),
          v.seats || ' places',
          nullif(btrim(coalesce(v.body_type, '')), '')
        ], null),
        'draft',
        jsonb_strip_nulls(jsonb_build_object(
          'body',     nullif(btrim(coalesce(v.body_type, '')), ''),
          'subtitle', nullif(btrim(concat_ws(' · ', concat_ws(' ', v.make, v.model),
                                             v.year::text, v_location)), ''),
          'specs',    jsonb_build_array(
                        jsonb_build_object('k', 'Transmission', 'v', v.transmission),
                        jsonb_build_object('k', 'Places',       'v', v.seats::text),
                        jsonb_build_object('k', 'Année',        'v', v.year::text))
                      || (case when nullif(btrim(coalesce(v.body_type, '')), '') is not null
                               then jsonb_build_array(jsonb_build_object('k', 'Carrosserie', 'v', v.body_type))
                               else '[]'::jsonb end),
          'terms',    nullif(v_terms, '[]'::jsonb),
          'photos',   v_photos
        ))
      );
      v_created := v_created + 1;
    end loop;

    -- Where the keys are handed over. The business address is the one place we
    -- know for certain; extra counters are for the partner to add.
    if not exists (select 1 from pickup_locations where partner_id = p_partner) then
      insert into pickup_locations (partner_id, name, kind, address, hours, instructions)
      values (p_partner, p.business_name, 'office',
              nullif(btrim(concat_ws(', ',
                nullif(btrim(coalesce(a.neighborhood, '')), ''),
                v_commune, v_city, v_dept)), ''),
              v_hours,
              nullif(btrim(coalesce(a.arrival_notes, '')), ''));
    end if;

  ---------------------------------------------------------------- transport --
  -- A transport company is a network: a fleet, a set of gares, and one annonce
  -- per route. Built in dependency order, because a schedule needs a coach and
  -- a stop needs a gare.
  elsif p.type = 'bus' then
    v_address := nullif(btrim(concat_ws(', ',
                   nullif(btrim(coalesce(a.neighborhood, '')), ''),
                   v_commune, v_city, v_dept)), '');

    -- 1. The fleet. `label` is what the company called each coach; when two
    -- carry the same label the position disambiguates, because losing a coach
    -- to a unique constraint would quietly lose its capacity.
    for c in
      select * from partner_application_coaches
       where application_id = a.id
       order by position
    loop
      v_fleet := coalesce(nullif(btrim(c.label), ''), 'Autocar ' || (c.position + 1));
      if exists (select 1 from bus_coaches
                  where partner_id = p_partner and fleet_no = v_fleet) then
        v_fleet := v_fleet || ' #' || (c.position + 1);
      end if;

      insert into bus_coaches (partner_id, fleet_no, plate, make, model, year,
                               coach_type, seat_capacity, seat_pattern, amenities,
                               photos, status)
      values (p_partner, v_fleet, c.plate, c.make, c.model, c.year,
              c.coach_type, c.seats, c.seat_pattern, v_amen,
              coalesce(a.photos, '{}'), 'active');
    end loop;

    -- 2. The gares, one per town the company named — the ends of every route,
    -- every intermediate stop, and anything extra in cities_served. Only the
    -- home town gets an address, hours and arrival notes, because that is the
    -- only one the file describes; the rest are a name on a map for the company
    -- to complete.
    for v_town in
      select distinct t
        from (
          select unnest(array[r2.origin_city, r2.destination_city]) as t
            from partner_application_routes r2 where r2.application_id = a.id
          union all
          select unnest(r3.stops) from partner_application_routes r3
           where r3.application_id = a.id
          union all
          select unnest(a.cities_served)
        ) as towns
       where nullif(btrim(coalesce(t, '')), '') is not null
       order by t
    loop
      insert into bus_terminals (partner_id, name, city, country, address, hours,
                                 instructions, destination_id)
      values (
        p_partner,
        'Gare ' || btrim(v_town),
        btrim(v_town),
        coalesce(a.country, 'Haïti'),
        case when lower(btrim(v_town)) = lower(coalesce(v_city, '')) then v_address end,
        case when lower(btrim(v_town)) = lower(coalesce(v_city, '')) then v_hours end,
        case when lower(btrim(v_town)) = lower(coalesce(v_city, ''))
             then nullif(btrim(coalesce(a.arrival_notes, '')), '') end,
        (select d.id from destinations d
          where lower(d.city) = lower(btrim(v_town))
            and lower(d.country) = lower(coalesce(a.country, 'Haïti'))
          limit 1))
      on conflict (partner_id, name) do nothing;
    end loop;

    -- 3. One annonce per route, its stops, and its timetable.
    for r in
      select * from partner_application_routes
       where application_id = a.id
       order by position
    loop
      insert into listings (partner_id, kind, type, name, location, city, country,
                            vendor, price, currency, amenities, status, attrs)
      values (
        p_partner,
        'bus',
        coalesce(v_subtype, 'Autocar'),
        btrim(r.origin_city) || ' → ' || btrim(r.destination_city),
        btrim(r.origin_city) || ' → ' || btrim(r.destination_city),
        -- The destination, not the home town: attach_items_to_trips groups a
        -- journey by listings.city, so a ticket must file itself under where it
        -- goes.
        btrim(r.destination_city),
        coalesce(a.country, 'Haïti'),
        p.business_name,
        -- The fare the company declared. listings.price is the one fare source;
        -- bus_departures.fare only ever overrides it.
        r.fare,
        'USD',
        v_amen,
        'draft',
        jsonb_strip_nulls(jsonb_build_object(
          'blurb',       nullif(btrim(coalesce(a.short_desc, '')), ''),
          'description', nullif(btrim(coalesce(a.full_desc, a.short_desc, '')), ''),
          'subtitle',    btrim(r.origin_city) || ' → ' || btrim(r.destination_city)
                           || ' · ' || (r.duration_minutes / 60) || ' h'
                           || case when r.duration_minutes % 60 > 0
                                   then ' ' || (r.duration_minutes % 60) else '' end,
          'breadcrumb',  nullif(btrim(concat_ws(' · ', 'Transport',
                                                btrim(r.origin_city),
                                                btrim(r.destination_city))), ''),
          'duration_minutes', r.duration_minutes,
          'operator',    p.business_name,
          'verified',    (p.verification = 'verified'),
          'photos',      v_photos
        ))
      )
      returning id into v_listing;
      v_created := v_created + 1;

      -- The itinerary. The origin is reached at 0 and the terminus at the
      -- declared duration; an intermediate stop gets no time, because the form
      -- never asked for one and a stop that claims to be reached at departure
      -- time would be a lie printed on a timetable.
      v_pos := 0;
      select id into v_term from bus_terminals
       where partner_id = p_partner and name = 'Gare ' || btrim(r.origin_city);
      if v_term is not null then
        insert into bus_route_stops (listing_id, position, terminal_id,
                                     arrive_offset_minutes, boarding, alighting)
        values (v_listing, v_pos, v_term, 0, true, false);
        v_pos := v_pos + 1;
      end if;

      foreach v_town in array coalesce(r.stops, '{}') loop
        select id into v_term from bus_terminals
         where partner_id = p_partner and name = 'Gare ' || btrim(v_town);
        if v_term is not null then
          insert into bus_route_stops (listing_id, position, terminal_id,
                                       arrive_offset_minutes)
          values (v_listing, v_pos, v_term, null);
          v_pos := v_pos + 1;
        end if;
      end loop;

      select id into v_term from bus_terminals
       where partner_id = p_partner and name = 'Gare ' || btrim(r.destination_city);
      if v_term is not null then
        insert into bus_route_stops (listing_id, position, terminal_id,
                                     arrive_offset_minutes, boarding, alighting)
        values (v_listing, v_pos, v_term, r.duration_minutes, false, true);
      end if;

      -- The timetable, one schedule per declared departure time, on the first
      -- coach. A route whose file named no times gets none: the company builds
      -- it at /partenaire/departs, which is the honest outcome of a form that
      -- did not ask.
      select id into v_coach from bus_coaches
       where partner_id = p_partner order by fleet_no limit 1;

      if v_coach is not null then
        foreach v_time in array coalesce(r.departures, '{}') loop
          insert into bus_schedules (listing_id, coach_id, weekdays, departs_at,
                                     duration_minutes, starts_on, active)
          values (v_listing, v_coach, r.weekdays, v_time::time,
                  r.duration_minutes, current_date, true);
        end loop;
      end if;
    end loop;

  -------------------------------------------------------------- restaurants --
  -- A restaurant is one listing. Its price stays at zero, as the other
  -- restaurants do: a table is booked, not bought.
  elsif p.type = 'restaurant' then
    insert into listings (partner_id, kind, type, name, location, city, country,
                          vendor, price, currency, amenities, status, attrs)
    values (
      p_partner,
      'restaurant',
      -- `type` stays the format: it is what the card's category line says.
      coalesce(v_subtype, 'Restaurant'),
      p.business_name,
      btrim(concat_ws(' · ', coalesce(v_subtype, 'Restaurant'), v_city)),
      coalesce(v_city, coalesce(p.city, '')),
      coalesce(a.country, 'Haïti'),
      p.business_name,
      0,
      'USD',
      v_amen,
      'draft',
      jsonb_strip_nulls(jsonb_build_object(
        'cuisine',     v_cuisine,
        -- The rest of what was declared, so nothing past the first is lost
        -- between the file and the listing the partner finishes.
        'cuisines',    case when coalesce(array_length(a.cuisines, 1), 0) > 0
                            then to_jsonb(a.cuisines) end,
        'price_band',  a.price_band::text,
        'subtitle',    nullif(btrim(concat_ws(' · ', v_subtype, v_location)), ''),
        'breadcrumb',  nullif(btrim(concat_ws(' · ', 'Restaurants', v_city)), ''),
        'hours',       v_hours,
        'blurb',       nullif(btrim(coalesce(a.short_desc, '')), ''),
        'description', nullif(btrim(coalesce(a.full_desc, a.short_desc, '')), ''),
        'photos',      v_photos
      ))
    )
    returning id into v_listing;
    v_created := 1;

    -- Only when the file carries a price band: the column is required, and a
    -- guessed "$$" is a claim about someone's prices.
    if a.price_band is not null then
      insert into restaurant_details (listing_id, cuisine, price_band, neighborhood,
                                      capacity, instant_confirmation, accepts_groups)
      values (v_listing,
              coalesce(v_cuisine, 'Restaurant'),
              a.price_band::text,
              nullif(btrim(coalesce(a.neighborhood, '')), ''),
              a.seats_capacity,
              coalesce(a.confirmation_mode = 'automatique', true),
              coalesce(a.max_party, 0) >= 8);
    end if;

    -- The booking rules the applicant actually answered. Clamped to what the
    -- settings table accepts: the application allows a party of 5000, a dining
    -- room does not.
    v_min_party := least(greatest(coalesce(a.min_party, 1), 1), 200);
    v_max_party := least(greatest(coalesce(a.max_party, 12), v_min_party), 200);

    insert into restaurant_settings (
      listing_id, min_party, max_party, default_duration_minutes,
      min_notice_minutes, auto_confirm, cancellation_policy)
    values (
      v_listing,
      v_min_party,
      v_max_party,
      coalesce(a.meal_duration_minutes, 90),
      coalesce(a.min_notice_hours * 60, 120),
      coalesce(a.confirmation_mode = 'automatique', true),
      a.cancellation_policy);

    -- The declared schedule becomes the availability calendar. A service that
    -- runs past midnight is skipped rather than reshaped into something the
    -- restaurant did not say; the partner adds it from the dashboard.
    insert into restaurant_hours (listing_id, weekday, opens_at, closes_at, position)
    select v_listing, h.weekday, h.opens_at, h.closes_at, h.weekday
      from partner_application_hours h
     where h.application_id = a.id
       and h.is_open
       and h.opens_at  is not null
       and h.closes_at is not null
       and h.closes_at > h.opens_at;
  end if;

  return v_created;
end;
$function$;;
