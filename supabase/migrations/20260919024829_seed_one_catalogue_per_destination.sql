/**
 * An hébergement and a table in every destination the site features.
 *
 * Five destinations were advertised on the home page with nothing behind them,
 * and now that the counters are measured they would read "Bientôt sur PAPOT"
 * instead of a fictional 27. This gives each one a real catalogue to show while
 * the platform fills with actual partners.
 *
 * **These establishments do not exist.** They carry `attrs->>'seed' = 'true'`
 * so they can be found and removed in one statement before launch:
 *
 *     delete from public.listings where attrs->>'seed' = 'true';
 *
 * Nothing here invents a specification. A séjour gets its room type because a
 * room type is what makes it bookable; a restaurant gets the cuisine and price
 * band its table requires. No `car_details` is written, and no photograph is
 * attached — the cards say "photo à fournir", which is true.
 */
do $do$
declare
  v_row     record;
  v_dest    public.destinations;
  v_id      uuid;
  v_loc     text;
begin
  for v_row in
    select * from (values
      -- (city, kind, type, name, subtitle, price, unit name, units, cuisine, band)
      ('Côte des Arcadins','stay','Hôtel','Lambi Beach Resort','Pieds dans l''eau, entre Montrouis et Luly',120,'Chambre vue mer',14,null,null),
      ('Côte des Arcadins','stay','Maison d''hôtes','Kay Solèy','Six chambres sur la plage, petit-déjeuner créole',75,'Chambre double',6,null,null),
      ('Côte des Arcadins','restaurant','Restaurant','Chez Ti Jan',null,28,null,null,'Fruits de mer','$$'),

      ('Île-à-Vache','stay','Écolodge','Abaka Lodge','Bungalows en bois, sans voitures sur l''île',140,'Bungalow jardin',9,null,null),
      ('Île-à-Vache','restaurant','Table d''hôtes','Manje Lanmè',null,32,null,null,'Créole','$$'),

      ('Labadie','stay','Maison d''hôtes','Kay Labadi','Sur la baie, navette bateau incluse',95,'Chambre vue baie',7,null,null),
      ('Labadie','restaurant','Restaurant','Bèl Plaj',null,30,null,null,'Fruits de mer','$$'),

      ('Les Cayes','stay','Hôtel','Otèl Sid','Au centre, à vingt minutes de Gelée',80,'Chambre standard',22,null,null),
      ('Les Cayes','stay','Maison d''hôtes','Villa Gelée','Maison familiale à deux pas de la plage',65,'Chambre double',5,null,null),
      ('Les Cayes','restaurant','Bistrot','Gwo Digo',null,18,null,null,'Créole','$'),

      ('Port-Salut','stay','Hôtel','Pointe Sable','Face au sable blanc de Pointe-Sable',110,'Chambre vue mer',16,null,null),
      ('Port-Salut','restaurant','Restaurant','Kokoye',null,26,null,null,'Fruits de mer','$$'),

      ('Jacmel','stay','Maison d''hôtes','Kay Kafou Mouton','Maison à colonnades du centre historique',70,'Chambre artisanale',8,null,null),
      ('Cap-Haïtien','stay','Hôtel','Otèl Boulva','Sur le boulevard, vue sur la baie',90,'Chambre standard',26,null,null)
    ) as s(city, kind, type, name, subtitle, price, unit_name, units, cuisine, band)
  loop
    select * into v_dest from public.destinations d where d.city = v_row.city;
    if not found then
      raise exception 'Destination % introuvable', v_row.city;
    end if;

    v_loc := nullif(btrim(concat_ws(', ', v_dest.city, v_dest.region)), '');

    insert into public.listings
      (kind, name, type, city, country, location, price, published, status, attrs)
    values (
      v_row.kind::public.listing_kind, v_row.name, v_row.type,
      v_dest.city, v_dest.country, coalesce(v_loc, v_dest.city),
      v_row.price, true, 'published'::public.listing_status,
      jsonb_strip_nulls(jsonb_build_object(
        'seed',       'true',
        'subtitle',   v_row.subtitle,
        'breadcrumb', nullif(btrim(concat_ws(' · ',
                        case v_row.kind when 'stay' then 'Hébergements' else 'Restaurants' end,
                        v_dest.region, v_dest.city)), ''))))
    returning id into v_id;

    if v_row.kind = 'stay' then
      insert into public.listing_units (listing_id, name, detail, price, units, available)
      values (v_id, v_row.unit_name, '2 voyageurs', v_row.price, v_row.units, true);
    end if;

    if v_row.kind = 'restaurant' then
      insert into public.restaurant_details (listing_id, cuisine, price_band)
      values (v_id, v_row.cuisine, v_row.band::public.price_band);
      insert into public.restaurant_settings (listing_id)
      values (v_id) on conflict (listing_id) do nothing;
    end if;
  end loop;
end
$do$;;
