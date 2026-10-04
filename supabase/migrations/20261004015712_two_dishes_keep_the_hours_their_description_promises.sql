-- Deux plats annoncent une règle en toutes lettres et ne la portent pas.
--
-- « Soup joumou — Le dimanche uniquement » chez Chez Manman Lila, et
-- « Spaghetti Kenscoff — servi le matin » chez Kafe Kenscoff. Les colonnes
-- existent pour ça depuis le début : `available_weekdays` et
-- `available_from`/`available_until`. Elles étaient vides, donc on pouvait
-- commander une soupe du dimanche un mardi soir et la cuisine découvrait le
-- malentendu à la réception.
--
-- Les jours se comptent comme `place_food_order` les compte --
-- `extract(isodow) - 1`, donc lundi = 0 et dimanche = 6.
--
-- Rien n'est inventé ici : la règle était déjà écrite, en français, dans la
-- description que le client lit. On la met là où la machine la voit aussi.

update public.menu_items mi
   set available_weekdays = array[6]::smallint[]
  from public.listings l
 where l.id = mi.listing_id
   and l.name = 'Chez Manman Lila'
   and mi.name = 'Soup joumou'
   and coalesce(array_length(mi.available_weekdays, 1), 0) = 0;

update public.menu_items mi
   set available_from  = time '06:00',
       available_until = time '11:00'
  from public.listings l
 where l.id = mi.listing_id
   and l.name = 'Kafe Kenscoff'
   and mi.name = 'Spaghetti Kenscoff'
   and mi.available_from is null;
;
