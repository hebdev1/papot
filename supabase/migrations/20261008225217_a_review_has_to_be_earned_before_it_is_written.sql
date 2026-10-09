-- Letting a traveller actually leave a review.
--
-- `reviews` has existed since the beginning with moderation, partner replies
-- and admin statistics — and **no insert policy at all**, so nothing could
-- ever write one. The table was a reading room with no door.
--
-- The door is this function rather than a policy, because three things have to
-- be true at once and a policy can only express the first:
--
--   1. the reviewer holds the booking (signed-in owner, or reference AND
--      email — a reference alone is not a password, as `get_booking` records);
--   2. the annonce was actually in that booking;
--   3. the journey has already happened.
--
-- Without (3) a competitor could buy the cheapest seat on a route and review
-- it the same minute. Reviews land as `pending`, which is what the existing
-- moderation screen expects, and the public read policy already shows only
-- `published`.

alter table public.reviews
  add column punctuality smallint check (punctuality between 1 and 5),
  add column comfort     smallint check (comfort     between 1 and 5),
  add column cleanliness smallint check (cleanliness between 1 and 5),
  add column service     smallint check (service     between 1 and 5);

comment on column public.reviews.punctuality is
  'Sub-rating, nullable: not every metier has one, and an unanswered question must not read as a zero.';

-- One review per annonce per booking. Travelling twice earns two reviews;
-- clicking twice does not.
create unique index reviews_one_per_booking_listing
  on public.reviews (booking_id, listing_id)
  where booking_id is not null;

create or replace function public.submit_review(
  p_reference    text,
  p_listing      uuid,
  p_rating       smallint,
  p_email        text     default null,
  p_title        text     default null,
  p_body         text     default null,
  p_punctuality  smallint default null,
  p_comfort      smallint default null,
  p_cleanliness  smallint default null,
  p_service      smallint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  b        public.bookings;
  it       public.booking_items;
  l        public.listings;
  v_ended  timestamptz;
  v_id     uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Donnez une note de 1 à 5.' using errcode = '23514';
  end if;

  select * into b from public.bookings where reference = btrim(coalesce(p_reference, ''));
  if b.id is null then
    raise exception 'Réservation introuvable.' using errcode = 'P0002';
  end if;

  -- The same second factor `get_booking` requires: a short readable reference
  -- is not a credential on its own.
  if not (b.user_id is not null and b.user_id = auth.uid())
     and lower(coalesce(b.email, '')) <> lower(btrim(coalesce(p_email, ''))) then
    raise exception 'Référence et courriel ne correspondent pas.' using errcode = '42501';
  end if;

  if b.status = 'cancelled' then
    raise exception 'Cette réservation a été annulée.' using errcode = '23514';
  end if;

  select * into it from public.booking_items
   where booking_id = b.id and listing_id = p_listing
   order by position
   limit 1;
  if it.id is null then
    raise exception 'Cette annonce ne fait pas partie de cette réservation.' using errcode = '23514';
  end if;

  select * into l from public.listings where id = p_listing;

  -- When did it end? A coach ends when it arrives; everything else on its last
  -- day. A bus line reads the departure off the tickets, because the departure
  -- is not a column on the booking line.
  select max(public.bus_departure_instant(d.departs_on, d.departs_at, d.delayed_to)
             + make_interval(mins => d.duration_minutes))
    into v_ended
    from public.bus_tickets t
    join public.bus_departures d on d.id = t.departure_id
   where t.booking_item_id = it.id
     and t.status <> 'cancelled';

  if v_ended is null then
    v_ended := (coalesce(it.ends_on, it.starts_on) + time '23:59')
                 at time zone 'America/Port-au-Prince';
  end if;

  if v_ended is null or v_ended > now() then
    raise exception 'Vous pourrez laisser un avis une fois le voyage terminé.'
      using errcode = '23514';
  end if;

  insert into public.reviews (
    listing_id, partner_id, booking_id, customer_id, customer_label,
    rating, title, body, punctuality, comfort, cleanliness, service)
  values (
    p_listing, l.partner_id, b.id, b.user_id,
    nullif(btrim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')), ''),
    p_rating,
    nullif(btrim(coalesce(p_title, '')), ''),
    nullif(btrim(coalesce(p_body, '')), ''),
    p_punctuality, p_comfort, p_cleanliness, p_service)
  returning id into v_id;

  return jsonb_build_object('review_id', v_id, 'status', 'pending');
exception
  when unique_violation then
    raise exception 'Vous avez déjà laissé un avis pour cette annonce.' using errcode = '23505';
end;
$fn$;

grant execute on function public.submit_review(text, uuid, smallint, text, text, text, smallint, smallint, smallint, smallint) to anon, authenticated;

-- What a shopper sees on a route: the average and how many, plus the
-- sub-scores where enough people answered. Published reviews only.
create or replace function public.bus_route_reviews(p_listing uuid, p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_out jsonb;
begin
  select jsonb_build_object(
           'count',       count(*),
           'rating',      round(avg(rating)::numeric, 2),
           'punctuality', round(avg(punctuality)::numeric, 2),
           'comfort',     round(avg(comfort)::numeric, 2),
           'cleanliness', round(avg(cleanliness)::numeric, 2),
           'service',     round(avg(service)::numeric, 2))
    into v_out
    from public.reviews
   where listing_id = p_listing and status = 'published';

  return coalesce(v_out, '{}'::jsonb) || jsonb_build_object(
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rating', r.rating, 'title', r.title, 'body', r.body,
               'author', r.customer_label, 'on', r.created_at,
               'punctuality', r.punctuality, 'comfort', r.comfort,
               'cleanliness', r.cleanliness, 'service', r.service,
               'reply', r.partner_reply)
             order by r.created_at desc)
        from (select * from public.reviews
               where listing_id = p_listing and status = 'published'
               order by created_at desc
               limit greatest(p_limit, 0)) r), '[]'::jsonb));
end;
$fn$;

grant execute on function public.bus_route_reviews(uuid, int) to anon, authenticated;;