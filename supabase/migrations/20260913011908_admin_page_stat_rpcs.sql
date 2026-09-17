-- Header metrics for each list screen. One round trip per page instead of a
-- count query per card.

create or replace function admin_customer_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_customers') then null else jsonb_build_object(
    'total',     (select count(*) from profiles),
    'active',    (select count(*) from profiles where status = 'active'),
    'new_month', (select count(*) from profiles where created_at >= date_trunc('month', now())),
    'suspended', (select count(*) from profiles where status = 'suspended')
  ) end;
$$;

create or replace function admin_partner_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_partners') then null else jsonb_build_object(
    'total',        (select count(*) from partners),
    'active',       (select count(*) from partners where status = 'active'),
    'pending',      (select count(*) from partner_applications where status in ('new','reviewing')),
    'suspended',    (select count(*) from partners where status = 'suspended'),
    'unverified',   (select count(*) from partners where verification <> 'verified')
  ) end;
$$;

create or replace function admin_listing_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_listings') then null else jsonb_build_object(
    'total',     (select count(*) from listings),
    'published', (select count(*) from listings where status = 'published'),
    'pending',   (select count(*) from listings where status = 'pending_review'),
    'paused',    (select count(*) from listings where status in ('paused','suspended')),
    'rejected',  (select count(*) from listings where status = 'rejected'),
    'by_status', coalesce((select jsonb_object_agg(status, n) from
                  (select status::text, count(*) n from listings group by status) s), '{}'::jsonb)
  ) end;
$$;

create or replace function admin_reservation_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_bookings') then null else jsonb_build_object(
    'today',     (select count(*) from bookings where created_at::date = current_date),
    'upcoming',  (select count(distinct b.id) from bookings b join booking_items i on i.booking_id = b.id
                  where b.status = 'confirmed' and i.starts_on >= current_date),
    'pending',   (select count(*) from bookings where status = 'pending'),
    'completed', (select count(distinct b.id) from bookings b join booking_items i on i.booking_id = b.id
                  where b.status = 'confirmed' and coalesce(i.ends_on, i.starts_on) < current_date),
    'cancelled', (select count(*) from bookings where status = 'cancelled'),
    'disputed',  (select count(*) from disputes where status <> 'closed')
  ) end;
$$;

create or replace function admin_finance_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_payments') then null else jsonb_build_object(
    'gbv',              coalesce((select sum(total) from bookings where status <> 'cancelled'), 0),
    'net_revenue',      coalesce((select sum(commission) from payments where status = 'paid'), 0),
    'collected',        coalesce((select sum(amount) from payments where status = 'paid'), 0),
    'partner_payouts',  coalesce((select sum(net) from payouts where status = 'paid'), 0),
    'pending_payouts',  coalesce((select sum(net) from payouts where status in ('ready','processing')), 0),
    'held_payouts',     coalesce((select sum(net) from payouts where status = 'held'), 0),
    'refunds',          coalesce((select sum(final_amount) from refunds where status = 'completed'), 0),
    'refunds_pending',  coalesce((select count(*) from refunds where status in ('requested','under_review')), 0),
    'chargebacks',      coalesce((select sum(amount) from payments where status = 'chargeback'), 0),
    'failed_payments',  (select count(*) from payments where status = 'failed'),
    'payments_count',   (select count(*) from payments),
    'by_method',        coalesce((select jsonb_object_agg(method, amt) from
                          (select method::text, sum(amount) amt from payments
                            where status = 'paid' group by method) s), '{}'::jsonb),
    'by_status',        coalesce((select jsonb_object_agg(status, n) from
                          (select status::text, count(*) n from payments group by status) s), '{}'::jsonb)
  ) end;
$$;

create or replace function admin_payout_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_payments') then null else jsonb_build_object(
    'ready',      coalesce((select sum(net) from payouts where status = 'ready'), 0),
    'processing', coalesce((select sum(net) from payouts where status = 'processing'), 0),
    'paid',       coalesce((select sum(net) from payouts where status = 'paid'), 0),
    'failed',     coalesce((select sum(net) from payouts where status = 'failed'), 0),
    'held',       coalesce((select sum(net) from payouts where status = 'held'), 0)
  ) end;
$$;

create or replace function admin_refund_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_payments') then null else coalesce(
    (select jsonb_object_agg(status, n) from
      (select status::text, count(*) n from refunds group by status) s), '{}'::jsonb) end;
$$;

create or replace function admin_support_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_support') then null else jsonb_build_object(
    'by_status',   coalesce((select jsonb_object_agg(status, n) from
                    (select status::text, count(*) n from support_tickets group by status) s), '{}'::jsonb),
    'by_priority', coalesce((select jsonb_object_agg(priority, n) from
                    (select priority::text, count(*) n from support_tickets
                      where status not in ('resolved','closed') group by priority) s), '{}'::jsonb)
  ) end;
$$;

create or replace function admin_review_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_reviews') then null else jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from
                  (select status::text, count(*) n from reviews group by status) s), '{}'::jsonb),
    'average',   (select round(avg(rating)::numeric, 2) from reviews where status = 'published'),
    'total',     (select count(*) from reviews)
  ) end;
$$;

-- Customer analytics (spec §43) and partner analytics (spec §44).
create or replace function admin_customer_analytics()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_analytics') then null else jsonb_build_object(
    'new_month',      (select count(*) from profiles where created_at >= date_trunc('month', now())),
    'active',         (select count(distinct user_id) from bookings
                        where created_at >= now() - interval '90 days' and user_id is not null),
    'returning',      (select count(*) from (select user_id from bookings
                        where user_id is not null group by user_id having count(*) > 1) r),
    'lifetime_value', coalesce((select avg(spend) from
                        (select sum(total) spend from bookings where status <> 'cancelled'
                          and user_id is not null group by user_id) s), 0),
    'avg_booking',    coalesce((select avg(total) from bookings where status <> 'cancelled'), 0),
    'repeat_rate',    coalesce((select round(100.0 * count(*) filter (where n > 1) /
                        nullif(count(*), 0), 1) from
                        (select user_id, count(*) n from bookings where user_id is not null
                          group by user_id) s), 0),
    'cancel_rate',    coalesce((select round(100.0 * count(*) filter (where status = 'cancelled') /
                        nullif(count(*), 0), 1) from bookings), 0)
  ) end;
$$;

create or replace function admin_partner_analytics()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not admin_can('view_analytics') then null else jsonb_build_object(
    'new_month',   (select count(*) from partners where created_at >= date_trunc('month', now())),
    'active',      (select count(*) from partners where status = 'active'),
    'avg_rating',  (select round(avg(rating)::numeric, 2) from partners where rating is not null),
    'avg_revenue', coalesce((select avg(revenue) from
                    (select coalesce(sum(bi.amount), 0) revenue from partners p
                      left join listings l on l.partner_id = p.id
                      left join booking_items bi on bi.listing_id = l.id
                     group by p.id) s), 0),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', business_name, 'revenue', revenue)
                      order by revenue desc)
             from (select p.business_name, coalesce(sum(bi.amount), 0) revenue
                     from partners p
                     left join listings l on l.partner_id = p.id
                     left join booking_items bi on bi.listing_id = l.id
                    group by p.id, p.business_name
                    order by revenue desc limit 8) t), '[]'::jsonb)
  ) end;
$$;

grant execute on function admin_customer_stats() to authenticated;
grant execute on function admin_partner_stats() to authenticated;
grant execute on function admin_listing_stats() to authenticated;
grant execute on function admin_reservation_stats() to authenticated;
grant execute on function admin_finance_stats() to authenticated;
grant execute on function admin_payout_stats() to authenticated;
grant execute on function admin_refund_stats() to authenticated;
grant execute on function admin_support_stats() to authenticated;
grant execute on function admin_review_stats() to authenticated;
grant execute on function admin_customer_analytics() to authenticated;
grant execute on function admin_partner_analytics() to authenticated;;
