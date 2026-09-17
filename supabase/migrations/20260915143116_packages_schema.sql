create type public.package_basis as enum ('per_night', 'per_day', 'total');

-- Support for the composite foreign key below: a package may only sit on an
-- annonce its own partner owns, and that is checked declaratively rather than
-- by a trigger.
create unique index listings_id_partner_key on public.listings (id, partner_id);

create table public.partner_packages (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null,
  listing_id uuid not null,
  name text not null,
  description text not null default '',
  image_url text,
  price numeric(10,2) not null,
  basis public.package_basis not null,
  min_units smallint,
  starts_on date,
  ends_on date,
  usage_limit integer,
  used_count integer not null default 0,
  active boolean not null default true,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint partner_packages_listing_fkey
    foreign key (listing_id, partner_id)
    references public.listings (id, partner_id) on delete cascade,
  constraint partner_packages_name_check check (length(btrim(name)) > 0),
  constraint partner_packages_price_check check (price >= 0),
  constraint partner_packages_min_units_check check (min_units is null or min_units >= 1),
  constraint partner_packages_usage_limit_check check (usage_limit is null or usage_limit >= 1),
  constraint partner_packages_used_count_check check (used_count >= 0),
  constraint partner_packages_window_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.package_lines (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.partner_packages(id) on delete cascade,
  position smallint not null default 0,
  label text not null,
  unit_id uuid references public.listing_units(id) on delete restrict,
  listing_id uuid references public.listings(id) on delete restrict,
  menu_item_id uuid references public.menu_items(id) on delete restrict,
  quantity smallint not null default 1,
  recurring boolean not null default false,
  reference_value numeric(10,2),
  constraint package_lines_label_check check (length(btrim(label)) > 0),
  constraint package_lines_quantity_check check (quantity >= 1),
  constraint package_lines_value_check check (reference_value is null or reference_value >= 0),
  -- A line is bound to at most one real thing.
  constraint package_lines_one_binding
    check (num_nonnulls(unit_id, listing_id, menu_item_id) <= 1),
  -- A bound line never carries a copy of a price: it is read live, or the
  -- saving becomes a lie the day the partner changes a rate.
  constraint package_lines_bound_has_no_copy
    check (num_nonnulls(unit_id, listing_id, menu_item_id) = 0 or reference_value is null)
);

alter table public.booking_items
  add column package_id uuid references public.partner_packages(id) on delete set null;

create index partner_packages_listing_active_idx on public.partner_packages (listing_id) where active;
create index partner_packages_partner_idx on public.partner_packages (partner_id);
create index package_lines_package_idx on public.package_lines (package_id, position);
create index booking_items_package_idx on public.booking_items (package_id) where package_id is not null;

comment on table public.partner_packages is
  'A promotional bundle: several things the partner already sells, under one name, at a price the partner sets. Not an annonce - it carries no availability of its own.';
comment on column public.partner_packages.basis is
  'Whether price is per night, per day, or for the whole thing.';
comment on column public.partner_packages.min_units is
  'Minimum nights or days the package requires.';
comment on column public.partner_packages.used_count is
  'Sales so far. Written only from the booking path; a trigger refuses every other writer.';
comment on column public.partner_packages.starts_on is
  'Promotional window, compared against the purchase date - not the dates of the stay.';
comment on column public.package_lines.recurring is
  'The line counts once, or once per unit of stay (night or day).';
comment on column public.package_lines.reference_value is
  'What the line would cost separately. Only for described lines: a bound line reads its value live from the thing it points at.';;
