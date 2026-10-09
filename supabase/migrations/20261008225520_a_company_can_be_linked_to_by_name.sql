-- A company needs an address of its own.
--
-- `/autocar/transport-chic` is what gets shared, printed on a ticket office
-- window and indexed; `/autocar/9f3c1a2e-…` is neither memorable nor
-- trustworthy-looking. So partners get a slug.
--
-- It is NOT the primary key and nothing joins on it: it is a label that can be
-- corrected when a company renames itself, while every foreign key keeps
-- pointing at the uuid.

create or replace function public.slugify(t text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select btrim(regexp_replace(
           lower(translate(coalesce(t, ''),
                 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
                 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
           '[^a-z0-9]+', '-', 'g'), '-')
$fn$;

alter table public.partners add column slug text;

-- Partial, so the column can stay nullable while remaining unique where set.
create unique index partners_slug_key on public.partners (slug) where slug is not null;

-- Backfill, with the collision suffix decided by age so an existing company
-- keeps the plain slug and a later namesake gets the number.
with ranked as (
  select id,
         coalesce(nullif(public.slugify(business_name), ''), 'compagnie') as base,
         row_number() over (
           partition by coalesce(nullif(public.slugify(business_name), ''), 'compagnie')
           order by created_at, id) as rn
    from public.partners
)
update public.partners p
   set slug = r.base || case when r.rn = 1 then '' else '-' || r.rn::text end
  from ranked r
 where r.id = p.id and p.slug is null;

create or replace function public.partner_gets_a_slug()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_base text;
  v_try  text;
  n      int := 1;
begin
  if nullif(btrim(coalesce(new.slug, '')), '') is not null then
    return new;
  end if;
  v_base := coalesce(nullif(public.slugify(new.business_name), ''), 'compagnie');
  v_try  := v_base;
  while exists (select 1 from public.partners where slug = v_try and id <> new.id) loop
    n := n + 1;
    v_try := v_base || '-' || n::text;
  end loop;
  new.slug := v_try;
  return new;
end;
$fn$;

revoke execute on function public.partner_gets_a_slug() from public;
revoke execute on function public.partner_gets_a_slug() from anon;
revoke execute on function public.partner_gets_a_slug() from authenticated;

create trigger partners_slug
  before insert on public.partners
  for each row execute function public.partner_gets_a_slug();

-- The company page.
--
-- It answers for an ACTIVE bus company with at least one published route, and
-- returns null otherwise — a suspended company's page must stop existing, not
-- render emptily.
--
-- The fleet is given as a count, never as the vehicles. A plate and a fleet
-- number are operational details a competitor would enjoy and a passenger has
-- no use for; the same reason `bus_search` never returns them.
create or replace function public.bus_company_public(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  pr      public.partners;
  v_out   jsonb;
begin
  select * into pr
    from public.partners
   where slug = btrim(coalesce(p_slug, ''))
     and type = 'bus'
     and status = 'active';
  if pr.id is null then
    return null;
  end if;

  if not exists (select 1 from public.listings
                  where partner_id = pr.id and kind = 'bus' and published) then
    return null;
  end if;

  select jsonb_build_object(
    'slug',          pr.slug,
    'name',          pr.business_name,
    'city',          pr.city,
    'country',       pr.country,
    'rating',        pr.rating,
    'joined_at',     pr.joined_at,
    'coaches',       (select count(*) from public.bus_coaches c
                       where c.partner_id = pr.id and c.status = 'active'),
    'terminals',     (select count(*) from public.bus_terminals t
                       where t.partner_id = pr.id and t.active),
    'reviews',       (select jsonb_build_object(
                               'count',  count(*),
                               'rating', round(avg(r.rating)::numeric, 2))
                        from public.reviews r
                        where r.partner_id = pr.id and r.status = 'published'),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'listing_id', l.id,
               'name',       l.name,
               'price',      l.price,
               'from',       (select t.city from public.bus_route_stops s
                                join public.bus_terminals t on t.id = s.terminal_id
                               where s.listing_id = l.id
                               order by s.position limit 1),
               'to',         (select t.city from public.bus_route_stops s
                                join public.bus_terminals t on t.id = s.terminal_id
                               where s.listing_id = l.id
                               order by s.position desc limit 1),
               'next', (select jsonb_build_object(
                                 'departure_id', d.id,
                                 'departs_on',   d.departs_on,
                                 'departs_at',   d.departs_at,
                                 'duration_minutes', d.duration_minutes)
                          from public.bus_departures d
                         where d.listing_id = l.id
                           and d.status in ('scheduled', 'boarding', 'delayed')
                           and public.bus_departure_instant(d.departs_on, d.departs_at, d.delayed_to) > now()
                         order by d.departs_on, d.departs_at
                         limit 1))
             order by l.name)
        from public.listings l
       where l.partner_id = pr.id and l.kind = 'bus' and l.published), '[]'::jsonb))
    into v_out;

  return v_out;
end;
$fn$;

grant execute on function public.bus_company_public(text) to anon, authenticated;

-- Every published bus company, for the directory and the sitemap.
create or replace function public.bus_companies_public()
returns table (slug text, name text, city text, rating numeric, routes integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select p.slug, p.business_name, p.city, p.rating,
         count(l.id)::integer
    from public.partners p
    join public.listings l
      on l.partner_id = p.id and l.kind = 'bus' and l.published
   where p.type = 'bus' and p.status = 'active' and p.slug is not null
   group by p.slug, p.business_name, p.city, p.rating
   order by p.business_name
$fn$;

grant execute on function public.bus_companies_public() to anon, authenticated;;