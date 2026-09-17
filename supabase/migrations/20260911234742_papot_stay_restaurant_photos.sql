-- Unsplash stock imagery, each picked after viewing the actual photo.
-- These are illustrative for the demo listings, not photographs of real venues.
update public.listings set img = case name
  -- garden entrance to a guesthouse, matching "jardin en terrasses"
  when 'Villa Kajou'           then 'https://images.unsplash.com/photo-1783835541391-f632e3393397?w=600&h=400&fit=crop&auto=format'
  -- apartment blocks around a pool, tropical
  when 'Résidence Belvédère'   then 'https://images.unsplash.com/photo-1551286923-c82d6a8ae079?w=600&h=400&fit=crop&auto=format'
  -- classic inn bedroom
  when 'Auberge Soleil Levant' then 'https://images.unsplash.com/photo-1578898886225-c7c894047899?w=600&h=400&fit=crop&auto=format'
  -- contemporary dining room
  when 'Chez Manman Lila'      then 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop&auto=format'
  -- creole shrimp with rice, for the seafood house
  when 'Lakay Bòdmè'           then 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=400&fit=crop&auto=format'
  -- grilled ribs on a board
  when 'Tonnèl Griyad'         then 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=400&fit=crop&auto=format'
  -- airy daylit bistro
  when 'Kafe Kenscoff'         then 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=400&fit=crop&auto=format'
  else img
end
where kind in ('stay', 'restaurant');

select name, kind::text, left(img, 52) as img from public.listings
where kind in ('stay','restaurant') order by kind, position;;
