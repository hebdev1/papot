-- services derive from the canvas slot labels: "Ce soir" -> Dîner,
-- "Demain midi" -> Déjeuner. capacity is only known for Manman Lila
-- ("Lieu entier · 130 couverts"); the others stay null rather than invented.
insert into public.restaurant_details
  (listing_id, cuisine, price_band, neighborhood, zones, services, features,
   capacity, instant_confirmation, accepts_groups)
select l.id, r.cuisine, r.band, r.hood, r.zones, r.services, r.features,
       r.cap, r.instant, r.groups
from public.listings l
join (values
  ('Chez Manman Lila', 'Créole',        '$$$', 'Pétion-Ville',
     array['Terrasse','Salle principale','Jardin'], array['Dîner'],
     array['Terrasse','Privatisable'],              130,  true,  true),
  ('Lakay Bòdmè',      'Fruits de mer', '$$',  'Jacmel',
     array['Terrasse','Salle principale'],          array['Déjeuner','Dîner'],
     array['Vue mer','Parking'],                    null, true,  false),
  ('Tonnèl Griyad',    'Grillades',     '$$',  'Cap-Haïtien',
     array['Jardin','Salle principale'],            array['Dîner'],
     array['Jardin','Groupes'],                     null, true,  true),
  ('Kafe Kenscoff',    'Bistrot',       '$$',  'Kenscoff',
     array['Terrasse'],                             array['Déjeuner','Brunch'],
     array['Brunch','Végétarien'],                  null, true,  false)
) as r(nm, cuisine, band, hood, zones, services, features, cap, instant, groups)
  on r.nm = l.name
where l.kind = 'restaurant';;
