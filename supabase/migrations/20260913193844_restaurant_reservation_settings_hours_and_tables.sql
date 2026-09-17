-- Phase 1 of the restaurant specification (§4 steps 5, 6, 7).
--
-- A restaurant reservation looked as though it worked: the public page offered
-- slots from a static `attrs.all_slots` array on a date written into the source,
-- and no table was ever assigned. These are the tables that make it real.

------------------------------------------------------------------ settings --
create table public.restaurant_settings (
  listing_id                  uuid primary key references public.listings(id) on delete cascade,

  accept_online_reservations  boolean  not null default true,
  max_advance_days            smallint not null default 60,
  min_notice_minutes          integer  not null default 120,
  same_day_allowed            boolean  not null default true,

  -- How long a table is held. The availability window is built from this, so it
  -- is the single figure that decides how many sittings a service has.
  default_duration_minutes    smallint not null default 90,
  grace_period_minutes        smallint not null default 15,

  min_party                   smallint not null default 1,
  max_party                   smallint not null default 12,

  auto_confirm                boolean  not null default true,
  cancellation_deadline_hours smallint,
  cancellation_policy         public.cancellation_policy,
  no_show_policy              text,

  deposit_required            boolean  not null default false,
  deposit_amount              numeric(10,2),

  updated_at                  timestamptz not null default now(),

  constraint party_range_ordered        check (max_party >= min_party),
  constraint min_party_positive         check (min_party >= 1),
  constraint max_party_sane             check (max_party <= 200),
  constraint duration_sane              check (default_duration_minutes between 15 and 600),
  constraint notice_sane                check (min_notice_minutes between 0 and 43200),
  constraint advance_sane               check (max_advance_days between 1 and 730),
  constraint grace_sane                 check (grace_period_minutes between 0 and 180),
  constraint cancellation_deadline_sane check (cancellation_deadline_hours is null
                                               or cancellation_deadline_hours between 0 and 720),
  -- A deposit nobody set an amount for is a promise the checkout cannot keep.
  constraint deposit_has_amount         check (not deposit_required or deposit_amount is not null),
  constraint deposit_amount_positive    check (deposit_amount is null or deposit_amount >= 0)
);

comment on table public.restaurant_settings is
  'Per-restaurant reservation rules (specification §4 step 5). One row per restaurant listing.';

create trigger restaurant_settings_touch
  before update on public.restaurant_settings
  for each row execute function public.touch_updated_at();

--------------------------------------------------------------------- hours --
-- Several rows per weekday, so a split service (lunch, then dinner) is two rows
-- rather than one impossible range. A weekday with no row is closed.
--
-- Phase 1 deliberately holds a service inside one calendar day: `closes_at`
-- must be later than `opens_at`. A service running past midnight needs the
-- reservation date to mean something other than the date the guest picked, and
-- that belongs with the rest of the ordering work, not here.
create table public.restaurant_hours (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  weekday    smallint not null,
  opens_at   time not null,
  closes_at  time not null,
  position   smallint not null default 0,

  constraint weekday_range   check (weekday between 0 and 6),
  constraint closes_after    check (closes_at > opens_at),
  constraint one_service_per_start unique (listing_id, weekday, opens_at)
);

comment on table public.restaurant_hours is
  'Opening hours per weekday, one row per service. Monday is 0. No row means closed.';

create index restaurant_hours_listing_weekday on public.restaurant_hours (listing_id, weekday);

------------------------------------------------------------- seating areas --
alter table public.seating_areas
  add column area_type   text,
  add column description text,
  add column smoking     boolean  not null default false,
  add column capacity    smallint,
  add column active      boolean  not null default true;

alter table public.seating_areas
  add constraint area_capacity_positive check (capacity is null or capacity > 0);

-------------------------------------------------------------------- tables --
-- `seats` stays the physical seat count. The party a table actually accepts is
-- a separate decision the owner makes: a four-top may be offered from two.
alter table public.restaurant_tables
  add column table_number text,
  add column min_guests   smallint not null default 1,
  add column max_guests   smallint,
  add column accessible   boolean not null default false,
  add column can_combine  boolean not null default false,
  add column active       boolean not null default true;

update public.restaurant_tables set max_guests = seats where max_guests is null;

alter table public.restaurant_tables
  alter column max_guests set not null;

alter table public.restaurant_tables
  add constraint guest_range_ordered check (max_guests >= min_guests),
  add constraint min_guests_positive check (min_guests >= 1);

------------------------------------------------------------- the assignment --
-- Which table a reservation actually holds. Null for every non-restaurant item,
-- and for restaurant rows written before this existed.
alter table public.booking_items
  add column table_id uuid references public.restaurant_tables(id) on delete set null;

create index booking_items_table_slot
  on public.booking_items (table_id, starts_on)
  where table_id is not null;

-- The overlap check reads every reservation a restaurant holds on a date.
create index booking_items_restaurant_day
  on public.booking_items (listing_id, starts_on)
  where kind = 'restaurant';

------------------------------------------------------------------ policies --
alter table public.restaurant_settings enable row level security;
alter table public.restaurant_hours    enable row level security;

-- The public page needs the party limits and the opening hours to draw itself.
create policy restaurant_settings_public_read on public.restaurant_settings
  for select to anon, authenticated using (true);

create policy restaurant_settings_partner_all on public.restaurant_settings
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = restaurant_settings.listing_id
                    and public.partner_can(l.partner_id, 'manage_settings')))
  with check (exists (select 1 from public.listings l
                       where l.id = restaurant_settings.listing_id
                         and public.partner_can(l.partner_id, 'manage_settings')));

create policy restaurant_hours_public_read on public.restaurant_hours
  for select to anon, authenticated using (true);

create policy restaurant_hours_partner_all on public.restaurant_hours
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = restaurant_hours.listing_id
                    and public.partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from public.listings l
                       where l.id = restaurant_hours.listing_id
                         and public.partner_can(l.partner_id, 'manage_listings')));

grant select on public.restaurant_settings to anon, authenticated;
grant select on public.restaurant_hours    to anon, authenticated;
grant insert, update, delete on public.restaurant_settings to authenticated;
grant insert, update, delete on public.restaurant_hours    to authenticated;
;
