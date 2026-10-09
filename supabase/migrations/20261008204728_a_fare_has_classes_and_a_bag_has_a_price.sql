-- The two priced things a bus sale has beyond the seat itself.
--
-- Both are read by quote_booking_item and by nothing in the browser. The rule
-- the whole platform runs on is that the browser names an option and the
-- database prices it: a passenger's request says "child fare, two extra bags",
-- never "that costs 9.50".
--
-- `class` is text with a check rather than an enum, because a new fare class
-- must not need a migration that cannot share a transaction with its first use
-- — the lesson of the two `add value` files at the start of this vertical.
create table public.bus_fares (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  class      text not null check (class in ('standard', 'child', 'senior', 'promo', 'vip')),
  label      text not null,
  -- Either an absolute fare, or a percentage of the route's own. A child at
  -- 50 % follows every fare change on its own; a flat 5 $ child fare does not.
  amount          numeric(10,2) check (amount is null or amount >= 0),
  percent_of_base numeric(5,2) check (percent_of_base is null
                                      or percent_of_base between 0 and 300),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (listing_id, class),
  -- A class that says neither what it costs nor how it scales is not a price.
  check (amount is not null or percent_of_base is not null)
);

create index bus_fares_listing_idx on public.bus_fares (listing_id, active);

-- One policy per route. A passenger must read it before paying, which is why it
-- is public on a published route.
create table public.bus_luggage_rules (
  listing_id          uuid primary key references public.listings(id) on delete cascade,
  free_kg             smallint check (free_kg is null or free_kg between 0 and 200),
  carry_on_kg         smallint check (carry_on_kg is null or carry_on_kg between 0 and 50),
  extra_price_per_bag numeric(10,2) check (extra_price_per_bag is null
                                           or extra_price_per_bag >= 0),
  -- What a passenger may buy at checkout. Null means extra bags are not sold
  -- online at all, which is different from "zero bags allowed".
  max_extra_bags      smallint check (max_extra_bags is null
                                      or max_extra_bags between 0 and 10),
  oversize_rule       text,
  note                text,
  updated_at          timestamptz not null default now()
);

alter table public.bus_fares enable row level security;
alter table public.bus_luggage_rules enable row level security;

create policy bus_fares_public_read on public.bus_fares
  for select to anon, authenticated
  using (active and exists (select 1 from public.listings l
                             where l.id = listing_id and l.kind = 'bus' and l.published));

create policy bus_fares_partner_read on public.bus_fares
  for select to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id
                    and (l.partner_id in (select my_partner_ids())
                      or admin_can('view_listings'))));

create policy bus_fares_partner_write on public.bus_fares
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_pricing')))
  with check (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_pricing')));

create policy bus_luggage_public_read on public.bus_luggage_rules
  for select to anon, authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and l.kind = 'bus' and l.published));

create policy bus_luggage_partner_read on public.bus_luggage_rules
  for select to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id
                    and (l.partner_id in (select my_partner_ids())
                      or admin_can('view_listings'))));

create policy bus_luggage_partner_write on public.bus_luggage_rules
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_pricing')))
  with check (exists (select 1 from public.listings l
                  where l.id = listing_id and partner_can(l.partner_id, 'manage_pricing')));;
