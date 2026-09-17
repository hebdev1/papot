-- Phase 8: the money, split the way the specification asks.
--
-- A restaurant now earns from two different things at one address: tables and
-- food. `commission_rules` already resolves by partner, service and type; it
-- gains one more dimension so "8 % on food, nothing on reservations" is a rule
-- and not a special case in code.

create type public.revenue_kind as enum ('reservation', 'food_order', 'delivery', 'tip');

comment on type public.revenue_kind is
  'The buckets money actually arrives in. Per-extra and per-custom-meal rates would need line-level splitting; nothing produces them yet, so they are not values here.';

alter table public.commission_rules
  add column revenue_kind public.revenue_kind;

comment on column public.commission_rules.revenue_kind is
  'Null means the rule applies whatever the money is for. A matching rule always beats a null one at the same scope.';

-- A food order's money belongs in the same ledger as a booking's.
alter table public.payments
  add column order_id uuid references public.restaurant_orders(id) on delete set null,
  add column revenue_kind public.revenue_kind;

alter table public.payments
  add constraint payment_has_one_source check (num_nonnulls(booking_id, order_id) <= 1);

create index payments_order on public.payments (order_id) where order_id is not null;
;
