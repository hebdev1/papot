-- 1b: "Chambres et unités" — bookable units inside a stay.
create table public.listing_units (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  name        text not null,
  detail      text not null,
  price       numeric(10,2),
  available   boolean not null default true,
  position    integer not null default 0
);
create index listing_units_listing_idx on public.listing_units (listing_id, position);

-- 1c: "Carte" — restaurant menu.
create table public.menu_items (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  category   text not null,
  name       text not null,
  detail     text,
  tag        text,
  price      numeric(10,2),
  position   integer not null default 0
);
create index menu_items_listing_idx on public.menu_items (listing_id, position);

-- 1c: "Privatisation" — private-hire options.
create table public.private_options (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name       text not null,
  capacity   text not null,
  from_price text not null,
  position   integer not null default 0
);
create index private_options_listing_idx on public.private_options (listing_id, position);

alter table public.listing_units   enable row level security;
alter table public.menu_items      enable row level security;
alter table public.private_options enable row level security;

create policy listing_units_public_read on public.listing_units
  for select to anon, authenticated using (true);
create policy menu_items_public_read on public.menu_items
  for select to anon, authenticated using (true);
create policy private_options_public_read on public.private_options
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.listing_units   from anon, authenticated;
revoke insert, update, delete on public.menu_items      from anon, authenticated;
revoke insert, update, delete on public.private_options from anon, authenticated;;
