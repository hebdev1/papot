-- Everything a partner's home screen must answer (spec sections 6-8, 95), in
-- one round trip. Every count is scoped to the caller's own business by
-- my_partner_ids(), so passing someone else's id returns nothing.
create or replace function partner_overview(p_partner uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb; since_30 timestamptz := now() - interval '30 days';
begin
  if not partner_can(p_partner, 'view_reservations')
     and not partner_can(p_partner, 'manage_listings') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'revenue_month', jsonb_build_object(
      'current',  coalesce((select sum(bi.amount) from booking_items bi
                              join listings l on l.id = bi.listing_id
                              join bookings b on b.id = bi.booking_id
                             where l.partner_id = p_partner and b.status <> 'cancelled'
                               and b.created_at >= since_30), 0),
      'previous', coalesce((select sum(bi.amount) from booking_items bi
                              join listings l on l.id = bi.listing_id
                              join bookings b on b.id = bi.booking_id
                             where l.partner_id = p_partner and b.status <> 'cancelled'
                               and b.created_at >= since_30 - interval '30 days'
                               and b.created_at < since_30), 0)),
    'reservations_today', (select count(distinct bi.booking_id) from booking_items bi
                             join listings l on l.id = bi.listing_id
                            where l.partner_id = p_partner and bi.starts_on = current_date),
    'reservations_upcoming', (select count(distinct bi.booking_id) from booking_items bi
                                join listings l on l.id = bi.listing_id
                                join bookings b on b.id = bi.booking_id
                               where l.partner_id = p_partner and bi.starts_on > current_date
                                 and b.status <> 'cancelled'),
    'pending_payout', coalesce((select sum(net) from payouts
                                 where partner_id = p_partner
                                   and status in ('ready','processing','held')), 0),
    'next_payout', (select jsonb_build_object('amount', net, 'period_end', period_end,
                                              'status', status)
                      from payouts where partner_id = p_partner
                       and status in ('ready','processing')
                     order by period_end limit 1),
    'rating', (select rating from partners where id = p_partner),
    'reviews_count', (select count(*) from reviews
                       where partner_id = p_partner and status = 'published'),
    'listings', jsonb_build_object(
      'total',     (select count(*) from listings where partner_id = p_partner),
      'published', (select count(*) from listings where partner_id = p_partner and status = 'published'),
      'draft',     (select count(*) from listings where partner_id = p_partner and status = 'draft'),
      'pending',   (select count(*) from listings where partner_id = p_partner and status = 'pending_review'),
      'paused',    (select count(*) from listings where partner_id = p_partner and status in ('paused','suspended')),
      'needs_changes', (select count(*) from listings where partner_id = p_partner and status = 'rejected')),
    -- Occupancy across the next 30 days: booked days over sellable days.
    'occupancy', coalesce((
       select round(100.0 * count(*) filter (where a.status = 'booked')
                    / nullif(count(*) filter (where a.status <> 'closed'), 0), 0)
         from listing_availability a
         join listings l on l.id = a.listing_id
        where l.partner_id = p_partner
          and a.day between current_date and current_date + 30), 0),
    'action_required', jsonb_build_object(
      'pending_confirmation', (select count(*) from bookings b
                                 where b.status = 'pending' and exists (
                                   select 1 from booking_items bi join listings l on l.id = bi.listing_id
                                    where bi.booking_id = b.id and l.partner_id = p_partner)),
      'listings_need_changes', (select count(*) from listings
                                 where partner_id = p_partner and status = 'rejected'),
      'unread_messages', (select count(*) from conversations
                           where partner_id = p_partner),
      'unanswered_reviews', (select count(*) from reviews
                              where partner_id = p_partner and status = 'published'
                                and partner_reply is null),
      'payout_incomplete', (select count(*) = 0 from partner_members
                             where partner_id = p_partner and role = 'owner' and status = 'active'),
      'documents_expiring', 0),
    'today', jsonb_build_object(
      'check_ins',  (select count(*) from booking_items bi join listings l on l.id = bi.listing_id
                      where l.partner_id = p_partner and bi.starts_on = current_date and bi.kind = 'stay'),
      'check_outs', (select count(*) from booking_items bi join listings l on l.id = bi.listing_id
                      where l.partner_id = p_partner and bi.ends_on = current_date and bi.kind = 'stay'),
      'pickups',    (select count(*) from booking_items bi join listings l on l.id = bi.listing_id
                      where l.partner_id = p_partner and bi.starts_on = current_date and bi.kind = 'car'),
      'returns',    (select count(*) from booking_items bi join listings l on l.id = bi.listing_id
                      where l.partner_id = p_partner and bi.ends_on = current_date and bi.kind = 'car'),
      'covers',     (select coalesce(sum(bi.party), 0) from booking_items bi
                       join listings l on l.id = bi.listing_id
                      where l.partner_id = p_partner and bi.starts_on = current_date
                        and bi.kind = 'restaurant'),
      'large_parties', (select count(*) from booking_items bi join listings l on l.id = bi.listing_id
                         where l.partner_id = p_partner and bi.starts_on = current_date
                           and bi.kind = 'restaurant' and coalesce(bi.party, 0) >= 6),
      'in_maintenance', (select count(*) from vehicle_maintenance m
                           join listings l on l.id = m.listing_id
                          where l.partner_id = p_partner
                            and current_date between m.starts_on and m.ends_on))
  ) into result;

  return result;
end;
$$;

create or replace function partner_revenue_series(p_partner uuid, p_days integer default 30)
returns table (day date, revenue numeric, bookings bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select d::date,
         coalesce((select sum(bi.amount) from booking_items bi
                     join listings l on l.id = bi.listing_id
                     join bookings b on b.id = bi.booking_id
                    where l.partner_id = p_partner and b.created_at::date = d::date
                      and b.status <> 'cancelled'), 0),
         coalesce((select count(distinct bi.booking_id) from booking_items bi
                     join listings l on l.id = bi.listing_id
                     join bookings b on b.id = bi.booking_id
                    where l.partner_id = p_partner and b.created_at::date = d::date), 0)
    from generate_series(current_date - (greatest(p_days,1) - 1), current_date, interval '1 day') d
   where partner_can(p_partner, 'view_analytics') or partner_can(p_partner, 'view_finance');
$$;

/** Bulk availability editor (spec section 24). */
create or replace function partner_set_availability(
  p_listings uuid[], p_start date, p_end date,
  p_status availability_status,
  p_weekdays smallint[] default null,
  p_quantity smallint default null,
  p_min_stay smallint default null,
  p_max_stay smallint default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; v_listing uuid;
begin
  if p_end < p_start then
    raise exception 'La date de fin précède la date de début.' using errcode = '23514';
  end if;
  if array_length(p_listings, 1) is null then
    raise exception 'Choisissez au moins une annonce.' using errcode = '23514';
  end if;

  foreach v_listing in array p_listings loop
    if not exists (select 1 from listings l where l.id = v_listing
                    and partner_can(l.partner_id, 'manage_availability')) then
      raise exception 'Permission requise sur cette annonce.' using errcode = '42501';
    end if;

    insert into listing_availability (listing_id, day, status, quantity, min_stay, max_stay)
    select v_listing, d::date, p_status, p_quantity, p_min_stay, p_max_stay
      from generate_series(p_start, p_end, interval '1 day') d
      -- extract(isodow) is 1..7 from Monday; the app speaks 0..6.
     where p_weekdays is null
        or (extract(isodow from d)::smallint - 1) = any(p_weekdays)
    on conflict (listing_id, day) do update
      set status = excluded.status,
          quantity = coalesce(excluded.quantity, listing_availability.quantity),
          min_stay = coalesce(excluded.min_stay, listing_availability.min_stay),
          max_stay = coalesce(excluded.max_stay, listing_availability.max_stay),
          updated_at = now();

    get diagnostics v_count = row_count;
  end loop;

  return v_count;
end;
$$;

/**
 * Bulk rate change (spec section 27).
 *
 * Preview and apply share one function so the number an operator confirms is
 * produced by the same arithmetic that will run. A preview computed separately
 * from the write is a preview that can lie.
 */
create or replace function partner_rate_change(
  p_listings uuid[], p_percent numeric, p_start date, p_end date,
  p_apply boolean default false)
returns table (listing_id uuid, listing_name text, day date, old_price numeric, new_price numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if array_length(p_listings, 1) is null then
    raise exception 'Choisissez au moins une annonce.' using errcode = '23514';
  end if;
  if p_percent is null or p_percent < -90 or p_percent > 500 then
    raise exception 'Variation hors limites (-90 %% à 500 %%).' using errcode = '23514';
  end if;
  if not exists (select 1 from listings l where l.id = any(p_listings)
                  and partner_can(l.partner_id, 'manage_pricing')) then
    raise exception 'Permission requise : manage_pricing' using errcode = '42501';
  end if;

  create temp table _preview on commit drop as
  select l.id as listing_id, l.name as listing_name, d::date as day,
         coalesce(a.price_override, l.price) as old_price,
         round(coalesce(a.price_override, l.price) * (1 + p_percent / 100.0), 2) as new_price
    from listings l
    cross join generate_series(p_start, p_end, interval '1 day') d
    left join listing_availability a on a.listing_id = l.id and a.day = d::date
   where l.id = any(p_listings)
     and partner_can(l.partner_id, 'manage_pricing');

  if p_apply then
    insert into listing_availability (listing_id, day, price_override)
    select p.listing_id, p.day, p.new_price from _preview p
    on conflict (listing_id, day) do update
      set price_override = excluded.price_override, updated_at = now();
  end if;

  return query select * from _preview order by listing_name, day;
end;
$$;

/** A partner replies to a review; it can never be deleted by them. */
create or replace function partner_reply_review(p_review uuid, p_reply text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_partner uuid;
begin
  select partner_id into v_partner from reviews where id = p_review;
  if v_partner is null then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  if not partner_can(v_partner, 'manage_reviews') then
    raise exception 'Permission requise : manage_reviews' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reply, ''))) < 2 then
    raise exception 'La réponse est vide.' using errcode = '23514';
  end if;

  update reviews set partner_reply = p_reply where id = p_review;

  insert into partner_activity_log (partner_id, actor_id, action, entity_type, entity_id)
  values (v_partner, auth.uid(), 'review_replied', 'review', p_review::text);
end;
$$;

grant execute on function partner_overview(uuid) to authenticated;
grant execute on function partner_revenue_series(uuid, integer) to authenticated;
grant execute on function partner_set_availability(uuid[], date, date, availability_status, smallint[], smallint, smallint, smallint) to authenticated;
grant execute on function partner_rate_change(uuid[], numeric, date, date, boolean) to authenticated;
grant execute on function partner_reply_review(uuid, text) to authenticated;

revoke execute on function partner_overview(uuid) from anon;
revoke execute on function partner_revenue_series(uuid, integer) from anon;
revoke execute on function partner_set_availability(uuid[], date, date, availability_status, smallint[], smallint, smallint, smallint) from anon;
revoke execute on function partner_rate_change(uuid[], numeric, date, date, boolean) from anon;
revoke execute on function partner_reply_review(uuid, text) from anon;;
