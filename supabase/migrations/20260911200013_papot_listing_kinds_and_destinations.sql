-- Rate taken from the canvas itself: 65 $ ≈ 8 515 HTG, 92 $ ≈ 12 052 HTG.
update public.exchange_rates set rate = 131.00 where base = 'USD' and quote = 'HTG';

create type public.listing_kind as enum ('stay', 'restaurant', 'car');

alter table public.listings
  add column kind public.listing_kind not null default 'stay',
  add column vendor text,
  add column rating_scale smallint not null default 10 check (rating_scale in (5, 10)),
  add column attrs jsonb not null default '{}'::jsonb;

-- Stays rate /10 (Booking-style), restaurants and cars /5, as drawn.
alter table public.listings drop constraint if exists listings_rating_check;
alter table public.listings
  add constraint listings_rating_in_scale check (rating >= 0 and rating <= rating_scale);

-- Stars only apply to accommodation.
alter table public.listings alter column stars drop not null;

create index listings_kind_idx on public.listings (kind, published, position);

alter table public.destinations
  add column region      text,
  add column tagline     text,
  add column blurb       text,
  add column restaurants integer not null default 0 check (restaurants >= 0),
  add column from_usd    numeric(10,2),
  add column tier        smallint not null default 2 check (tier between 1 and 3);

alter table public.destinations alter column img drop not null;;
