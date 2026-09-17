-- Combos (§4A) and Build Your Own Plate (§4B) are the same machine.
--
-- Both are a named, priced thing made of groups the customer answers. A combo's
-- groups choose among dishes and it can carry dishes that are always included;
-- a custom plate's groups choose among components. One core, one pricing path,
-- one place to get the rules right — `kind` keeps them distinct to the eye.

------------------------------------------------------------- components --
-- Griot, diri djondjon, bannann: things a plate is built from, which are not
-- dishes anyone orders on their own.
create table public.food_components (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  name         text not null,
  category     text,
  description  text,
  image_url    text,
  base_price   numeric(10,2) not null default 0,
  max_quantity smallint,
  prep_minutes smallint,
  position     smallint not null default 0,
  active       boolean not null default true,

  constraint component_price_positive    check (base_price >= 0),
  constraint component_quantity_sane     check (max_quantity is null or max_quantity between 1 and 99),
  constraint component_prep_sane         check (prep_minutes is null or prep_minutes between 1 and 480),
  constraint one_component_name_per_menu unique (listing_id, name)
);

comment on table public.food_components is
  'Building blocks for custom plates. Not orderable on their own — that is what menu_items are for.';

create index food_components_listing on public.food_components (listing_id, position);

---------------------------------------------------------------- templates --
create table public.meal_templates (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  kind        text not null,
  name        text not null,
  description text,
  base_price  numeric(10,2) not null default 0,
  image_url   text,
  position    smallint not null default 0,
  active      boolean not null default true,

  constraint template_kind_known     check (kind in ('combo', 'custom')),
  constraint template_price_positive check (base_price >= 0),
  constraint one_template_name_per_menu unique (listing_id, name)
);

comment on column public.meal_templates.kind is
  'combo — a fixed offer at one price. custom — a plate the guest builds.';

create index meal_templates_listing on public.meal_templates (listing_id, position);

-- What a combo always contains. A custom plate has none of these.
create table public.meal_fixed_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_templates(id) on delete cascade,
  item_id     uuid not null references public.menu_items(id) on delete restrict,
  quantity    smallint not null default 1,
  position    smallint not null default 0,

  constraint fixed_quantity_positive check (quantity between 1 and 20)
);

create index meal_fixed_items_template on public.meal_fixed_items (template_id, position);

------------------------------------------------------------------- groups --
create table public.meal_groups (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_templates(id) on delete cascade,
  name        text not null,
  selection   text not null default 'single',
  required    boolean not null default false,
  min_select  smallint not null default 0,
  max_select  smallint not null default 1,
  position    smallint not null default 0,

  constraint meal_group_selection_known check (selection in ('single', 'multiple', 'quantity')),
  constraint meal_group_range_ordered   check (max_select >= min_select),
  constraint meal_group_min_positive    check (min_select >= 0 and max_select >= 1),
  constraint meal_required_needs_one    check (not required or min_select >= 1),
  constraint meal_single_picks_one      check (selection <> 'single' or max_select = 1)
);

create index meal_groups_template on public.meal_groups (template_id, position);

-- An option is a component or a dish, never both and never neither.
create table public.meal_group_options (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.meal_groups(id) on delete cascade,
  component_id uuid references public.food_components(id) on delete cascade,
  item_id      uuid references public.menu_items(id) on delete cascade,
  price_delta  numeric(10,2) not null default 0,
  max_quantity smallint,
  position     smallint not null default 0,

  constraint option_is_one_thing   check (num_nonnulls(component_id, item_id) = 1),
  constraint option_quantity_sane  check (max_quantity is null or max_quantity between 1 and 99)
);

create index meal_group_options_group on public.meal_group_options (group_id, position);

--------------------------------------------------------- component stock --
-- Same shape as restaurant_inventory, because a component runs out the same
-- way a dish does. Kept separate rather than made polymorphic: a generated
-- `remaining` and a clean primary key are worth more than one fewer table.
create table public.component_inventory (
  component_id  uuid not null references public.food_components(id) on delete cascade,
  day           date not null,
  prepared      smallint not null default 0,
  sold          smallint not null default 0,
  remaining     smallint generated always as (prepared - sold) stored,
  low_threshold smallint,
  updated_at    timestamptz not null default now(),

  primary key (component_id, day),
  constraint c_prepared_positive    check (prepared >= 0),
  constraint c_sold_positive        check (sold >= 0),
  constraint c_sold_within_prepared check (sold <= prepared),
  constraint c_threshold_positive   check (low_threshold is null or low_threshold >= 0)
);

create index component_inventory_day on public.component_inventory (day, component_id);

create trigger component_inventory_touch
  before update on public.component_inventory
  for each row execute function public.touch_updated_at();

------------------------------------------------------ what an order keeps --
alter table public.restaurant_order_items
  add column template_id uuid references public.meal_templates(id) on delete set null,
  add column template_kind text;

-- A line is a dish or a template, never both.
alter table public.restaurant_order_items
  add constraint line_is_dish_or_template check (num_nonnulls(item_id, template_id) >= 1),
  add constraint template_kind_matches check (
    template_id is null or template_kind in ('combo', 'custom'));

alter table public.order_item_customizations
  add column component_id uuid references public.food_components(id) on delete set null,
  add column quantity smallint not null default 1;

alter table public.order_item_customizations
  add constraint customization_quantity_positive check (quantity between 1 and 99);

------------------------------------------------------------------ policies --
alter table public.food_components     enable row level security;
alter table public.meal_templates      enable row level security;
alter table public.meal_fixed_items    enable row level security;
alter table public.meal_groups         enable row level security;
alter table public.meal_group_options  enable row level security;
alter table public.component_inventory enable row level security;

create policy food_components_public_read on public.food_components
  for select to anon, authenticated using (true);
create policy meal_templates_public_read on public.meal_templates
  for select to anon, authenticated using (true);
create policy meal_fixed_items_public_read on public.meal_fixed_items
  for select to anon, authenticated using (true);
create policy meal_groups_public_read on public.meal_groups
  for select to anon, authenticated using (true);
create policy meal_group_options_public_read on public.meal_group_options
  for select to anon, authenticated using (true);
create policy component_inventory_public_read on public.component_inventory
  for select to anon, authenticated using (true);

create policy food_components_partner_all on public.food_components
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = food_components.listing_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.listings l
                       where l.id = food_components.listing_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy meal_templates_partner_all on public.meal_templates
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = meal_templates.listing_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.listings l
                       where l.id = meal_templates.listing_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy meal_fixed_items_partner_all on public.meal_fixed_items
  for all to authenticated
  using (exists (select 1 from public.meal_templates t join public.listings l on l.id = t.listing_id
                  where t.id = meal_fixed_items.template_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.meal_templates t join public.listings l on l.id = t.listing_id
                       where t.id = meal_fixed_items.template_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy meal_groups_partner_all on public.meal_groups
  for all to authenticated
  using (exists (select 1 from public.meal_templates t join public.listings l on l.id = t.listing_id
                  where t.id = meal_groups.template_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.meal_templates t join public.listings l on l.id = t.listing_id
                       where t.id = meal_groups.template_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy meal_group_options_partner_all on public.meal_group_options
  for all to authenticated
  using (exists (select 1 from public.meal_groups g
                   join public.meal_templates t on t.id = g.template_id
                   join public.listings l on l.id = t.listing_id
                  where g.id = meal_group_options.group_id and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.meal_groups g
                        join public.meal_templates t on t.id = g.template_id
                        join public.listings l on l.id = t.listing_id
                       where g.id = meal_group_options.group_id and public.partner_can(l.partner_id, 'manage_menu')));

create policy component_inventory_partner_all on public.component_inventory
  for all to authenticated
  using (exists (select 1 from public.food_components c join public.listings l on l.id = c.listing_id
                  where c.id = component_inventory.component_id
                    and public.partner_can(l.partner_id, 'manage_inventory')))
  with check (exists (select 1 from public.food_components c join public.listings l on l.id = c.listing_id
                       where c.id = component_inventory.component_id
                         and public.partner_can(l.partner_id, 'manage_inventory')));

grant select on public.food_components, public.meal_templates, public.meal_fixed_items,
                public.meal_groups, public.meal_group_options, public.component_inventory
  to anon, authenticated;
grant insert, update, delete on public.food_components, public.meal_templates, public.meal_fixed_items,
                public.meal_groups, public.meal_group_options, public.component_inventory
  to authenticated;
;
