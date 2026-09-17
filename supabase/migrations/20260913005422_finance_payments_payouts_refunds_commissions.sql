create type payment_status as enum
  ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed', 'chargeback');
create type payment_method as enum ('card', 'mobile_money', 'bank_transfer', 'cash');
create type payout_status as enum ('ready', 'processing', 'paid', 'failed', 'held');
create type refund_status as enum
  ('requested', 'under_review', 'approved', 'processing', 'completed', 'rejected');

create table payments (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  booking_id     uuid references bookings(id) on delete set null,
  booking_ref    text,
  customer_id    uuid references auth.users(id) on delete set null,
  customer_label text,
  partner_id     uuid references partners(id) on delete set null,
  amount         numeric(12,2) not null check (amount >= 0),
  currency       text not null default 'USD',
  commission     numeric(12,2) not null default 0 check (commission >= 0),
  method         payment_method not null,
  processor      text,
  processor_ref  text,
  status         payment_status not null default 'pending',
  failure_reason text,
  risk_score     smallint check (risk_score between 0 and 100),
  created_at     timestamptz not null default now()
);

create index payments_status_idx on payments (status, created_at desc);
create index payments_partner_idx on payments (partner_id, created_at desc);

create table payouts (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique,
  partner_id   uuid not null references partners(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  gross        numeric(12,2) not null default 0,
  commission   numeric(12,2) not null default 0,
  adjustments  numeric(12,2) not null default 0,
  -- Derived, never typed in: a payout that disagrees with its own arithmetic is
  -- a finance incident, so the database computes it.
  net          numeric(12,2) generated always as (gross - commission + adjustments) stored,
  currency     text not null default 'USD',
  status       payout_status not null default 'ready',
  method       payout_method,
  hold_reason  text,
  failure_reason text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (period_end >= period_start)
);

create index payouts_status_idx on payouts (status, created_at desc);

create table refunds (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  booking_id       uuid references bookings(id) on delete set null,
  booking_ref      text,
  payment_id       uuid references payments(id) on delete set null,
  customer_id      uuid references auth.users(id) on delete set null,
  customer_label   text,
  partner_id       uuid references partners(id) on delete set null,
  booking_total    numeric(12,2) not null default 0,
  amount_paid      numeric(12,2) not null default 0,
  cancellation_fee numeric(12,2) not null default 0,
  eligible_amount  numeric(12,2) not null default 0,
  requested_amount numeric(12,2) not null default 0,
  final_amount     numeric(12,2),
  currency         text not null default 'USD',
  status           refund_status not null default 'requested',
  reason           text,
  decision_note    text,
  decided_by       uuid references auth.users(id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  -- A refund can never exceed what the customer actually paid.
  check (final_amount is null or final_amount <= amount_paid)
);

create index refunds_status_idx on refunds (status, created_at desc);

-- Commission rules, most specific wins (spec section 30).
create type commission_scope as enum
  ('global', 'partner_type', 'partner', 'service', 'promotional');

create table commission_rules (
  id           uuid primary key default gen_random_uuid(),
  scope        commission_scope not null,
  partner_type partner_type,
  partner_id   uuid references partners(id) on delete cascade,
  service_kind listing_kind,
  label        text not null,
  percentage   numeric(5,2) check (percentage between 0 and 100),
  fixed_fee    numeric(12,2) check (fixed_fee >= 0),
  min_fee      numeric(12,2) check (min_fee >= 0),
  max_fee      numeric(12,2) check (max_fee >= 0),
  starts_on    date,
  ends_on      date,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Each scope must carry the key it is scoped by, or the rule cannot be applied.
  check (scope <> 'partner_type' or partner_type is not null),
  check (scope <> 'partner'      or partner_id   is not null),
  check (scope <> 'service'      or service_kind is not null),
  check (percentage is not null or fixed_fee is not null),
  check (max_fee is null or min_fee is null or max_fee >= min_fee),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

insert into commission_rules (scope, partner_type, label, percentage, active) values
  ('partner_type', 'hotel',      'Hôtels 15 %',        15.0, true),
  ('partner_type', 'guesthouse', 'Maisons d''hôtes 12 %', 12.0, true),
  ('partner_type', 'car',        'Location de voiture 10 %', 10.0, true),
  ('partner_type', 'restaurant', 'Restaurants 8 %',     8.0, true);
insert into commission_rules (scope, label, percentage, active)
  values ('global', 'Commission par défaut 12 %', 12.0, true);

create type invoice_status as enum ('draft', 'issued', 'paid', 'void', 'overdue');

create table invoices (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique,
  partner_id  uuid references partners(id) on delete set null,
  booking_id  uuid references bookings(id) on delete set null,
  payout_id   uuid references payouts(id) on delete set null,
  amount      numeric(12,2) not null,
  currency    text not null default 'USD',
  status      invoice_status not null default 'draft',
  issued_on   date,
  due_on      date,
  created_at  timestamptz not null default now()
);

alter table payments enable row level security;
alter table payouts enable row level security;
alter table refunds enable row level security;
alter table commission_rules enable row level security;
alter table invoices enable row level security;

create policy payments_staff_read on payments for select to authenticated
  using (admin_can('view_payments'));
create policy payments_customer_read on payments for select to authenticated
  using (customer_id = auth.uid());

create policy payouts_staff_read on payouts for select to authenticated
  using (admin_can('view_payments'));
create policy payouts_staff_write on payouts for update to authenticated
  using (admin_can('manage_payouts')) with check (admin_can('manage_payouts'));

create policy refunds_staff_read on refunds for select to authenticated
  using (admin_can('view_payments'));
create policy refunds_customer_read on refunds for select to authenticated
  using (customer_id = auth.uid());
create policy refunds_staff_write on refunds for update to authenticated
  using (admin_can('issue_refunds')) with check (admin_can('issue_refunds'));

create policy commissions_staff_read on commission_rules for select to authenticated
  using (admin_can('view_payments'));
create policy commissions_staff_write on commission_rules for all to authenticated
  using (admin_can('manage_commissions')) with check (admin_can('manage_commissions'));

create policy invoices_staff_read on invoices for select to authenticated
  using (admin_can('view_payments'));

-- The rule that actually applies to a sale, most specific first. Used by the
-- commission screen and by any future booking pricing path, so both agree.
create or replace function effective_commission(p_partner_id uuid, p_kind listing_kind)
returns numeric language sql stable set search_path = public, pg_temp as $$
  select r.percentage
  from commission_rules r
  left join partners p on p.id = p_partner_id
  where r.active
    and (r.starts_on is null or r.starts_on <= current_date)
    and (r.ends_on   is null or r.ends_on   >= current_date)
    and (
      (r.scope = 'partner'      and r.partner_id = p_partner_id) or
      (r.scope = 'service'      and r.service_kind = p_kind) or
      (r.scope = 'partner_type' and r.partner_type = p.type) or
      (r.scope = 'global')
    )
  order by case r.scope
    when 'partner' then 1 when 'service' then 2
    when 'partner_type' then 3 else 4 end
  limit 1;
$$;;
