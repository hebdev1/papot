-- Replaces the loose `details jsonb` bag with typed, constrained columns.
-- Safe to rebuild: the table is empty.
drop table if exists public.partner_applications cascade;

create type public.payout_method       as enum ('bank', 'card', 'mobile');
create type public.confirmation_mode   as enum ('automatique', 'manuelle');
create type public.cancellation_policy as enum ('free_2h', 'free_24h', 'non_refundable');
create type public.price_band          as enum ('$', '$$', '$$$', '$$$$');

create table public.partner_applications (
  id          uuid primary key default gen_random_uuid(),
  type        public.partner_type not null,
  user_id     uuid references auth.users(id) on delete set null,

  ---- contact -------------------------------------------------------------
  first_name  text not null check (length(trim(first_name)) between 1 and 80),
  last_name   text not null check (length(trim(last_name))  between 1 and 80),
  email       text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  phone       text not null check (length(trim(phone)) between 6 and 30),
  whatsapp    text          check (whatsapp is null or length(trim(whatsapp)) between 6 and 30),
  locale      text not null default 'fr' check (locale in ('fr', 'ht', 'en')),

  ---- business ------------------------------------------------------------
  business_name    text not null check (length(trim(business_name)) between 2 and 120),
  legal_name       text,
  business_subtype text,
  year_established smallint check (year_established between 1800 and extract(year from now())::int + 1),
  business_email   text     check (business_email is null or business_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  business_phone   text,
  website          text     check (website is null or website ~* '^https?://'),
  short_desc       text not null check (length(trim(short_desc)) between 10 and 300),
  full_desc        text,

  ---- location ------------------------------------------------------------
  country       text not null default 'Haïti' check (length(trim(country)) > 0),
  department    text,
  city          text not null check (length(trim(city)) between 2 and 80),
  commune       text,
  neighborhood  text,
  postal_code   text,
  landmark      text,
  arrival_notes text,

  ---- capacity, per vertical ---------------------------------------------
  rooms_count    smallint check (rooms_count    > 0 and rooms_count    <= 2000),
  floors         smallint check (floors         > 0 and floors         <= 200),
  max_capacity   smallint check (max_capacity   > 0 and max_capacity   <= 10000),
  fleet_size     smallint check (fleet_size     > 0 and fleet_size     <= 5000),
  seats_capacity smallint check (seats_capacity > 0 and seats_capacity <= 5000),
  price_band     public.price_band,

  ---- restaurant service --------------------------------------------------
  min_party             smallint check (min_party > 0),
  max_party             smallint check (max_party > 0),
  meal_duration_minutes smallint check (meal_duration_minutes between 15 and 600),
  min_notice_hours      smallint check (min_notice_hours between 0 and 720),
  confirmation_mode     public.confirmation_mode,
  cancellation_policy   public.cancellation_policy,

  ---- car pricing ---------------------------------------------------------
  daily_rate         numeric(10,2) check (daily_rate   > 0),
  weekly_rate        numeric(10,2) check (weekly_rate  > 0),
  monthly_rate       numeric(10,2) check (monthly_rate > 0),
  deposit            numeric(10,2) check (deposit     >= 0),
  included_km_per_day integer      check (included_km_per_day >= 0),
  extra_km_price     numeric(10,2) check (extra_km_price >= 0),

  ---- payout: non-sensitive only -----------------------------------------
  payout_method        public.payout_method,
  payout_holder        text,
  payout_bank          text,
  payout_country       text,
  payout_currency      text   check (payout_currency in ('USD', 'HTG')),
  payout_account_last4 char(4) check (payout_account_last4 ~ '^[0-9]{4}$'),
  payout_mobile_service text,

  ---- workflow ------------------------------------------------------------
  agree                boolean not null check (agree),
  photos               text[]  not null default '{}',
  status               public.application_status not null default 'new',
  submitted_at         timestamptz not null default now(),
  reviewed_at          timestamptz,
  reviewed_by          uuid references auth.users(id) on delete set null,
  review_note          text,
  confirmation_sent_at timestamptz,
  created_at           timestamptz not null default now(),

  ---- cross-field rules ---------------------------------------------------
  constraint hotel_needs_capacity check (
    type <> 'hotel' or (rooms_count is not null and max_capacity is not null)),
  constraint guesthouse_needs_rooms check (
    type <> 'guesthouse' or rooms_count is not null),
  constraint car_needs_fleet_and_rate check (
    type <> 'car' or (fleet_size is not null and daily_rate is not null)),
  constraint restaurant_needs_seats check (
    type <> 'restaurant' or (seats_capacity is not null and price_band is not null)),

  -- vertical-specific columns may only be set on their own vertical
  constraint car_pricing_only_on_cars check (
    type = 'car' or (daily_rate is null and weekly_rate is null and monthly_rate is null
                     and deposit is null and included_km_per_day is null and extra_km_price is null)),
  constraint restaurant_service_only_on_restaurants check (
    type = 'restaurant' or (min_party is null and max_party is null
                            and meal_duration_minutes is null and confirmation_mode is null)),
  constraint fleet_only_on_cars check (type = 'car' or fleet_size is null),
  constraint seats_only_on_restaurants check (type = 'restaurant' or seats_capacity is null),

  constraint party_range_ordered check (
    min_party is null or max_party is null or max_party >= min_party),
  constraint rates_ordered check (
    weekly_rate is null or daily_rate is null or weekly_rate >= daily_rate),
  constraint reviewed_fields_together check (
    (status in ('new')) = (reviewed_at is null))
);

create index partner_applications_status_idx  on public.partner_applications (status, submitted_at desc);
create index partner_applications_type_idx    on public.partner_applications (type);
create index partner_applications_user_idx    on public.partner_applications (user_id);
create unique index partner_applications_no_dupes
  on public.partner_applications (lower(email), lower(business_name))
  where status <> 'rejected';

alter table public.partner_applications enable row level security;
revoke all on public.partner_applications from anon, authenticated;;
