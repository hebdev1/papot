/**
 * A destination stops claiming what it has and starts counting it.
 *
 * `hotels`, `restaurants` and `from_usd` were ordinary columns somebody typed
 * into the admin screen. Nothing ever compared them to the catalogue, and they
 * had drifted into fiction: the home page advertised 41 hébergements at
 * Cap-Haïtien where there were none, 34 at Jacmel where there was one, and a
 * starting price of 55 $ where the cheapest room was 65 $. A traveller who
 * clicked through found an empty list.
 *
 * This is the same rule the packages feature already follows — a bound line
 * never copies a price, it reads the tariff live — applied to geography.
 *
 * The match is the other half of the problem. `listings.city` is free text that
 * a partner types into a box, so the only hôtel actually in Cap-Haïtien carries
 * the city "cap haitien" and matched nothing: not the counter, not the search.
 * `place_key` folds case, accents and punctuation away so the two meet.
 * `translate` rather than the unaccent extension, because it is immutable and
 * needs nothing installed.
 */
create or replace function public.place_key(t text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select regexp_replace(
           lower(translate(coalesce(t, ''),
                 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
                 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
           '[^a-z0-9]+', '', 'g')
$fn$;

comment on function public.place_key(text) is
  'A city name folded to a comparison key: lower case, no accents, no punctuation.';

/**
 * What the public site reads. `security_invoker` means the counts are taken
 * with the visitor's own rights, so an unpublished annonce is invisible here
 * for the same reason it is invisible everywhere else — there is no second
 * definition of "published" to keep in step.
 */
create or replace view public.destinations_public
with (security_invoker = true)
as
select d.id,
       d.city,
       d.country,
       d.region,
       d.tagline,
       d.blurb,
       d.img,
       d.tier,
       d.position,
       d.created_at,
       (select count(*)
          from public.listings l
         where public.place_key(l.city) = public.place_key(d.city)
           and l.kind = 'stay' and l.published)::integer as hotels,
       (select count(*)
          from public.listings l
         where public.place_key(l.city) = public.place_key(d.city)
           and l.kind = 'restaurant' and l.published)::integer as restaurants,
       (select count(*)
          from public.listings l
         where public.place_key(l.city) = public.place_key(d.city)
           and l.kind = 'car' and l.published)::integer as cars,
       (select min(l.price)
          from public.listings l
         where public.place_key(l.city) = public.place_key(d.city)
           and l.kind = 'stay' and l.published) as from_usd
  from public.destinations d;

comment on view public.destinations_public is
  'Destinations with their inventory counted live from published listings.';

grant select on public.destinations_public to anon, authenticated;

-- The stored figures go. Leaving them would leave the lie one query away.
alter table public.destinations
  drop column hotels,
  drop column restaurants,
  drop column from_usd;;
