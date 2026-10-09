-- The home carousel counts hotels, restaurants and cars per city. A city a
-- coach actually serves should say so too.
--
-- `buses` goes on the END of the column list, not beside `cars` where it
-- belongs visually: `create or replace view` can only add columns at the end,
-- and dropping the view to reorder would take its grants and anything built
-- on it with it. A tidy column order is not worth that.
--
-- It counts routes that ARRIVE in the city, matching how a traveller reads the
-- carousel — "what can I do in Jacmel" — and how `listings.city` is already
-- set for a bus route, which `attach_items_to_trips` relies on.
create or replace view public.destinations_public
  with (security_invoker = true)
as
 SELECT id,
    city,
    country,
    region,
    tagline,
    blurb,
    img,
    tier,
    "position",
    created_at,
    (( SELECT count(*) AS count
           FROM listings l
          WHERE ((place_key(l.city) = place_key(d.city)) AND (l.kind = 'stay'::listing_kind) AND l.published)))::integer AS hotels,
    (( SELECT count(*) AS count
           FROM listings l
          WHERE ((place_key(l.city) = place_key(d.city)) AND (l.kind = 'restaurant'::listing_kind) AND l.published)))::integer AS restaurants,
    (( SELECT count(*) AS count
           FROM listings l
          WHERE ((place_key(l.city) = place_key(d.city)) AND (l.kind = 'car'::listing_kind) AND l.published)))::integer AS cars,
    ( SELECT min(l.price) AS min
           FROM listings l
          WHERE ((place_key(l.city) = place_key(d.city)) AND (l.kind = 'stay'::listing_kind) AND l.published)) AS from_usd,
    (( SELECT count(*) AS count
           FROM listings l
          WHERE ((place_key(l.city) = place_key(d.city)) AND (l.kind = 'bus'::listing_kind) AND l.published)))::integer AS buses
   FROM destinations d;;