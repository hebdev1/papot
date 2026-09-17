-- Structured, filterable attributes for kind = 'restaurant'.
-- Mirrors car_details: arrays rather than a wall of booleans, so new values
-- appear in the filter rail without a migration.
create table public.restaurant_details (
  listing_id           uuid primary key references public.listings(id) on delete cascade,
  cuisine              text not null,
  price_band           text not null check (price_band in ('$', '$$', '$$$', '$$$$')),
  neighborhood         text,
  zones                text[] not null default '{}',   -- Terrasse · Salle principale · Jardin
  services             text[] not null default '{}',   -- Déjeuner · Dîner · Brunch
  features             text[] not null default '{}',   -- Vue mer · Parking · Privatisable …
  capacity             smallint check (capacity > 0),
  instant_confirmation boolean not null default true,
  accepts_groups       boolean not null default false
);

create index restaurant_details_filter_idx on public.restaurant_details (cuisine, price_band);
create index restaurant_details_features_idx on public.restaurant_details using gin (features);

alter table public.restaurant_details enable row level security;

create policy restaurant_details_public_read on public.restaurant_details
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.restaurant_details from anon, authenticated;;
