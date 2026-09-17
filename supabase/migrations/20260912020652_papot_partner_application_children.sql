-- Catalog: amenities must exist here, and must apply to the chosen vertical.
create table public.partner_amenities (
  code       text primary key,
  label_fr   text not null,
  applies_to public.partner_type[] not null check (cardinality(applies_to) > 0),
  position   smallint not null default 0
);

insert into public.partner_amenities (code, label_fr, applies_to, position) values
  ('wifi',        'Wi-Fi',                array['hotel','guesthouse','restaurant']::public.partner_type[], 1),
  ('parking',     'Parking',              array['hotel','guesthouse','restaurant']::public.partner_type[], 2),
  ('pool',        'Piscine',              array['hotel','guesthouse']::public.partner_type[],              3),
  ('ac',          'Climatisation',        array['hotel','guesthouse','restaurant','car']::public.partner_type[], 4),
  ('generator',   'Générateur',           array['hotel','guesthouse','restaurant']::public.partner_type[], 5),
  ('inverter',    'Onduleur',             array['hotel','guesthouse']::public.partner_type[],              6),
  ('water_tank',  'Réserve d''eau',       array['hotel','guesthouse']::public.partner_type[],              7),
  ('security',    'Gardiennage',          array['hotel','guesthouse','restaurant']::public.partner_type[], 8),
  ('breakfast',   'Petit-déjeuner',       array['hotel','guesthouse']::public.partner_type[],              9),
  ('terrace',     'Terrasse',             array['hotel','guesthouse','restaurant']::public.partner_type[], 10),
  ('garden',      'Jardin',               array['hotel','guesthouse','restaurant']::public.partner_type[], 11),
  ('kitchen',     'Cuisine',              array['guesthouse']::public.partner_type[],                      12),
  ('sea_view',    'Vue mer',              array['hotel','guesthouse','restaurant']::public.partner_type[], 13),
  ('private_hire','Privatisable',         array['restaurant']::public.partner_type[],                      14),
  ('vegetarian',  'Options végétariennes',array['restaurant']::public.partner_type[],                      15),
  ('with_driver', 'Avec chauffeur',       array['car']::public.partner_type[],                             16),
  ('delivery',    'Livraison du véhicule',array['car']::public.partner_type[],                             17),
  ('unlimited_km','Kilométrage illimité', array['car']::public.partner_type[],                             18);

create table public.partner_application_amenities (
  application_id uuid not null references public.partner_applications(id) on delete cascade,
  amenity_code   text not null references public.partner_amenities(code) on delete restrict,
  primary key (application_id, amenity_code)
);

create table public.partner_application_rooms (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.partner_applications(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 80),
  room_type      text,
  capacity       smallint not null check (capacity between 1 and 50),
  beds           text,
  price          numeric(10,2) not null check (price > 0),
  units          smallint not null default 1 check (units between 1 and 500),
  position       smallint not null default 0,
  unique (application_id, name)
);

create table public.partner_application_vehicles (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.partner_applications(id) on delete cascade,
  make           text not null check (length(trim(make))  between 1 and 40),
  model          text not null check (length(trim(model)) between 1 and 40),
  year           smallint not null check (year between 1980 and extract(year from now())::int + 1),
  body_type      text,
  seats          smallint not null check (seats between 1 and 60),
  transmission   text not null check (transmission in ('Automatique', 'Manuelle')),
  position       smallint not null default 0,
  unique (application_id, make, model, year)
);

create table public.partner_application_hours (
  application_id uuid not null references public.partner_applications(id) on delete cascade,
  weekday        smallint not null check (weekday between 0 and 6),  -- 0 = Monday
  is_open        boolean not null default false,
  opens_at       time,
  closes_at      time,
  primary key (application_id, weekday),
  -- An open day must carry a valid, ordered range; a closed day carries none.
  constraint hours_consistent check (
    (is_open and opens_at is not null and closes_at is not null and closes_at > opens_at)
    or (not is_open and opens_at is null and closes_at is null))
);

-- Rooms belong to lodging, vehicles to car rental: enforced, not assumed.
create or replace function public.assert_application_type()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type public.partner_type;
begin
  select type into v_type from public.partner_applications where id = new.application_id;
  if tg_table_name = 'partner_application_rooms' and v_type not in ('hotel','guesthouse') then
    raise exception 'Les chambres ne s''appliquent qu''aux hôtels et maisons d''hôtes (type: %).', v_type;
  end if;
  if tg_table_name = 'partner_application_vehicles' and v_type <> 'car' then
    raise exception 'Les véhicules ne s''appliquent qu''à la location de voiture (type: %).', v_type;
  end if;
  if tg_table_name = 'partner_application_amenities'
     and not exists (select 1 from public.partner_amenities a
                      where a.code = new.amenity_code and v_type = any(a.applies_to)) then
    raise exception 'Équipement "%" invalide pour le type %.', new.amenity_code, v_type;
  end if;
  return new;
end;
$$;

create trigger rooms_type_guard     before insert or update on public.partner_application_rooms
  for each row execute function public.assert_application_type();
create trigger vehicles_type_guard  before insert or update on public.partner_application_vehicles
  for each row execute function public.assert_application_type();
create trigger amenities_type_guard before insert or update on public.partner_application_amenities
  for each row execute function public.assert_application_type();

alter table public.partner_amenities             enable row level security;
alter table public.partner_application_amenities enable row level security;
alter table public.partner_application_rooms     enable row level security;
alter table public.partner_application_vehicles  enable row level security;
alter table public.partner_application_hours     enable row level security;

create policy partner_amenities_public_read on public.partner_amenities
  for select to anon, authenticated using (true);

revoke all on public.partner_application_amenities from anon, authenticated;
revoke all on public.partner_application_rooms     from anon, authenticated;
revoke all on public.partner_application_vehicles  from anon, authenticated;
revoke all on public.partner_application_hours     from anon, authenticated;
revoke insert, update, delete on public.partner_amenities from anon, authenticated;;
