-- 1b — Villa Kajou
update public.listings set attrs = attrs || jsonb_build_object(
  'breadcrumb',  'Hébergements · Ouest · Kenscoff',
  'subtitle',    'Kenscoff, département de l''Ouest · 6 voyageurs · 3 chambres · 2 salles de bain',
  'verified',    true,
  'host_since',  '2023',
  'description', 'Une maison familiale sur les hauteurs de Kenscoff, à quarante minutes de Pétion-Ville. Trois chambres, un jardin en terrasses, et le petit-déjeuner créole préparé chaque matin. Générateur et inverter assurent la continuité électrique, Starlink la connexion.',
  'facilities',  jsonb_build_array('Wi-Fi Starlink','Climatisation','Parking privé','Petit-déjeuner inclus','Eau chaude','Piscine'),
  'continuity',  jsonb_build_array('Générateur 20 kVA','Inverter avec batteries','Réserve d''eau 3 000 L','Gardiennage de nuit'),
  'rules',       jsonb_build_array('Arrivée dès 15 h','Départ avant 11 h','Enfants bienvenus','Animaux non admis','Non-fumeur','Fêtes interdites'),
  'policy_name', 'Politique flexible',
  'policy_text', 'Remboursement intégral jusqu''à 24 h avant l''arrivée. Passé ce délai, la première nuit est retenue.',
  'cleaning_fee', 35,
  'service_fee',  28,
  'photos_more',  8
) where name = 'Villa Kajou';

insert into public.listing_units (listing_id, name, detail, price, available, position)
select id, u.name, u.detail, u.price, u.available, u.pos
from public.listings, (values
  ('Suite jardin',      '2 voyageurs · 1 lit double · SDB privée',   120.00, true,  1),
  ('Chambre vue',       '2 voyageurs · 2 lits simples · SDB privée',  95.00, true,  2),
  ('Chambre familiale', '4 voyageurs · SDB partagée',                  null, false, 3)
) as u(name, detail, price, available, pos)
where public.listings.name = 'Villa Kajou';

-- 1c — Chez Manman Lila
update public.listings set attrs = attrs || jsonb_build_object(
  'breadcrumb',     'Restaurants · Pétion-Ville',
  'subtitle',       'Créole contemporain · Pétion-Ville, Ouest',
  'hours',          'Ouvert jusqu''à 23 h',
  'service_label',  'Créneaux — service du soir, 90 min',
  'all_slots',      jsonb_build_array('18:00','18:30','19:00','19:30','20:00','20:30','21:00'),
  'zones',          jsonb_build_array('Terrasse','Salle principale','Jardin'),
  'booking_note',   'Réservation possible jusqu''à 2 h avant, et 60 jours à l''avance. Table gardée 15 minutes.',
  'private_note',   'La demande part directement au restaurant, qui répond sous 24 heures avec un devis. Aucun paiement à cette étape.',
  'deposit_pp',     15,
  'cancel_window',  'Jusqu''à 4 h avant'
) where name = 'Chez Manman Lila';

insert into public.menu_items (listing_id, category, name, detail, tag, price, position)
select id, m.cat, m.nm, m.det, m.tag, m.price, m.pos
from public.listings, (values
  ('Entrées', 'Akra de malanga', 'Beignets de taro, sauce ti-malice', 'Végétarien',  8.00, 1),
  ('Plats',   'Lambi en sauce',  'Servi avec riz djon-djon',           null,        14.00, 2),
  ('Plats',   'Soup joumou',     'Le dimanche uniquement',             null,        10.00, 3)
) as m(cat, nm, det, tag, price, pos)
where public.listings.name = 'Chez Manman Lila';

insert into public.private_options (listing_id, name, capacity, from_price, position)
select id, p.nm, p.cap, p.fp, p.pos
from public.listings, (values
  ('Terrasse',        'Jusqu''à 40 couverts',      'Dès 850 $',   1),
  ('Salle principale','Jusqu''à 90 couverts',      'Dès 1 900 $', 2),
  ('Lieu entier',     '130 couverts, exclusivité', 'Sur devis',   3)
) as p(nm, cap, fp, pos)
where public.listings.name = 'Chez Manman Lila';

-- 1d — Toyota RAV4 2022
update public.listings set
  location = 'Port-au-Prince',
  vendor   = 'Kajou Rentals',
  attrs = attrs || jsonb_build_object(
  'breadcrumb',   'Voitures · Port-au-Prince',
  'subtitle',     'Kajou Rentals · 4,9 (128 avis) · agence de Delmas 75',
  'insurance_badge', 'Assurance incluse',
  'specs',        jsonb_build_array(
                    jsonb_build_object('k','Boîte','v','Automatique'),
                    jsonb_build_object('k','Places','v','5'),
                    jsonb_build_object('k','Carburant','v','Essence'),
                    jsonb_build_object('k','Transmission','v','4×4')),
  'terms',        jsonb_build_array(
                    jsonb_build_object('k','Âge minimum','v','23 ans · permis depuis 2 ans'),
                    jsonb_build_object('k','Permis acceptés','v','Haïtien, international, étranger'),
                    jsonb_build_object('k','Caution','v','500 $ — empreinte de carte'),
                    jsonb_build_object('k','Carburant','v','Plein à plein'),
                    jsonb_build_object('k','Kilométrage','v','200 km / jour, puis 0,45 $ / km'),
                    jsonb_build_object('k','Assurance','v','Incluse · franchise 300 $')),
  'pickups',      jsonb_build_array(
                    jsonb_build_object('name','Aéroport Toussaint Louverture','detail','6 h – 22 h · livraison gratuite','fee',0),
                    jsonb_build_object('name','Agence Delmas 75','detail','8 h – 18 h · lun au sam','fee',0),
                    jsonb_build_object('name','Autre adresse','detail','Livraison','fee',25)),
  'driver_per_day', 45,
  'deposit',        500
) where name = 'Toyota RAV4 2022';;
