-- A gateway billed per call is live the moment it deploys. The switch is a
-- platform setting rather than a build flag, exactly like demo_payments: staff
-- turn it off from /admin/parametres without a deploy, and the browser cannot
-- reach past it because the Edge Function checks the same row.
insert into public.platform_settings
  (key, group_name, label_fr, value, value_type, help_fr, position)
values (
  'ai_enabled',
  'Intelligence artificielle',
  'AI Papot',
  'false'::jsonb,
  'boolean',
  'Ouvre la planification conversationnelle. Éteint, la route /planifier et l''entrée d''accueil disparaissent, et la passerelle refuse toute requête. Chaque conversation a un coût : à n''allumer que lorsqu''une clé de fournisseur est en place.',
  300)
on conflict (key) do nothing;

create or replace function public.ai_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce((select (value)::boolean from public.platform_settings
                   where key = 'ai_enabled'), false);
$fn$;

comment on function public.ai_enabled() is
  'Whether AI Papot is open. Exposes the single boolean rather than opening platform_settings, which is staff-only.';

grant execute on function public.ai_enabled() to anon, authenticated;;
