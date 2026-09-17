create type availability_status as enum
  ('available', 'blocked', 'booked', 'maintenance', 'closed');

-- One row per listing per day. A calendar needs a place to say "this night is
-- blocked", and nothing in the schema could express that.
create table listing_availability (
  listing_id uuid not null references listings(id) on delete cascade,
  day        date not null,
  status     availability_status not null default 'available',
  quantity   smallint check (quantity is null or quantity >= 0),
  min_stay   smallint check (min_stay is null or min_stay > 0),
  max_stay   smallint check (max_stay is null or max_stay > 0),
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  note       text,
  updated_at timestamptz not null default now(),
  primary key (listing_id, day),
  check (max_stay is null or min_stay is null or max_stay >= min_stay)
);

create index listing_availability_day_idx on listing_availability (day);

create type rate_kind as enum
  ('base', 'weekend', 'weekly', 'monthly', 'seasonal', 'special_date');

create table listing_rates (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  kind       rate_kind not null default 'base',
  label      text,
  price      numeric(12,2) not null check (price >= 0),
  starts_on  date,
  ends_on    date,
  -- 0 = Monday, matching the hours table already in use.
  weekdays   smallint[],
  min_stay   smallint,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  -- A seasonal rate without dates is a base rate wearing a costume.
  check (kind <> 'seasonal' or (starts_on is not null and ends_on is not null))
);

create type discount_kind as enum
  ('early_booking', 'last_minute', 'weekly', 'monthly', 'seasonal', 'promo_code', 'returning');

create table partner_discounts (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  name        text not null,
  kind        discount_kind not null,
  percent     numeric(5,2) check (percent between 0 and 100),
  amount      numeric(12,2) check (amount >= 0),
  code        text,
  starts_on   date,
  ends_on     date,
  min_nights  smallint,
  min_spend   numeric(12,2),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  used_count  integer not null default 0,
  eligible_listings uuid[],
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (percent is not null or amount is not null),
  check (kind <> 'promo_code' or code is not null),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index partner_discount_code_idx
  on partner_discounts (partner_id, upper(code)) where code is not null;

create type fee_kind as enum
  ('cleaning', 'service', 'resort', 'delivery', 'extra_guest', 'deposit', 'tax', 'other');

create table partner_fees (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  listing_id  uuid references listings(id) on delete cascade,
  name        text not null,
  kind        fee_kind not null,
  amount_type text not null check (amount_type in ('fixed', 'percent')),
  amount      numeric(12,2) not null check (amount >= 0),
  per_night   boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (amount_type <> 'percent' or amount <= 100)
);

-- Restaurant floor (spec sections 78-79).
create table seating_areas (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  name       text not null,
  position   smallint not null default 0
);

create type table_status as enum ('available', 'reserved', 'occupied', 'blocked');

create table restaurant_tables (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  area_id    uuid references seating_areas(id) on delete set null,
  label      text not null,
  seats      smallint not null check (seats > 0),
  status     table_status not null default 'available',
  position   smallint not null default 0,
  unique (listing_id, label)
);

-- Rental operations (spec sections 75-76).
create type pickup_kind as enum ('office', 'airport', 'hotel_delivery', 'custom');

create table pickup_locations (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners(id) on delete cascade,
  name         text not null,
  kind         pickup_kind not null default 'office',
  address      text,
  hours        text,
  delivery_fee numeric(12,2) check (delivery_fee is null or delivery_fee >= 0),
  instructions text,
  active       boolean not null default true
);

create type maintenance_kind as enum ('maintenance', 'inspection', 'cleaning', 'repair');

create table vehicle_maintenance (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  kind       maintenance_kind not null default 'maintenance',
  starts_on  date not null,
  ends_on    date not null,
  note       text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

/**
 * Maintenance dates block the calendar automatically (spec section 75).
 *
 * A vehicle marked for repair that stays bookable is how a partner ends up
 * cancelling on a customer, so the block is applied by the database rather
 * than left to the interface to remember.
 */
create or replace function apply_maintenance_block()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    delete from listing_availability
     where listing_id = old.listing_id
       and day between old.starts_on and old.ends_on
       and status = 'maintenance';
    return old;
  end if;

  insert into listing_availability (listing_id, day, status, note)
  select new.listing_id, d::date, 'maintenance', new.note
    from generate_series(new.starts_on, new.ends_on, interval '1 day') d
  on conflict (listing_id, day) do update
    set status = 'maintenance', note = excluded.note, updated_at = now();

  return new;
end;
$$;

create trigger vehicle_maintenance_blocks
  after insert or update or delete on vehicle_maintenance
  for each row execute function apply_maintenance_block();

create table partner_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  title      text not null,
  body       text not null,
  position   smallint not null default 0
);

create table partner_notification_prefs (
  partner_id uuid not null references partners(id) on delete cascade,
  event      text not null,
  channels   text[] not null default '{in_app}',
  primary key (partner_id, event)
);

create type integration_status as enum ('connected', 'disconnected', 'error');

create table partner_integrations (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references partners(id) on delete cascade,
  kind           text not null check (kind in
                 ('google_calendar', 'ical', 'channel_manager', 'accounting', 'pos', 'payment')),
  status         integration_status not null default 'disconnected',
  last_synced_at timestamptz,
  config         jsonb,
  created_at     timestamptz not null default now(),
  unique (partner_id, kind)
);

-- Scoping. Everything here belongs to one business, so every policy says so.
alter table listing_availability enable row level security;
alter table listing_rates enable row level security;
alter table partner_discounts enable row level security;
alter table partner_fees enable row level security;
alter table seating_areas enable row level security;
alter table restaurant_tables enable row level security;
alter table pickup_locations enable row level security;
alter table vehicle_maintenance enable row level security;
alter table partner_quick_replies enable row level security;
alter table partner_notification_prefs enable row level security;
alter table partner_integrations enable row level security;

-- Availability and rates are public knowledge: the site must show what is free
-- and at what price. Writing them is the partner's.
create policy availability_public_read on listing_availability for select to anon, authenticated
  using (true);
create policy availability_partner_write on listing_availability for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_availability')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_availability')));

create policy rates_public_read on listing_rates for select to anon, authenticated
  using (active);
create policy rates_partner_write on listing_rates for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_pricing')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_pricing')));

create policy discounts_partner_all on partner_discounts for all to authenticated
  using (partner_can(partner_id, 'manage_pricing') or admin_can('view_payments'))
  with check (partner_can(partner_id, 'manage_pricing'));

create policy fees_partner_all on partner_fees for all to authenticated
  using (partner_can(partner_id, 'manage_pricing') or admin_can('view_payments'))
  with check (partner_can(partner_id, 'manage_pricing'));

create policy areas_public_read on seating_areas for select to anon, authenticated using (true);
create policy areas_partner_write on seating_areas for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')));

create policy tables_partner_all on restaurant_tables for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_reservations')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')));

create policy pickup_public_read on pickup_locations for select to anon, authenticated
  using (active);
create policy pickup_partner_write on pickup_locations for all to authenticated
  using (partner_can(partner_id, 'manage_listings'))
  with check (partner_can(partner_id, 'manage_listings'));

create policy maintenance_partner_all on vehicle_maintenance for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_availability')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_availability')));

create policy quick_replies_partner_all on partner_quick_replies for all to authenticated
  using (partner_can(partner_id, 'manage_messages'))
  with check (partner_can(partner_id, 'manage_messages'));

create policy notif_prefs_partner_all on partner_notification_prefs for all to authenticated
  using (partner_can(partner_id, 'manage_settings'))
  with check (partner_can(partner_id, 'manage_settings'));

create policy integrations_partner_all on partner_integrations for all to authenticated
  using (partner_can(partner_id, 'manage_settings'))
  with check (partner_can(partner_id, 'manage_settings'));

grant select on listing_availability, listing_rates, seating_areas, pickup_locations to anon;
grant select, insert, update, delete on
  listing_availability, listing_rates, partner_discounts, partner_fees,
  seating_areas, restaurant_tables, pickup_locations, vehicle_maintenance,
  partner_quick_replies, partner_notification_prefs, partner_integrations
  to authenticated;

create trigger rates_partner_activity after insert or update or delete on listing_rates
  for each row execute function log_partner_change();;
