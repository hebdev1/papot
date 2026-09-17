-- Canvas rates every vertical /5, so /10 is no longer the default.
alter table public.listings alter column rating_scale set default 5;
update public.listings set rating_scale = 5 where rating_scale <> 5;

-- price is per night, USD. The canvas shows 4-night totals; those are derived.
insert into public.listings
 (kind, name, location, city, country, type, stars, rating, rating_scale, reviews, badge,
  price, img, amenities, free_cancellation, breakfast, position, attrs) values
 ('stay', 'Villa Kajou', 'Kenscoff, Ouest · 12 km du centre', 'Kenscoff', 'Haïti',
  'Maison d''hôtes', null, 4.9, 5, 87, null, 135.75, '',
  array['Générateur','Réserve d''eau','Wi-Fi','Parking'], true, true, 1,
  '{"blurb":"Trois chambres sur les hauteurs, petit-déjeuner créole inclus, générateur et Starlink.","cancellation":"Annulation gratuite jusqu''à 24 h avant l''arrivée","cancellation_kind":"flexible"}'::jsonb),
 ('stay', 'Résidence Belvédère', 'Pétion-Ville, Ouest', 'Pétion-Ville', 'Haïti',
  'Appartement', null, 4.6, 5, 42, '2 dernières unités', 97.00, '',
  array['Inverter','Gardiennage','Climatisation'], false, false, 2,
  '{"blurb":"Deux chambres, cuisine équipée, gardiennage 24 h. Séjour minimum de trois nuits.","cancellation":"Annulation modérée — remboursement intégral jusqu''à 5 jours avant","cancellation_kind":"moderate","min_nights":3}'::jsonb),
 ('stay', 'Auberge Soleil Levant', 'Jacmel, Sud-Est', 'Jacmel', 'Haïti',
  'Auberge', null, 4.7, 5, 61, null, 65.00, '',
  array['Wi-Fi','Parking'], true, false, 3,
  '{"blurb":"Complet du 12 au 16 · libre à partir du 19 octobre","sold_out":true,"next_available":"2026-10-19"}'::jsonb);;
