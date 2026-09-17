-- Phase 5: stock that cannot be oversold.
--
-- Phase 2 gave a dish a single `quantity_available`, which answered neither
-- "how many did we make today" nor "how many are left" — and no dish ever used
-- it. Inventory is a fact about a *day*: Soup Joumou prepared on Sunday is
-- consumed by Sunday's orders.

create table public.restaurant_inventory (
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  day           date not null,
  prepared      smallint not null default 0,
  sold          smallint not null default 0,
  remaining     smallint generated always as (prepared - sold) stored,
  low_threshold smallint,
  updated_at    timestamptz not null default now(),

  primary key (item_id, day),
  constraint prepared_positive     check (prepared >= 0),
  constraint sold_positive         check (sold >= 0),
  -- The last line of defence: even a logic slip cannot sell the portion that
  -- does not exist.
  constraint sold_within_prepared  check (sold <= prepared),
  constraint threshold_positive    check (low_threshold is null or low_threshold >= 0)
);

comment on table public.restaurant_inventory is
  'Prepared / sold / remaining per dish per service day. No row means the dish is not counted.';
comment on column public.restaurant_inventory.remaining is
  'Generated. There is deliberately no "reserved" column: nothing sits between the customer committing and the order existing, because nothing is charged online. A checkout hold belongs with online payment.';

create index restaurant_inventory_day on public.restaurant_inventory (day, item_id);

create trigger restaurant_inventory_touch
  before update on public.restaurant_inventory
  for each row execute function public.touch_updated_at();

-- One source of truth; the column it replaces was never filled.
alter table public.menu_items drop column quantity_available;

-- Which day's stock an order draws on, so a cancellation gives back the right
-- day's portions.
alter table public.restaurant_orders
  add column service_day date not null default (now() at time zone 'America/Port-au-Prince')::date;

comment on column public.restaurant_orders.service_day is
  'The day the food is for, in Port-au-Prince. Drives inventory, not created_at.';

------------------------------------------------------------------ policies --
alter table public.restaurant_inventory enable row level security;

-- Public: how many are left is what makes "Plus que 2" honest on a menu.
create policy inventory_public_read on public.restaurant_inventory
  for select to anon, authenticated using (true);

create policy inventory_partner_all on public.restaurant_inventory
  for all to authenticated
  using (exists (select 1 from public.menu_items m join public.listings l on l.id = m.listing_id
                  where m.id = restaurant_inventory.item_id
                    and public.partner_can(l.partner_id, 'manage_inventory')))
  with check (exists (select 1 from public.menu_items m join public.listings l on l.id = m.listing_id
                       where m.id = restaurant_inventory.item_id
                         and public.partner_can(l.partner_id, 'manage_inventory')));

grant select on public.restaurant_inventory to anon, authenticated;
grant insert, update, delete on public.restaurant_inventory to authenticated;
;
