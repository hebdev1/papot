-- Phase 3: online food ordering. Types first — Postgres refuses to use a new
-- enum value in the transaction that created it, so the tables and the seed
-- rows that reference these follow in their own migration.

create type public.food_order_status as enum (
  'received',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'rejected',
  'cancelled',
  'refunded',
  'partially_refunded'
);

comment on type public.food_order_status is
  'Order lifecycle. No awaiting_payment: nothing is charged online yet, so no order can sit in it.';

create type public.fulfillment_mode as enum ('dine_in', 'pickup', 'delivery');

create type public.food_payment_status as enum (
  'pending',
  'paid',
  'refunded',
  'partially_refunded',
  'failed'
);

-- The kitchen and the till are roles in their own right; the specification
-- restricts each to a slice of the dashboard.
alter type public.partner_member_role add value if not exists 'kitchen';
alter type public.partner_member_role add value if not exists 'cashier';
alter type public.partner_member_role add value if not exists 'delivery_manager';
;
