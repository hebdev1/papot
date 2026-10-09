-- Making a promo code actually work.
--
-- Both discount tables could already CREATE codes and neither could redeem
-- one: `promotions` (admin, /admin/marketing) and `partner_discounts`
-- (the company's own, /partenaire/tarifs). A code a customer typed went
-- nowhere.
--
-- **Who absorbs the discount follows who offered it**, which is the founder's
-- decision and the only rule the two tables can both express honestly:
--
--   * a company's own code         -> the company. Its `payments.amount`
--                                     drops, so `sum(payments.amount)` still
--                                     equals `bookings.total`.
--   * a PAPOT campaign scoped to
--     named partners               -> those partners, the same way.
--   * an open PAPOT campaign       -> PAPOT. The company is paid in full and
--                                     the discount comes off the commission,
--                                     floored at zero.
--
-- That last case is the reason `payments.discount` and `discount_borne_by`
-- exist rather than just a smaller amount: when the platform funds a code,
-- gross legitimately exceeds what the customer paid, and a report that cannot
-- tell the two apart would read as a hole in the books.

alter table public.bookings
  add column promotion_id        uuid references public.promotions (id) on delete set null,
  add column partner_discount_id uuid references public.partner_discounts (id) on delete set null,
  add column discount_code       text,
  add column discount            numeric(10,2) not null default 0 check (discount >= 0);

-- Per line, so the allocation that decided each partner's share is kept
-- rather than re-derived later from a total and a guess.
alter table public.booking_items
  add column discount          numeric(10,2) not null default 0 check (discount >= 0),
  add column discount_borne_by text check (discount_borne_by in ('partner', 'platform'));

alter table public.payments
  add column discount          numeric(10,2) not null default 0 check (discount >= 0),
  add column discount_borne_by text check (discount_borne_by in ('partner', 'platform'));

create table public.promotion_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete cascade,
  promotion_id        uuid references public.promotions (id) on delete set null,
  partner_discount_id uuid references public.partner_discounts (id) on delete set null,
  code                text not null,
  amount              numeric(10,2) not null check (amount >= 0),
  borne_by            text not null check (borne_by in ('partner', 'platform')),
  customer_id         uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  -- One code per booking: the redemption row IS the record that it was used,
  -- and `used_count` is incremented against it exactly once.
  constraint promotion_redemptions_one_per_booking unique (booking_id),
  -- It came from one table or the other, never both and never neither.
  constraint promotion_redemptions_one_source
    check (num_nonnulls(promotion_id, partner_discount_id) = 1)
);

create index promotion_redemptions_promotion_idx
  on public.promotion_redemptions (promotion_id) where promotion_id is not null;
create index promotion_redemptions_partner_discount_idx
  on public.promotion_redemptions (partner_discount_id) where partner_discount_id is not null;

alter table public.promotion_redemptions enable row level security;

create policy promotion_redemptions_read on public.promotion_redemptions
  for select using (
    (customer_id is not null and customer_id = auth.uid())
    or exists (select 1 from public.partner_discounts d
                where d.id = promotion_redemptions.partner_discount_id
                  and d.partner_id in (select public.my_partner_ids()))
    or public.admin_can('view_bookings'));;