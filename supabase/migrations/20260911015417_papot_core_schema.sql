-- PAPOT core schema: shapes mirror src/App.tsx constants exactly.

create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  location          text not null,
  city              text not null,
  country           text not null,
  type              text not null,
  stars             smallint not null check (stars between 1 and 5),
  rating            numeric(3,1) not null check (rating >= 0 and rating <= 10),
  reviews           integer not null default 0 check (reviews >= 0),
  badge             text,
  price             integer not null check (price >= 0),
  original_price    integer check (original_price >= 0),
  img               text not null,
  amenities         text[] not null default '{}',
  free_cancellation boolean not null default false,
  breakfast         boolean not null default false,
  published         boolean not null default true,
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  constraint listings_original_price_gt_price
    check (original_price is null or original_price > price)
);

create index listings_published_idx on public.listings (published, position);
create index listings_city_idx on public.listings (lower(city));
create index listings_amenities_idx on public.listings using gin (amenities);

create table public.destinations (
  id         uuid primary key default gen_random_uuid(),
  city       text not null,
  country    text not null,
  hotels     integer not null default 0 check (hotels >= 0),
  img        text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (city, country)
);

create index destinations_position_idx on public.destinations (position);

-- Public read: anon may read published listings and all destinations.
alter table public.listings enable row level security;
alter table public.destinations enable row level security;

create policy listings_public_read on public.listings
  for select to anon, authenticated
  using (published = true);

create policy destinations_public_read on public.destinations
  for select to anon, authenticated
  using (true);

-- Read-only for the public roles; no writes from the browser.
revoke insert, update, delete on public.listings from anon, authenticated;
revoke insert, update, delete on public.destinations from anon, authenticated;;
