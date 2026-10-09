-- What a passenger gets back, and when.
--
-- A policy is a ladder of tiers: "48 hours ahead, 90% back; 24 hours, 50%;
-- under 2 hours, nothing". A quote walks down it and takes the first rung it
-- is still above.
--
-- Tiers belong to a company, and a single route may override them. The
-- override replaces the company's ladder **as a whole set** rather than
-- merging rung by rung, because a merge would produce a policy neither the
-- route nor the company ever wrote, and nobody could predict it from either
-- screen.

create table public.bus_cancellation_rules (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners (id) on delete cascade,
  listing_id     uuid references public.listings (id) on delete cascade,
  hours_before   integer not null check (hours_before >= 0 and hours_before <= 8760),
  refund_percent numeric(5,2) not null check (refund_percent >= 0 and refund_percent <= 100),
  fee_flat       numeric(10,2) not null default 0 check (fee_flat >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Two partial indexes rather than one unique constraint: `listing_id` is
-- nullable, and in a plain unique constraint two null routes count as
-- different, so a company could file the same global rung twice.
create unique index bus_cancellation_rules_company_tier
  on public.bus_cancellation_rules (partner_id, hours_before)
  where listing_id is null;

create unique index bus_cancellation_rules_route_tier
  on public.bus_cancellation_rules (listing_id, hours_before)
  where listing_id is not null;

create or replace function public.bus_rule_route_belongs_to_partner()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.listing_id is not null
     and not exists (select 1 from public.listings l
                      where l.id = new.listing_id
                        and l.partner_id = new.partner_id
                        and l.kind = 'bus') then
    raise exception 'Cette règle vise un itinéraire qui n''appartient pas à cette compagnie.'
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger bus_cancellation_rules_own_route
  before insert or update on public.bus_cancellation_rules
  for each row execute function public.bus_rule_route_belongs_to_partner();

alter table public.bus_cancellation_rules enable row level security;

create policy bus_cancellation_rules_partner_read on public.bus_cancellation_rules
  for select using (
    partner_id in (select public.my_partner_ids())
    or public.admin_can('view_listings'));

create policy bus_cancellation_rules_partner_write on public.bus_cancellation_rules
  for all using (public.partner_can(partner_id, 'manage_pricing'))
  with check (public.partner_can(partner_id, 'manage_pricing'));

-- The platform's floor, as two settings the admin screen can already render.
--
-- It is deliberately NOT a per-rule check. A company that simply declines to
-- file a generous rung would evade that, since a quote falls to the next rung
-- down; so the floor is applied when the refund is computed, where it cannot
-- be stepped around.
insert into public.platform_settings (key, group_name, label_fr, value, value_type, help_fr, position)
values
  ('bus_refund_protected_hours', 'Réservation',
   'Autocar — délai protégé (heures)', '48'::jsonb, 'number',
   'Une annulation faite plus tôt que ce délai avant le départ ne peut pas être remboursée en dessous du minimum ci-dessous, quelle que soit la politique de la compagnie.',
   310),
  ('bus_refund_min_percent', 'Réservation',
   'Autocar — remboursement minimum (%)', '50'::jsonb, 'percent',
   'Plancher que la plateforme applique aux annulations faites avant le délai protégé.',
   311)
on conflict (key) do nothing;

-- The effective ladder for one route: the route's own, else the company's,
-- else the platform's. Read by the trip page before a sale and by the quote
-- after one, so a passenger is never shown terms other than the ones that will
-- be applied.
create or replace function public.bus_refund_policy(p_listing uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_partner uuid;
  v_tiers   jsonb;
  v_source  text;
begin
  select partner_id into v_partner
    from public.listings where id = p_listing and kind = 'bus';
  if v_partner is null then
    return null;
  end if;

  select jsonb_agg(jsonb_build_object(
           'hours_before', hours_before,
           'refund_percent', refund_percent,
           'fee_flat', fee_flat) order by hours_before desc)
    into v_tiers
    from public.bus_cancellation_rules
   where active and listing_id = p_listing;
  v_source := 'route';

  if v_tiers is null then
    select jsonb_agg(jsonb_build_object(
             'hours_before', hours_before,
             'refund_percent', refund_percent,
             'fee_flat', fee_flat) order by hours_before desc)
      into v_tiers
      from public.bus_cancellation_rules
     where active and partner_id = v_partner and listing_id is null;
    v_source := 'company';
  end if;

  -- A company that has never opened the policy screen still has a policy.
  -- The alternative — no rules meaning no refund — would be the harshest
  -- possible terms arrived at by silence.
  if v_tiers is null then
    v_tiers := '[{"hours_before": 48, "refund_percent": 90, "fee_flat": 0},
                 {"hours_before": 24, "refund_percent": 50, "fee_flat": 0},
                 {"hours_before": 2,  "refund_percent": 0,  "fee_flat": 0}]'::jsonb;
    v_source := 'platform';
  end if;

  return jsonb_build_object(
    'listing_id',      p_listing,
    'source',          v_source,
    'tiers',           v_tiers,
    'protected_hours', coalesce((select value::text::numeric from public.platform_settings
                                  where key = 'bus_refund_protected_hours'), 48),
    'min_percent',     coalesce((select value::text::numeric from public.platform_settings
                                  where key = 'bus_refund_min_percent'), 50));
end;
$fn$;

grant execute on function public.bus_refund_policy(uuid) to anon, authenticated;;