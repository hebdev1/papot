-- Structured, filterable attributes for kind = 'car'.
-- Kept in its own table so the shared listings row stays vertical-agnostic.
create table public.car_details (
  listing_id       uuid primary key references public.listings(id) on delete cascade,
  make             text not null,
  model            text not null,
  year             smallint not null check (year between 1990 and 2100),
  body             text not null,          -- SUV · Berline · Pick-up · Minibus
  gearbox          text not null,          -- Automatique · Manuelle
  fuel             text not null,          -- Essence · Diesel · Hybride
  drivetrain       text not null,          -- 4×4 · 2 roues motrices
  seats            smallint not null check (seats between 1 and 30),
  doors            smallint check (doors between 1 and 8),
  luggage          smallint,
  with_driver      boolean not null default false,
  air_conditioning boolean not null default false,
  unlimited_km     boolean not null default false,
  airport_delivery boolean not null default false,
  min_days         smallint not null default 1
);

create index car_details_filter_idx on public.car_details (body, gearbox, fuel, seats);

alter table public.car_details enable row level security;

create policy car_details_public_read on public.car_details
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.car_details from anon, authenticated;;
