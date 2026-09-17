-- Phase 7: how the food actually reaches the customer.
--
-- The specification prices delivery by distance ("Zone A · 0–3 miles · $3").
-- PAPOT has no coordinates for anyone — the wizard's map is a placeholder — so
-- a distance would be invented. Zones are named areas instead: the restaurant
-- lists the neighbourhoods it serves and what each costs, which is how this
-- works on the ground. Distance banding can come later, on top of real
-- coordinates, without changing the shape of an order.

create table public.delivery_zones (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  name        text not null,
  fee         numeric(10,2) not null default 0,
  min_order   numeric(10,2),
  eta_minutes smallint,
  position    smallint not null default 0,
  active      boolean not null default true,

  constraint zone_fee_positive       check (fee >= 0),
  constraint zone_min_positive       check (min_order is null or min_order >= 0),
  constraint zone_eta_sane           check (eta_minutes is null or eta_minutes between 1 and 480),
  constraint zone_name_length        check (length(btrim(name)) between 1 and 60),
  constraint one_zone_name_per_menu  unique (listing_id, name)
);

comment on table public.delivery_zones is
  'Named areas a restaurant delivers to, each with its own fee, minimum and estimate.';

create index delivery_zones_listing on public.delivery_zones (listing_id, position);

alter table public.restaurant_settings
  add column delivery_eta_minutes   smallint not null default 45,
  add column delivery_free_over     numeric(10,2),
  add column pickup_instructions    text,
  add column delivery_instructions  text,
  add column order_max_advance_days smallint not null default 7;

alter table public.restaurant_settings
  add constraint delivery_eta_sane     check (delivery_eta_minutes between 1 and 480),
  add constraint free_over_positive    check (delivery_free_over is null or delivery_free_over >= 0),
  add constraint order_advance_sane    check (order_max_advance_days between 0 and 365);

comment on column public.restaurant_settings.delivery_free_over is
  'Subtotal above which delivery costs nothing. Null means the fee always applies.';
comment on column public.restaurant_settings.order_max_advance_days is
  'How far ahead a pre-order may be placed. 0 means today only.';

-- Which zone an order is going to, and what that cost at the time.
alter table public.restaurant_orders
  add column delivery_zone_id uuid references public.delivery_zones(id) on delete set null;

-- A delivery has to name its zone once the restaurant has defined any.
comment on column public.restaurant_orders.delivery_zone_id is
  'Null on pickup and dine-in, and on deliveries taken before any zone existed.';

alter table public.delivery_zones enable row level security;

create policy delivery_zones_public_read on public.delivery_zones
  for select to anon, authenticated using (true);

create policy delivery_zones_partner_all on public.delivery_zones
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = delivery_zones.listing_id
                    and public.partner_can(l.partner_id, 'manage_settings')))
  with check (exists (select 1 from public.listings l
                       where l.id = delivery_zones.listing_id
                         and public.partner_can(l.partner_id, 'manage_settings')));

grant select on public.delivery_zones to anon, authenticated;
grant insert, update, delete on public.delivery_zones to authenticated;
;
