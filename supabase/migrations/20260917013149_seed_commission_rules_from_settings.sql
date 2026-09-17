-- The rates were declared but unreachable. platform_settings holds them for the
-- admin screen to display; effective_commission reads commission_rules, which
-- was empty, so every commission computed to zero — on every booking, in every
-- finance screen.
--
-- The values are read from platform_settings rather than written out here, so
-- this is provably a transposition and not a second opinion about what PAPOT
-- charges. A rate already edited in the console seeds with the edited value.
--
-- Hotels and guesthouses both sell `stay` listings, so the distinction only
-- exists on the partner's type — which is exactly what scope 'partner_type' is
-- for. The default is a 'global' rule, the last one effective_commission falls
-- back to.
insert into public.commission_rules (scope, partner_type, label, percentage, active)
select 'partner_type', t.pt, t.label, (ps.value)::numeric, true
  from (values
    ('hotel'::public.partner_type,      'commission_hotel',      'Commission hôtels'),
    ('guesthouse'::public.partner_type, 'commission_guesthouse', 'Commission maisons d''hôtes'),
    ('car'::public.partner_type,        'commission_car',        'Commission location de voitures'),
    ('restaurant'::public.partner_type, 'commission_restaurant', 'Commission restaurants')
  ) as t(pt, setting_key, label)
  join public.platform_settings ps on ps.key = t.setting_key
 where not exists (
   select 1 from public.commission_rules r
    where r.scope = 'partner_type' and r.partner_type = t.pt);

insert into public.commission_rules (scope, label, percentage, active)
select 'global', 'Commission par défaut', (ps.value)::numeric, true
  from public.platform_settings ps
 where ps.key = 'commission_default'
   and not exists (select 1 from public.commission_rules r where r.scope = 'global');;
