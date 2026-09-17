------------------------------------------------------- operating modes --
-- A restaurant chooses what it runs: reservations, orders, or both.
alter table public.restaurant_settings
  add column accept_online_orders  boolean  not null default false,
  add column allow_dine_in_orders  boolean  not null default false,
  add column allow_pickup          boolean  not null default true,
  add column allow_delivery        boolean  not null default false,
  add column order_prep_minutes    smallint not null default 25,
  add column order_min_total       numeric(10,2);

alter table public.restaurant_settings
  add constraint order_prep_sane    check (order_prep_minutes between 1 and 480),
  add constraint order_min_positive check (order_min_total is null or order_min_total >= 0),
  -- Taking orders with no way to hand them over is a dead end.
  add constraint orders_need_a_mode check (
    not accept_online_orders or allow_dine_in_orders or allow_pickup or allow_delivery);

comment on column public.restaurant_settings.accept_online_orders is
  'Off by default: a restaurant opts in to running a kitchen queue.';

--------------------------------------------------------------- the order --
create table public.restaurant_orders (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  listing_id       uuid not null references public.listings(id) on delete restrict,
  user_id          uuid,

  customer_name    text not null,
  customer_phone   text not null,
  customer_email   text,

  fulfillment      public.fulfillment_mode not null,
  status           public.food_order_status not null default 'received',

  -- Null means as soon as possible.
  scheduled_for    timestamptz,
  address          text,
  address_notes    text,

  subtotal         numeric(10,2) not null,
  discount         numeric(10,2) not null default 0,
  tax              numeric(10,2) not null default 0,
  delivery_fee     numeric(10,2) not null default 0,
  service_fee      numeric(10,2) not null default 0,
  tip              numeric(10,2) not null default 0,
  total            numeric(10,2) not null,
  currency         text not null default 'USD',

  payment_method   text,
  payment_status   public.food_payment_status not null default 'pending',

  note             text,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint order_amounts_positive check (
    subtotal >= 0 and discount >= 0 and tax >= 0 and delivery_fee >= 0
    and service_fee >= 0 and tip >= 0 and total >= 0),
  -- The total is the arithmetic, not a number the client sent.
  constraint order_total_adds_up check (
    total = subtotal - discount + tax + delivery_fee + service_fee + tip),
  constraint delivery_needs_address check (
    fulfillment <> 'delivery' or length(btrim(coalesce(address, ''))) > 0),
  constraint only_delivery_is_delivered check (
    fulfillment = 'delivery' or delivery_fee = 0),
  constraint payment_method_known check (
    payment_method is null or payment_method in ('cash', 'card', 'moncash', 'natcash')),
  constraint refusal_has_a_reason check (
    status not in ('rejected', 'cancelled') or length(btrim(coalesce(rejection_reason, ''))) > 0)
);

comment on table public.restaurant_orders is
  'One online food order. Money is collected on handover for now; payment_status tracks that.';

create index restaurant_orders_kitchen on public.restaurant_orders (listing_id, status, created_at desc);
create index restaurant_orders_customer on public.restaurant_orders (user_id, created_at desc)
  where user_id is not null;

create trigger restaurant_orders_touch
  before update on public.restaurant_orders
  for each row execute function public.touch_updated_at();

--------------------------------------------------------------- the lines --
-- `name` and `unit_price` are snapshots: a menu changes, a receipt does not.
create table public.restaurant_order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.restaurant_orders(id) on delete cascade,
  item_id    uuid references public.menu_items(id) on delete set null,
  name       text not null,
  unit_price numeric(10,2) not null,
  quantity   smallint not null,
  line_total numeric(10,2) not null,
  note       text,
  position   smallint not null default 0,

  constraint line_quantity_positive check (quantity between 1 and 99),
  constraint line_price_positive    check (unit_price >= 0 and line_total >= 0)
);

create index restaurant_order_items_order on public.restaurant_order_items (order_id, position);

-- Removals, extras, allergy notes. Phase 4's modifiers land here too, which is
-- why the shape is a typed label rather than a free-text blob.
create table public.order_item_customizations (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.restaurant_order_items(id) on delete cascade,
  kind          text not null,
  label         text not null,
  price_delta   numeric(10,2) not null default 0,
  position      smallint not null default 0,

  constraint customization_kind_known check (kind in ('remove', 'extra', 'option', 'allergy', 'note'))
);

create index order_item_customizations_item on public.order_item_customizations (order_item_id, position);

------------------------------------------------------------------ history --
create table public.order_status_history (
  id       uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  status   public.food_order_status not null,
  reason   text,
  actor    uuid,
  at       timestamptz not null default now()
);

create index order_status_history_order on public.order_status_history (order_id, at);

-------------------------------------------------------------- transitions --
create or replace function public.enforce_food_order_transition()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('rejected', 'cancelled', 'refunded') then
    raise exception 'Cette commande est déjà % et ne peut plus changer d''état.', old.status;
  end if;

  if not (
       (old.status = 'received'           and new.status in ('confirmed', 'rejected', 'cancelled'))
    or (old.status = 'confirmed'          and new.status in ('preparing', 'cancelled'))
    or (old.status = 'preparing'          and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready'              and new.status in ('out_for_delivery', 'completed', 'cancelled'))
    or (old.status = 'out_for_delivery'   and new.status in ('completed', 'cancelled'))
    or (old.status = 'completed'          and new.status in ('refunded', 'partially_refunded'))
    or (old.status = 'partially_refunded' and new.status = 'refunded')
  ) then
    raise exception 'Transition invalide : % -> %.', old.status, new.status;
  end if;

  if new.status = 'out_for_delivery' and old.fulfillment <> 'delivery' then
    raise exception 'Cette commande n''est pas une livraison.';
  end if;

  return new;
end;
$function$;

create trigger restaurant_orders_transition
  before update of status on public.restaurant_orders
  for each row execute function public.enforce_food_order_transition();

------------------------------------------------------------- permissions --
insert into public.partner_permissions (code, label_fr, group_name, sensitive, position) values
  ('manage_menu',      'Gérer le menu',        'Restaurant', false, 160),
  ('manage_orders',    'Gérer les commandes',  'Restaurant', false, 170),
  ('manage_inventory', 'Gérer les stocks',     'Restaurant', false, 180)
on conflict (code) do nothing;

-- The roles the specification describes: the kitchen sees the queue and the
-- stock, the till sees orders and customers, the delivery desk sees the run.
insert into public.partner_role_permissions (role, permission) values
  ('owner',   'manage_menu'),    ('owner',   'manage_orders'),    ('owner',   'manage_inventory'),
  ('manager', 'manage_menu'),    ('manager', 'manage_orders'),    ('manager', 'manage_inventory'),
  ('kitchen', 'manage_menu'),    ('kitchen', 'manage_orders'),    ('kitchen', 'manage_inventory'),
  ('cashier', 'manage_orders'),  ('cashier', 'view_customers'),
  ('delivery_manager', 'manage_orders')
on conflict do nothing;

------------------------------------------------------------------ policies --
alter table public.restaurant_orders         enable row level security;
alter table public.restaurant_order_items    enable row level security;
alter table public.order_item_customizations enable row level security;
alter table public.order_status_history      enable row level security;

-- Reads only. Every write goes through a SECURITY DEFINER RPC that re-checks
-- the permission, the way the rest of this schema works.
create policy orders_partner_read on public.restaurant_orders
  for select to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = restaurant_orders.listing_id
                    and public.partner_can(l.partner_id, 'manage_orders')));

create policy orders_customer_read on public.restaurant_orders
  for select to authenticated using (user_id = auth.uid());

create policy orders_staff_read on public.restaurant_orders
  for select to authenticated using (public.admin_can('view_bookings'));

create policy order_items_read on public.restaurant_order_items
  for select to authenticated
  using (exists (select 1 from public.restaurant_orders o where o.id = restaurant_order_items.order_id));

create policy customizations_read on public.order_item_customizations
  for select to authenticated
  using (exists (select 1 from public.restaurant_order_items i
                  where i.id = order_item_customizations.order_item_id));

create policy history_read on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.restaurant_orders o where o.id = order_status_history.order_id));

grant select on public.restaurant_orders, public.restaurant_order_items,
                public.order_item_customizations, public.order_status_history to authenticated;
;
