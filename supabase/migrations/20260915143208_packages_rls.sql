-- Every date question in PAPOT is asked in Port-au-Prince. The restaurant work
-- inlined the zone at each call site; a promotional window is compared in four
-- more places, so it gets a name.
create or replace function public.haiti_today()
returns date
language sql
stable
set search_path to 'public', 'pg_temp'
as $$ select (now() at time zone 'America/Port-au-Prince')::date $$;

comment on function public.haiti_today() is
  'Today in America/Port-au-Prince. A guest in Montreal after 19:00 must not see tomorrow.';

alter table public.partner_packages enable row level security;
alter table public.package_lines enable row level security;

create policy packages_partner_all on public.partner_packages
  for all
  using (partner_can(partner_id, 'manage_promotions') or admin_can('view_listings'))
  with check (partner_can(partner_id, 'manage_promotions'));

-- Stricter than menu_items or delivery_zones, which are readable by anyone: a
-- package is an offer with a window and a sales limit, so a visitor sees it
-- only while it actually stands.
create policy packages_public_read on public.partner_packages
  for select
  using (
    active
    and (starts_on is null or starts_on <= public.haiti_today())
    and (ends_on is null or ends_on >= public.haiti_today())
    and exists (select 1 from public.listings l where l.id = listing_id and l.published)
  );

create policy package_lines_partner_all on public.package_lines
  for all
  using (exists (
    select 1 from public.partner_packages p
    where p.id = package_lines.package_id
      and (partner_can(p.partner_id, 'manage_promotions') or admin_can('view_listings'))))
  with check (exists (
    select 1 from public.partner_packages p
    where p.id = package_lines.package_id
      and partner_can(p.partner_id, 'manage_promotions')));

create policy package_lines_public_read on public.package_lines
  for select
  using (exists (
    select 1
    from public.partner_packages p
    join public.listings l on l.id = p.listing_id
    where p.id = package_lines.package_id
      and p.active
      and l.published
      and (p.starts_on is null or p.starts_on <= public.haiti_today())
      and (p.ends_on is null or p.ends_on >= public.haiti_today())));

-- `used_count` is the sales counter behind "the first 20". If a partner could
-- write it, they could reset it and the offer would never end. Column-level
-- privileges say so in the grant system rather than in code: the booking path
-- runs SECURITY DEFINER as the owner, which these grants do not constrain.
revoke update on public.partner_packages from authenticated, anon;
grant update (
  listing_id, name, description, image_url, price, basis, min_units,
  starts_on, ends_on, usage_limit, active, position
) on public.partner_packages to authenticated;;
