insert into public.destinations (city, country, hotels, img, position) values
  ('Paris',     'France',          4820, 'https://images.unsplash.com/photo-1764564133113-b9f40c9d1a1a?w=400&h=300&fit=crop&auto=format', 1),
  ('Bali',      'Indonésie',       2340, 'https://images.unsplash.com/photo-1645990097585-947bbb879c12?w=400&h=300&fit=crop&auto=format', 2),
  ('Barcelone', 'Espagne',         3100, 'https://images.unsplash.com/photo-1632776265574-9a02142ed6cb?w=400&h=300&fit=crop&auto=format', 3),
  ('Dubaï',     'Émirats arabes',  1890, 'https://images.unsplash.com/photo-1594433575301-cf59b8ada6b1?w=400&h=300&fit=crop&auto=format', 4),
  ('Maldives',  'Maldives',         650, 'https://images.unsplash.com/photo-1658591049748-4937f0a9051a?w=400&h=300&fit=crop&auto=format', 5),
  ('New York',  'États-Unis',      6500, 'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=400&h=300&fit=crop&auto=format', 6);

insert into public.listings
  (name, location, city, country, type, stars, rating, reviews, badge, price, original_price, img, amenities, free_cancellation, breakfast, position) values
  ('Le Grand Méridien',   'Paris 8e, France',    'Paris',     'France',         'Hôtel de luxe',  5, 9.2, 1847, 'Coup de cœur',              289,  380,
   'https://images.unsplash.com/photo-1578898886225-c7c894047899?w=600&h=400&fit=crop&auto=format', array['wifi','pool','breakfast'], true,  false, 1),
  ('Sunset Beach Resort', 'Seminyak, Bali',      'Bali',      'Indonésie',      'Resort',         5, 9.5, 2204, 'Meilleur rapport qualité',  196, null,
   'https://images.unsplash.com/photo-1551286923-c82d6a8ae079?w=600&h=400&fit=crop&auto=format', array['wifi','pool','breakfast'], true,  true,  2),
  ('Casa del Mar',        'Barcelone, Espagne',  'Barcelone', 'Espagne',        'Boutique hôtel', 4, 8.8,  963, null,                        142,  175,
   'https://images.unsplash.com/photo-1731336478850-6bce7235e320?w=600&h=400&fit=crop&auto=format', array['wifi','breakfast'], false, true,  3),
  ('The Palm Oasis',      'Dubaï Marina, EAU',   'Dubaï',     'Émirats arabes', 'Hôtel de luxe',  5, 9.0, 1530, 'Très demandé',              445,  520,
   'https://images.unsplash.com/photo-1629140727571-9b5c6f6267b4?w=600&h=400&fit=crop&auto=format', array['wifi','pool'], true,  false, 4);;
