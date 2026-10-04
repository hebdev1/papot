-- Neuf restaurants sur dix n'étaient pas commandables, et rien ne le disait.
--
-- `accept_online_orders` est `not null default false` depuis la migration qui
-- a créé la file de cuisine, et les trois chemins qui créent un restaurant --
-- le seed par destination, `admin_create_listing`, `build_partner_listings` --
-- insèrent la ligne de réglages aux valeurs par défaut. Aucune migration ne
-- l'a jamais mise à `true`.
--
-- Or tout le parcours de commande passe derrière ce seul drapeau : le bouton
-- « Ajouter » sur la carte, le configurateur de plat, la section Formules, la
-- barre « Commander », et l'écran /commander/:id lui-même. Les deux extrémités
-- du chemin étant sur le même interrupteur, quand il est éteint il n'existe
-- aucune porte d'entrée -- et la carte se rend en liste de prix inerte, sans
-- un mot d'explication. C'est ce que le catalogue affichait.
--
-- En retrait seulement. `allow_pickup` est déjà vrai partout, ce qui satisfait
-- `orders_need_a_mode`. La livraison n'est pas activée : elle n'a de sens
-- qu'avec des `delivery_zones`, et inventer des zones, des frais et des
-- minimums serait inventer des conditions commerciales. Chaque partenaire
-- l'active depuis /partenaire/parametres quand il a les siennes.
--
-- `order_min_total` reste null : pas de minimum inventé non plus.

update public.restaurant_settings rs
   set accept_online_orders = true
  from public.listings l
 where l.id = rs.listing_id
   and l.kind = 'restaurant'
   and l.published
   and not rs.accept_online_orders;
;
