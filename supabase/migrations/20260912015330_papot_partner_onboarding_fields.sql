alter table public.partner_applications
  add column user_id       uuid references auth.users(id) on delete set null,
  add column business_name text,
  add column city          text,
  add column amenities     text[]  not null default '{}',
  add column inventory     jsonb   not null default '[]'::jsonb,  -- rooms or vehicles
  add column hours         jsonb   not null default '{}'::jsonb,
  add column payout        jsonb   not null default '{}'::jsonb;  -- non-sensitive only

comment on column public.partner_applications.payout is
  'Non-sensitive payout metadata only (bank name, holder, country, currency). '
  'Account, routing and card numbers are never stored here — a payment '
  'processor token belongs in their place.';

create index partner_applications_user_idx on public.partner_applications (user_id);;
