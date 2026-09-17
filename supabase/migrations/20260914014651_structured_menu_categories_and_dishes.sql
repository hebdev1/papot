-- Phase 2 of the restaurant specification: a menu you can build an order on.
--
-- `menu_items.category` was free text, so two spellings made two categories and
-- nothing downstream could rely on it. A dish also carried no photo, no
-- availability, no allergens and no preparation time — everything §4 step 9 and
-- "Digital Menu Management" need.

--------------------------------------------------------------- categories --
create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  name        text not null,
  description text,
  position    smallint not null default 0,
  active      boolean not null default true,

  constraint menu_category_name_length check (length(btrim(name)) between 1 and 60),
  constraint one_category_name_per_menu unique (listing_id, name)
);

comment on table public.menu_categories is
  'Menu sections (Entrées, Plats…). Replaces the free-text menu_items.category.';

create index menu_categories_listing on public.menu_categories (listing_id, position);

-- Every spelling that already exists becomes a category, in the order the
-- dishes were already in. Nothing on an existing menu is lost.
insert into public.menu_categories (listing_id, name, position)
select m.listing_id, btrim(m.category), (min(m.position))::smallint
  from public.menu_items m
 where btrim(coalesce(m.category, '')) <> ''
 group by m.listing_id, btrim(m.category);

-------------------------------------------------------------------- dishes --
alter table public.menu_items
  add column category_id        uuid references public.menu_categories(id) on delete restrict,
  add column description        text,
  add column discount_price     numeric(10,2),
  add column prep_minutes       smallint,
  add column available          boolean  not null default true,
  add column sold_out           boolean  not null default false,
  add column quantity_available smallint,
  add column dietary            text[]   not null default '{}',
  add column allergens          text[]   not null default '{}',
  add column popular            boolean  not null default false,
  add column chef_special       boolean  not null default false,
  add column image_url          text,
  add column available_weekdays smallint[] not null default '{}',
  add column available_from     time,
  add column available_until    time;

update public.menu_items m
   set category_id = c.id
  from public.menu_categories c
 where c.listing_id = m.listing_id
   and c.name = btrim(m.category);

alter table public.menu_items alter column category_id set not null;

-- `tag` held a single badge ("Végétarien"); it becomes the first entry of the
-- list that replaces it.
update public.menu_items
   set dietary = array[btrim(tag)]
 where btrim(coalesce(tag, '')) <> '';

alter table public.menu_items
  drop column category,
  drop column tag;

alter table public.menu_items
  add constraint menu_price_positive     check (price is null or price >= 0),
  -- A "discount" at or above the price is a claim, not a discount.
  add constraint menu_discount_is_lower  check (discount_price is null
                                                or (price is not null and discount_price >= 0
                                                    and discount_price < price)),
  add constraint menu_quantity_positive  check (quantity_available is null or quantity_available >= 0),
  add constraint menu_prep_sane          check (prep_minutes is null or prep_minutes between 1 and 480),
  add constraint menu_weekdays_valid     check (available_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  add constraint menu_window_paired      check ((available_from is null) = (available_until is null)),
  add constraint menu_window_ordered     check (available_until is null or available_until > available_from);

create index menu_items_category on public.menu_items (category_id, position);

comment on column public.menu_items.available_weekdays is
  'Days the dish is served. Empty means every day — Soup Joumou on Sunday is {6}.';
comment on column public.menu_items.image_url is
  'A URL. Both storage buckets are private, so a bucket path would render nothing on a public card.';

------------------------------------------------------------ private notes --
-- The recipe is not the menu. `menu_items` is world-readable, so preparation
-- notes live in their own table rather than behind a column grant that would
-- break `select *` for everyone.
create table public.menu_item_notes (
  item_id    uuid primary key references public.menu_items(id) on delete cascade,
  prep_notes text,
  updated_at timestamptz not null default now()
);

comment on table public.menu_item_notes is
  'Kitchen-only preparation notes. Never exposed to anon — deliberately not on menu_items.';

create trigger menu_item_notes_touch
  before update on public.menu_item_notes
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------ policies --
alter table public.menu_categories enable row level security;
alter table public.menu_item_notes enable row level security;

create policy menu_categories_public_read on public.menu_categories
  for select to anon, authenticated using (true);

create policy menu_categories_partner_all on public.menu_categories
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = menu_categories.listing_id
                    and public.partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from public.listings l
                       where l.id = menu_categories.listing_id
                         and public.partner_can(l.partner_id, 'manage_listings')));

-- No public policy at all: the kitchen's notes are for the kitchen.
create policy menu_item_notes_partner_all on public.menu_item_notes
  for all to authenticated
  using (exists (select 1 from public.menu_items m
                   join public.listings l on l.id = m.listing_id
                  where m.id = menu_item_notes.item_id
                    and public.partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from public.menu_items m
                        join public.listings l on l.id = m.listing_id
                       where m.id = menu_item_notes.item_id
                         and public.partner_can(l.partner_id, 'manage_listings')));

create policy menu_item_notes_staff_read on public.menu_item_notes
  for select to authenticated using (public.admin_can('view_listings'));

grant select on public.menu_categories to anon, authenticated;
grant insert, update, delete on public.menu_categories to authenticated;
grant select, insert, update, delete on public.menu_item_notes to authenticated;
revoke all on public.menu_item_notes from anon;
;
