-- Every image below was viewed before being assigned, not picked by id.
-- Illustrative stock, not photographs of these actual businesses or places.
update public.listings set img = case name
  -- an actual silver RAV4
  when 'Toyota RAV4 2022'     then 'https://images.unsplash.com/photo-1617469767053-d3b523a0b982?w=600&h=400&fit=crop&auto=format'
  -- white SUV in open landscape
  when 'Hyundai Tucson 2021'  then 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=600&h=400&fit=crop&auto=format'
  -- dark sedan, three-quarter view
  when 'Honda Accord 2020'    then 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&h=400&fit=crop&auto=format'
  -- rugged 4x4 on an unpaved track, matching "Routes difficiles"
  when 'Nissan Frontier 2020' then 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&h=400&fit=crop&auto=format'
  else img
end
where kind = 'car';

-- Tier 1-2 render as cards; tier 3 renders as a text chip and needs no image.
-- All five card destinations are coastal, so coastal imagery is apt.
update public.destinations set img = case city
  when 'Jacmel'            then 'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?w=800&h=600&fit=crop&auto=format'
  when 'Cap-Haïtien'       then 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=600&h=600&fit=crop&auto=format'
  when 'Île-à-Vache'       then 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=600&h=600&fit=crop&auto=format'
  when 'Côte des Arcadins' then 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=600&h=600&fit=crop&auto=format'
  when 'Port-Salut'        then 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=600&fit=crop&auto=format'
  else img
end
where tier <= 2;

select
  (select count(*) from listings     where kind = 'car'   and img <> '')   as cars_with_photo,
  (select count(*) from listings     where img = '')                      as listings_without,
  (select count(*) from destinations where tier <= 2 and img is not null)  as card_dests_with_photo,
  (select count(*) from destinations where tier  = 3 and img is null)      as chip_dests_no_photo;;
