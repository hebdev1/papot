-- Search inside one business only (spec section 66).
create or replace function partner_search(p_partner uuid, q text)
returns table (group_name text, id text, title text, subtitle text, href text)
language sql stable security definer set search_path = public, pg_temp as $$
  with needle as (select '%' || btrim(q) || '%' as pat)
  select * from (
    select 'Annonces', l.id::text, l.name, l.city, '/partenaire/annonces/' || l.id
      from listings l, needle
     where l.partner_id = p_partner and (l.name ilike pat or l.city ilike pat)
    union all
    select 'Réservations', b.reference, b.reference,
           coalesce(b.first_name || ' ' || b.last_name, b.email),
           '/partenaire/reservations/' || b.reference
      from bookings b, needle
     where exists (select 1 from booking_items bi join listings l on l.id = bi.listing_id
                    where bi.booking_id = b.id and l.partner_id = p_partner)
       and (b.reference ilike pat or b.email ilike pat
            or (b.first_name || ' ' || b.last_name) ilike pat)
    union all
    select 'Clients', p.id::text, coalesce(p.full_name, p.email), p.email,
           '/partenaire/clients'
      from profiles p, needle
     where (p.full_name ilike pat or p.email ilike pat)
       and exists (select 1 from bookings b
                     join booking_items bi on bi.booking_id = b.id
                     join listings l on l.id = bi.listing_id
                    where b.user_id = p.id and l.partner_id = p_partner)
  ) hits(group_name, id, title, subtitle, href)
  where partner_can(p_partner, 'view_reservations')
     or partner_can(p_partner, 'manage_listings')
  limit 20;
$$;

/**
 * Customers who have booked with this business (spec section 30).
 *
 * Deliberately narrow: a name, how much they have booked and when. A partner
 * needs enough to recognise a returning guest, not a copy of the customer's
 * profile, so the phone number and address stay out of it.
 */
create or replace function partner_customers(p_partner uuid)
returns table (customer_id uuid, full_name text, email text, bookings bigint,
               total_spend numeric, last_booking date, status text)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.user_id,
         coalesce(max(p.full_name), max(b.first_name || ' ' || b.last_name)),
         max(b.email),
         count(distinct b.id),
         sum(bi.amount),
         max(bi.starts_on),
         coalesce(max(p.status::text), 'guest')
    from bookings b
    join booking_items bi on bi.booking_id = b.id
    join listings l on l.id = bi.listing_id
    left join profiles p on p.id = b.user_id
   where l.partner_id = p_partner
     and partner_can(p_partner, 'view_customers')
   group by b.user_id
   order by 5 desc nulls last;
$$;

/** Per-listing performance (spec sections 41-42). */
create or replace function partner_listing_performance(p_partner uuid)
returns table (listing_id uuid, name text, status text, reservations bigint,
               revenue numeric, rating numeric, reviews integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.id, l.name, l.status::text,
         count(distinct bi.booking_id),
         coalesce(sum(bi.amount), 0),
         l.rating, l.reviews
    from listings l
    left join booking_items bi on bi.listing_id = l.id
   where l.partner_id = p_partner
     and partner_can(p_partner, 'view_analytics')
   group by l.id, l.name, l.status, l.rating, l.reviews
   order by 5 desc;
$$;

/** Demand insights (spec section 43). */
create or replace function partner_insights(p_partner uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not partner_can(p_partner, 'view_analytics') then null else jsonb_build_object(
    'busiest_weekday', (
      select to_char(bi.starts_on, 'Day') from booking_items bi
        join listings l on l.id = bi.listing_id
       where l.partner_id = p_partner and bi.starts_on is not null
       group by to_char(bi.starts_on, 'Day') order by count(*) desc limit 1),
    'top_listing', (
      select l.name from booking_items bi join listings l on l.id = bi.listing_id
       where l.partner_id = p_partner group by l.name order by count(*) desc limit 1),
    'avg_stay_nights', (
      select round(avg(coalesce(bi.ends_on, bi.starts_on) - bi.starts_on), 1)
        from booking_items bi join listings l on l.id = bi.listing_id
       where l.partner_id = p_partner and bi.kind = 'stay' and bi.starts_on is not null),
    'avg_lead_days', (
      select round(avg(bi.starts_on - b.created_at::date), 1)
        from booking_items bi join listings l on l.id = bi.listing_id
        join bookings b on b.id = bi.booking_id
       where l.partner_id = p_partner and bi.starts_on is not null),
    'avg_booking_value', (
      select round(avg(bi.amount), 2) from booking_items bi
        join listings l on l.id = bi.listing_id where l.partner_id = p_partner),
    'avg_party', (
      select round(avg(bi.party), 1) from booking_items bi
        join listings l on l.id = bi.listing_id
       where l.partner_id = p_partner and bi.party is not null),
    'cancel_rate', coalesce((
      select round(100.0 * count(*) filter (where b.status = 'cancelled')
                   / nullif(count(*), 0), 1)
        from bookings b
       where exists (select 1 from booking_items bi join listings l on l.id = bi.listing_id
                      where bi.booking_id = b.id and l.partner_id = p_partner)), 0),
    'repeat_customers', (
      select count(*) from (
        select b.user_id from bookings b
          join booking_items bi on bi.booking_id = b.id
          join listings l on l.id = bi.listing_id
         where l.partner_id = p_partner and b.user_id is not null
         group by b.user_id having count(distinct b.id) > 1) r)
  ) end;
$$;

grant execute on function partner_search(uuid, text) to authenticated;
grant execute on function partner_customers(uuid) to authenticated;
grant execute on function partner_listing_performance(uuid) to authenticated;
grant execute on function partner_insights(uuid) to authenticated;
revoke execute on function partner_search(uuid, text) from anon;
revoke execute on function partner_customers(uuid) from anon;
revoke execute on function partner_listing_performance(uuid) from anon;
revoke execute on function partner_insights(uuid) from anon;;
