-- Replaces the European placeholder seed with the canvas's Haitian content.
delete from public.listings;
delete from public.destinations;

insert into public.destinations (city, country, region, tagline, blurb, hotels, restaurants, from_usd, tier, position) values
 ('Jacmel',            'Haïti', 'Sud-Est', 'Carnaval en février',
  'Maisons à colonnades, artisanat papier mâché, Bassin-Bleu à une heure de route.', 34, 12, 55.00, 1, 1),
 ('Cap-Haïtien',       'Haïti', 'Nord',  null, 'Citadelle Laferrière',                    41, 0, 48.00, 2, 2),
 ('Île-à-Vache',       'Haïti', 'Sud',   null, 'Île sans voitures',                        9, 0, 85.00, 2, 3),
 ('Côte des Arcadins', 'Haïti', 'Ouest', null, 'Plages, une heure de la capitale',        27, 0, 70.00, 2, 4),
 ('Port-Salut',        'Haïti', 'Sud',   null, 'Sable blanc, Pointe-Sable',               18, 0, 52.00, 2, 5),
 ('Pétion-Ville',      'Haïti', 'Ouest', null, null, 62, 0, null, 3, 6),
 ('Kenscoff',          'Haïti', 'Ouest', null, null, 14, 0, null, 3, 7),
 ('Labadie',           'Haïti', 'Nord',  null, null,  7, 0, null, 3, 8),
 ('Les Cayes',         'Haïti', 'Sud',   null, null, 23, 0, null, 3, 9);

-- Restaurants (3a). Ratings are /5 as drawn.
insert into public.listings
 (kind, name, location, city, country, type, stars, rating, rating_scale, reviews, badge,
  price, img, amenities, free_cancellation, breakfast, position, attrs) values
 ('restaurant', 'Chez Manman Lila', 'Créole contemporain · Pétion-Ville', 'Pétion-Ville', 'Haïti',
  'Créole contemporain', null, 4.8, 5, 312, null, 0, '', array['Terrasse','Privatisable'], true, false, 1,
  '{"price_band":"$$$","cuisine":"Créole","slot_label":"Ce soir","slots":["19:00","20:30","21:00"]}'::jsonb),
 ('restaurant', 'Lakay Bòdmè', 'Fruits de mer · Jacmel', 'Jacmel', 'Haïti',
  'Fruits de mer', null, 4.6, 5, 148, null, 0, '', array['Vue mer','Parking'], true, false, 2,
  '{"price_band":"$$","cuisine":"Fruits de mer","slot_label":"Ce soir","slots":["18:30","19:30"],"full":true}'::jsonb),
 ('restaurant', 'Tonnèl Griyad', 'Grillades · Cap-Haïtien', 'Cap-Haïtien', 'Haïti',
  'Grillades', null, 4.9, 5, 64, 'Nouveau', 0, '', array['Jardin','Groupes'], true, false, 3,
  '{"price_band":"$$","cuisine":"Grillades","slot_label":"Ce soir","slots":["19:00","20:00","21:30"]}'::jsonb),
 ('restaurant', 'Kafe Kenscoff', 'Bistrot · Kenscoff', 'Kenscoff', 'Haïti',
  'Bistrot', null, 4.7, 5, 93, null, 0, '', array['Brunch','Végétarien'], true, false, 4,
  '{"price_band":"$$","cuisine":"Bistrot","slot_label":"Demain midi","slots":["12:00","13:00","14:00"]}'::jsonb);

-- Cars (3b). price is per day, USD.
insert into public.listings
 (kind, name, location, city, country, type, stars, rating, rating_scale, reviews, badge,
  price, img, amenities, vendor, free_cancellation, breakfast, position, attrs) values
 ('car', 'Toyota RAV4 2022', 'Pétion-Ville', 'Pétion-Ville', 'Haïti', 'SUV', null, 4.9, 5, 128, '4×4',
  65.00, '', array['Automatique','5 places','Clim'], 'Kajou Rentals', true, false, 1,
  '{"body":"SUV","perk":"Livraison aéroport gratuite"}'::jsonb),
 ('car', 'Hyundai Tucson 2021', 'Pétion-Ville', 'Pétion-Ville', 'Haïti', 'SUV', null, 4.7, 5, 64, null,
  92.00, '', array['Diesel','5 places','Clim'], 'Soleil Auto', true, false, 2,
  '{"body":"SUV","perk":"Avec chauffeur disponible","with_driver":true}'::jsonb),
 ('car', 'Honda Accord 2020', 'Pétion-Ville', 'Pétion-Ville', 'Haïti', 'Berline', null, 4.5, 5, 37, null,
  48.00, '', array['Automatique','5 places','Clim'], 'Soleil Auto', true, false, 3,
  '{"body":"Berline","perk":"Kilométrage illimité"}'::jsonb),
 ('car', 'Nissan Frontier 2020', 'Pétion-Ville', 'Pétion-Ville', 'Haïti', 'Pick-up', null, 4.8, 5, 31, '4×4',
  58.00, '', array['Manuelle','4 places','Routes difficiles'], 'Particulier', true, false, 4,
  '{"body":"Pick-up","perk":"Retrait à Pétion-Ville"}'::jsonb);;
