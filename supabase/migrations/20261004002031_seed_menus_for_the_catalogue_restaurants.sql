-- Huit restaurants du catalogue n'avaient aucun plat.
--
-- Le seed par destination crée `restaurant_details` et `restaurant_settings`,
-- jamais de carte : la section « Carte » de leur fiche se rendait donc en
-- boîte vide, un titre et rien dessous. Maintenant que la commande est
-- ouverte, une carte vide est une promesse qui ne tient pas.
--
-- Attention au schéma : l'ancien seed écrivait dans une colonne texte
-- `menu_items.category` qui n'existe plus. Aujourd'hui `category_id` est
-- `not null` sans défaut, donc les catégories se créent d'abord et les plats
-- se raccrochent dessus par leur nom.
--
-- Les valeurs par défaut suffisent à rendre un plat commandable :
-- `available` vrai, `sold_out` faux, et `available_weekdays` vide -- le
-- garde-fou de `place_food_order` est
-- `coalesce(array_length(available_weekdays,1),0) > 0 and not (...)`, donc un
-- tableau vide veut bien dire « tous les jours », pas « aucun jour ».
--
-- Chaque carte suit la cuisine et la fourchette de prix déjà déclarées dans
-- `restaurant_details` : des plats haïtiens réels, des prix en dollars
-- cohérents avec la fourchette, et aucune mention diététique au-delà de
-- l'évidence (un akra de malanga est végétarien ; un lambi ne l'est pas).
--
-- Boukanye est volontairement exclu : son plat unique, sa catégorie, sa
-- formule et sa ligne de stock du jour sont du travail fait à la main dans la
-- console partenaire, pas du seed. On ne réécrit pas par-dessus.
--
-- Le `not exists` sur `menu_items` rend le seed rejouable sans empiler.

with r as (
  select l.id, l.name
    from public.listings l
   where l.kind = 'restaurant'
     and l.published
     and l.name in ('Bèl Plaj', 'Chez Ti Jan', 'Gwo Digo', 'Kafe Kenscoff',
                    'Kokoye', 'Lakay Bòdmè', 'Manje Lanmè', 'Tonnèl Griyad')
     and not exists (select 1 from public.menu_items mi where mi.listing_id = l.id)
),
cat (resto, nm, pos) as (values
  ('Bèl Plaj',      'Entrées',                  1::smallint),
  ('Bèl Plaj',      'Poissons & fruits de mer', 2),
  ('Bèl Plaj',      'Accompagnements',          3),

  ('Chez Ti Jan',   'Entrées',                  1),
  ('Chez Ti Jan',   'Poissons & fruits de mer', 2),
  ('Chez Ti Jan',   'Accompagnements',          3),

  ('Gwo Digo',      'Soupes',                   1),
  ('Gwo Digo',      'Plats du jour',            2),
  ('Gwo Digo',      'Accompagnements',          3),

  ('Kafe Kenscoff', 'Petit-déjeuner & brunch',  1),
  ('Kafe Kenscoff', 'Déjeuner',                 2),
  ('Kafe Kenscoff', 'Boissons',                 3),

  ('Kokoye',        'Entrées',                  1),
  ('Kokoye',        'Poissons & fruits de mer', 2),
  ('Kokoye',        'Accompagnements',          3),

  ('Lakay Bòdmè',   'Entrées',                  1),
  ('Lakay Bòdmè',   'Poissons & fruits de mer', 2),
  ('Lakay Bòdmè',   'Accompagnements',          3),

  ('Manje Lanmè',   'Entrées',                  1),
  ('Manje Lanmè',   'Plats du jour',            2),
  ('Manje Lanmè',   'Desserts',                 3),

  ('Tonnèl Griyad', 'Grillades',                1),
  ('Tonnèl Griyad', 'Accompagnements',          2),
  ('Tonnèl Griyad', 'Boissons',                 3)
),
new_cat as (
  insert into public.menu_categories (listing_id, name, position)
  select r.id, cat.nm, cat.pos
    from r join cat on cat.resto = r.name
  returning id, listing_id, name
),
dish (resto, cat, nm, det, price, pos, diet) as (values
  -- Bèl Plaj — Labadie, fruits de mer, $$
  ('Bèl Plaj', 'Entrées', 'Akra de malanga', 'Beignets de taro râpé, sauce ti-malice', 6.00::numeric, 1, array['Végétarien']),
  ('Bèl Plaj', 'Entrées', 'Chiktay aransò', 'Hareng saur effiloché, échalotes et citron', 7.00, 2, '{}'::text[]),
  ('Bèl Plaj', 'Poissons & fruits de mer', 'Lambi boukannen', 'Grillé au feu de bois, sauce créole', 18.00, 3, '{}'),
  ('Bèl Plaj', 'Poissons & fruits de mer', 'Poisson gros sel', 'Pêche du jour, court-bouillon au citron vert', 16.00, 4, '{}'),
  ('Bèl Plaj', 'Poissons & fruits de mer', 'Crevettes à l''ail', 'Sautées au thym et au piment doux', 17.00, 5, '{}'),
  ('Bèl Plaj', 'Accompagnements', 'Riz djon-djon', 'Riz noir aux champignons séchés', 6.00, 6, array['Végétarien']),
  ('Bèl Plaj', 'Accompagnements', 'Bananes pesées', 'Plantain écrasé et frit, pikliz à part', 4.00, 7, array['Végétarien', 'Végétalien']),

  -- Chez Ti Jan — Côte des Arcadins, fruits de mer, $$
  ('Chez Ti Jan', 'Entrées', 'Accras de morue', 'Servis brûlants, sauce ti-malice', 6.00, 1, '{}'),
  ('Chez Ti Jan', 'Entrées', 'Salade d''avocat', 'Avocat, oignon rouge, citron vert', 4.00, 2, array['Végétarien', 'Végétalien']),
  ('Chez Ti Jan', 'Poissons & fruits de mer', 'Poisson en sauce', 'Vivaneau mijoté, tomate et poivrons', 17.00, 3, '{}'),
  ('Chez Ti Jan', 'Poissons & fruits de mer', 'Lambi en sauce', 'Mijoté lentement, servi avec riz blanc', 18.00, 4, '{}'),
  ('Chez Ti Jan', 'Poissons & fruits de mer', 'Crevettes créoles', 'Sauce tomate relevée, riz blanc', 16.00, 5, '{}'),
  ('Chez Ti Jan', 'Accompagnements', 'Diri kole ak pwa', 'Riz aux haricots rouges', 5.00, 6, array['Végétarien']),
  ('Chez Ti Jan', 'Accompagnements', 'Pikliz', 'Chou et carotte au vinaigre, piment', 2.00, 7, array['Végétarien', 'Végétalien']),

  -- Gwo Digo — Les Cayes, créole, $
  ('Gwo Digo', 'Soupes', 'Soup joumou', 'Giraumon, bœuf et légumes', 6.00, 1, '{}'),
  ('Gwo Digo', 'Soupes', 'Bouyon', 'Bouillon de légumes et tubercules', 5.00, 2, '{}'),
  ('Gwo Digo', 'Plats du jour', 'Griyo ak bannann', 'Porc mariné puis frit, bananes pesées', 9.00, 3, '{}'),
  ('Gwo Digo', 'Plats du jour', 'Poul nan sòs', 'Poulet mijoté sauce créole, riz blanc', 8.00, 4, '{}'),
  ('Gwo Digo', 'Plats du jour', 'Tassot kabrit', 'Chèvre séchée et frite, pikliz', 10.00, 5, '{}'),
  ('Gwo Digo', 'Plats du jour', 'Legim', 'Ragoût de légumes au bœuf', 8.00, 6, '{}'),
  ('Gwo Digo', 'Accompagnements', 'Diri ak pwa', 'Riz aux haricots', 3.00, 7, array['Végétarien']),
  ('Gwo Digo', 'Accompagnements', 'Jus de corossol', 'Pressé le matin', 2.50, 8, array['Végétarien']),

  -- Kafe Kenscoff — Kenscoff, bistrot, $$
  ('Kafe Kenscoff', 'Petit-déjeuner & brunch', 'Spaghetti Kenscoff', 'Spaghetti au hareng et œuf, servi le matin', 7.00, 1, '{}'),
  ('Kafe Kenscoff', 'Petit-déjeuner & brunch', 'Œufs brouillés', 'Pain de campagne, beurre fermier', 6.00, 2, array['Végétarien']),
  ('Kafe Kenscoff', 'Petit-déjeuner & brunch', 'Avocat-tartine', 'Avocat de Kenscoff sur pain au levain', 7.00, 3, array['Végétarien', 'Végétalien']),
  ('Kafe Kenscoff', 'Déjeuner', 'Salade de cresson', 'Cresson du morne, vinaigrette au citron', 6.00, 4, array['Végétarien', 'Végétalien']),
  ('Kafe Kenscoff', 'Déjeuner', 'Soupe de légumes du jour', 'Légumes des jardins de Kenscoff', 6.00, 5, array['Végétarien']),
  ('Kafe Kenscoff', 'Déjeuner', 'Croque poulet', 'Poulet effiloché, fromage, pain grillé', 8.00, 6, '{}'),
  ('Kafe Kenscoff', 'Boissons', 'Café Kenscoff', 'Arabica des mornes, filtre', 2.50, 7, array['Végétarien', 'Végétalien']),
  ('Kafe Kenscoff', 'Boissons', 'Chokola peyi', 'Chocolat chaud épicé, cannelle et anis', 3.50, 8, array['Végétarien']),

  -- Kokoye — Port-Salut, fruits de mer, $$
  ('Kokoye', 'Entrées', 'Accras de morue', 'Six pièces, sauce ti-malice', 6.00, 1, '{}'),
  ('Kokoye', 'Entrées', 'Salade de lambi', 'Lambi citronné, oignon, piment doux', 9.00, 2, '{}'),
  ('Kokoye', 'Poissons & fruits de mer', 'Homard grillé', 'Pêche de Port-Salut, beurre à l''ail', 24.00, 3, '{}'),
  ('Kokoye', 'Poissons & fruits de mer', 'Poisson coco', 'Mijoté au lait de coco et épices', 17.00, 4, '{}'),
  ('Kokoye', 'Poissons & fruits de mer', 'Crevettes au curry coco', 'Riz blanc en accompagnement', 16.00, 5, '{}'),
  ('Kokoye', 'Accompagnements', 'Riz blanc, sauce pois', 'Sauce de haricots noirs', 5.00, 6, array['Végétarien']),
  ('Kokoye', 'Accompagnements', 'Eau de coco fraîche', 'Noix ouverte devant vous', 2.00, 7, array['Végétarien', 'Végétalien']),

  -- Lakay Bòdmè — Jacmel, fruits de mer, $$
  ('Lakay Bòdmè', 'Entrées', 'Chiktay lanbi', 'Lambi effiloché, oignons et citron', 8.00, 1, '{}'),
  ('Lakay Bòdmè', 'Entrées', 'Akra de malanga', 'Beignets de taro, sauce ti-malice', 6.00, 2, array['Végétarien']),
  ('Lakay Bòdmè', 'Poissons & fruits de mer', 'Poisson gros sel de Jacmel', 'Court-bouillon, citron vert et thym', 16.00, 3, '{}'),
  ('Lakay Bòdmè', 'Poissons & fruits de mer', 'Lambi gratiné', 'Gratiné au four, sauce crémeuse', 19.00, 4, '{}'),
  ('Lakay Bòdmè', 'Poissons & fruits de mer', 'Crabe en sauce', 'Sauce créole, riz blanc', 15.00, 5, '{}'),
  ('Lakay Bòdmè', 'Accompagnements', 'Bananes pesées', 'Plantain écrasé et frit, pikliz', 4.00, 6, array['Végétarien', 'Végétalien']),
  ('Lakay Bòdmè', 'Accompagnements', 'Mayi moulen ak sòs pwa', 'Polenta de maïs, sauce haricots', 5.00, 7, array['Végétarien']),

  -- Manje Lanmè — Île-à-Vache, créole, $$
  ('Manje Lanmè', 'Entrées', 'Soup joumou', 'Giraumon, bœuf et légumes', 6.00, 1, '{}'),
  ('Manje Lanmè', 'Entrées', 'Accras de morue', 'Servis avec pikliz', 6.00, 2, '{}'),
  ('Manje Lanmè', 'Plats du jour', 'Poisson du jour', 'Court-bouillon, selon la pêche du matin', 16.00, 3, '{}'),
  ('Manje Lanmè', 'Plats du jour', 'Poul peyi nan sòs', 'Poulet élevé sur l''île, sauce créole', 14.00, 4, '{}'),
  ('Manje Lanmè', 'Plats du jour', 'Legim ak lanbi', 'Ragoût de légumes au lambi', 15.00, 5, '{}'),
  ('Manje Lanmè', 'Plats du jour', 'Diri djon-djon', 'Riz noir aux champignons séchés', 6.00, 6, array['Végétarien']),
  ('Manje Lanmè', 'Desserts', 'Pen patat', 'Gâteau de patate douce, lait de coco', 4.00, 7, array['Végétarien']),
  ('Manje Lanmè', 'Desserts', 'Dous makòs', 'Confiserie au lait, trois couches', 3.00, 8, array['Végétarien']),

  -- Tonnèl Griyad — Cap-Haïtien, grillades, $$
  ('Tonnèl Griyad', 'Grillades', 'Griyo', 'Porc mariné à l''orange sure, puis frit', 12.00, 1, '{}'),
  ('Tonnèl Griyad', 'Grillades', 'Tassot bœuf', 'Bœuf séché et frit, pikliz', 13.00, 2, '{}'),
  ('Tonnèl Griyad', 'Grillades', 'Poulet boukannen', 'Demi-poulet grillé au charbon', 11.00, 3, '{}'),
  ('Tonnèl Griyad', 'Grillades', 'Côtes de porc grillées', 'Marinade épicée, cuisson lente', 14.00, 4, '{}'),
  ('Tonnèl Griyad', 'Grillades', 'Brochettes de chèvre', 'Deux brochettes, oignons grillés', 12.00, 5, '{}'),
  ('Tonnèl Griyad', 'Accompagnements', 'Bananes pesées', 'Plantain écrasé et frit', 4.00, 6, array['Végétarien', 'Végétalien']),
  ('Tonnèl Griyad', 'Accompagnements', 'Pikliz', 'Chou piquant au vinaigre', 2.00, 7, array['Végétarien', 'Végétalien']),
  ('Tonnèl Griyad', 'Boissons', 'Jus de grenadia', 'Fruit de la passion, pressé minute', 2.50, 8, array['Végétarien'])
)
insert into public.menu_items (listing_id, category_id, name, detail, price, position, dietary)
select c.listing_id, c.id, d.nm, d.det, d.price, d.pos, d.diet
  from r
  join dish d    on d.resto = r.name
  join new_cat c on c.listing_id = r.id and c.name = d.cat;
;
