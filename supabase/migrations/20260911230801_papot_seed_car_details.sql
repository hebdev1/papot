insert into public.car_details
  (listing_id, make, model, year, body, gearbox, fuel, drivetrain, seats, doors, luggage,
   with_driver, air_conditioning, unlimited_km, airport_delivery, min_days)
select l.id, c.make, c.model, c.year, c.body, c.gearbox, c.fuel, c.drivetrain,
       c.seats, c.doors, c.luggage, c.driver, c.ac, c.km, c.airport, c.mind
from public.listings l
join (values
  -- Canvas 1d spells the RAV4 out: Automatique · 5 places · Essence · 4×4.
  ('Toyota RAV4 2022',    'Toyota',  'RAV4',     2022, 'SUV',     'Automatique', 'Essence', '4×4',              5, 5, 3, false, true,  false, true,  1),
  ('Hyundai Tucson 2021', 'Hyundai', 'Tucson',   2021, 'SUV',     'Automatique', 'Diesel',  '2 roues motrices', 5, 5, 3, true,  true,  false, false, 2),
  ('Honda Accord 2020',   'Honda',   'Accord',   2020, 'Berline', 'Automatique', 'Essence', '2 roues motrices', 5, 4, 2, false, true,  true,  false, 1),
  ('Nissan Frontier 2020','Nissan',  'Frontier', 2020, 'Pick-up', 'Manuelle',    'Essence', '4×4',              4, 4, 2, false, false, false, false, 2)
) as c(nm, make, model, year, body, gearbox, fuel, drivetrain, seats, doors, luggage, driver, ac, km, airport, mind)
  on c.nm = l.name
where l.kind = 'car';;
