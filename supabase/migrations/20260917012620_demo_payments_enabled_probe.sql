-- The checkout page has to know whether to show the demo panel, but
-- platform_settings is staff-only and should stay that way. This exposes the
-- single boolean rather than opening the table: a visitor learns that demo
-- cards are on, which the panel is about to tell them anyway, and nothing else.
create or replace function public.demo_payments_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce((select (value)::boolean from public.platform_settings
                   where key = 'demo_payments'), false);
$fn$;

grant execute on function public.demo_payments_enabled() to anon, authenticated;;
