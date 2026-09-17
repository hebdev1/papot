-- Phase 4: sizes and options.
--
-- Until now a dish had one price and any "extra" a customer typed was carried
-- as a label worth nothing, because letting the client send a price delta is
-- letting the client set the price. These tables are where a delta becomes a
-- fact the kitchen owns.

------------------------------------------------------------- sizes --
create table public.dish_variations (
  id       uuid primary key default gen_random_uuid(),
  item_id  uuid not null references public.menu_items(id) on delete cascade,
  name     text not null,
  price    numeric(10,2) not null,
  position smallint not null default 0,
  active   boolean not null default true,

  constraint variation_price_positive check (price >= 0),
  constraint variation_name_length    check (length(btrim(name)) between 1 and 40),
  constraint one_variation_name_per_dish unique (item_id, name)
);

comment on table public.dish_variations is
  'Portions of one dish. The price is absolute, not a delta: "Petite 10, Familiale 35" is how a menu reads.';

create index dish_variations_item on public.dish_variations (item_id, position);

--------------------------------------------------------- option groups --
-- Groups belong to the restaurant, not to one dish: "Choix du riz" is asked on
-- every plate, and a copy per dish would drift the day the kitchen changes it.
create table public.modifier_groups (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name       text not null,
  selection  text not null default 'single',
  required   boolean not null default false,
  min_select smallint not null default 0,
  max_select smallint not null default 1,
  position   smallint not null default 0,
  active     boolean not null default true,

  constraint group_selection_known check (selection in ('single', 'multiple', 'quantity')),
  constraint group_range_ordered   check (max_select >= min_select),
  constraint group_min_positive    check (min_select >= 0 and max_select >= 1),
  -- "Required" with a minimum of zero is a contradiction the form must not save.
  constraint required_needs_one    check (not required or min_select >= 1),
  constraint single_picks_one      check (selection <> 'single' or max_select = 1),
  constraint one_group_name_per_menu unique (listing_id, name)
);

comment on table public.modifier_groups is
  'A question asked about a dish: choice of rice, spice level, sides. Reusable across dishes.';

create table public.modifiers (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.modifier_groups(id) on delete cascade,
  name         text not null,
  price_delta  numeric(10,2) not null default 0,
  max_quantity smallint,
  position     smallint not null default 0,
  active       boolean not null default true,

  constraint modifier_quantity_positive check (max_quantity is null or max_quantity between 1 and 99),
  constraint one_modifier_name_per_group unique (group_id, name)
);

comment on column public.modifiers.price_delta is
  'What this option adds. May be negative — removing an ingredient can cost less.';

create index modifiers_group on public.modifiers (group_id, position);

-- Which questions are asked about which dish.
create table public.menu_item_modifier_groups (
  item_id  uuid not null references public.menu_items(id) on delete cascade,
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  position smallint not null default 0,
  primary key (item_id, group_id)
);

create index menu_item_modifier_groups_item on public.menu_item_modifier_groups (item_id, position);

-------------------------------------------------- what the order records --
alter table public.restaurant_order_items
  add column variation_id   uuid references public.dish_variations(id) on delete set null,
  add column variation_name text,
  add column base_price     numeric(10,2);

comment on column public.restaurant_order_items.variation_name is
  'Snapshot, like `name` and `unit_price`: a menu changes, a receipt does not.';

-- A customization can now carry a real price, and points back at what produced
-- it so a receipt can be explained.
alter table public.order_item_customizations
  add column modifier_id uuid references public.modifiers(id) on delete set null;

------------------------------------------------------------------ policies --
alter table public.dish_variations           enable row level security;
alter table public.modifier_groups           enable row level security;
alter table public.modifiers                 enable row level security;
alter table public.menu_item_modifier_groups enable row level security;

create policy dish_variations_public_read on public.dish_variations
  for select to anon, authenticated using (true);
create policy modifier_groups_public_read on public.modifier_groups
  for select to anon, authenticated using (true);
create policy modifiers_public_read on public.modifiers
  for select to anon, authenticated using (true);
create policy item_groups_public_read on public.menu_item_modifier_groups
  for select to anon, authenticated using (true);

create policy dish_variations_partner_all on public.dish_variations
  for all to authenticated
  using (exists (select 1 from public.menu_items m join public.listings l on l.id = m.listing_id
                  where m.id = dish_variations.item_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.menu_items m join public.listings l on l.id = m.listing_id
                       where m.id = dish_variations.item_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy modifier_groups_partner_all on public.modifier_groups
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = modifier_groups.listing_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.listings l
                       where l.id = modifier_groups.listing_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy modifiers_partner_all on public.modifiers
  for all to authenticated
  using (exists (select 1 from public.modifier_groups g join public.listings l on l.id = g.listing_id
                  where g.id = modifiers.group_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.modifier_groups g join public.listings l on l.id = g.listing_id
                       where g.id = modifiers.group_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy item_groups_partner_all on public.menu_item_modifier_groups
  for all to authenticated
  using (exists (select 1 from public.menu_items m join public.listings l on l.id = m.listing_id
                  where m.id = menu_item_modifier_groups.item_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.menu_items m join public.listings l on l.id = m.listing_id
                       where m.id = menu_item_modifier_groups.item_id and public.partner_can(l.partner_id, 'manage_menu')));

grant select on public.dish_variations, public.modifier_groups, public.modifiers,
                public.menu_item_modifier_groups to anon, authenticated;
grant insert, update, delete on public.dish_variations, public.modifier_groups, public.modifiers,
                public.menu_item_modifier_groups to authenticated;
;
