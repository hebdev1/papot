-- The new onboarding wizard adds a fourth type alongside guesthouse/restaurant/car.
alter type public.partner_type add value if not exists 'hotel';;
