-- Who am I, and what may I do? The client renders navigation from this, but
-- the answer is computed in the database, so hiding a menu is cosmetic only.
create or replace function admin_me()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select jsonb_build_object(
       'is_staff', s.status = 'active',
       'user_id', s.user_id,
       'full_name', s.full_name,
       'email', s.email,
       'role', s.role,
       'job_title', s.job_title,
       'status', s.status,
       'permissions', coalesce(
         (select jsonb_agg(rp.permission order by rp.permission)
          from role_permissions rp where rp.role = s.role), '[]'::jsonb))
     from staff s where s.user_id = auth.uid()),
    jsonb_build_object('is_staff', false, 'permissions', '[]'::jsonb));
$$;

-- Spec sections 4 and 5: the KPI row and the platform health row, in one
-- round trip, because the overview should not fire fifteen queries.
create or replace function admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
  since_30 timestamptz := now() - interval '30 days';
  since_60 timestamptz := now() - interval '60 days';
begin
  if not is_staff() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'gbv', jsonb_build_object(
      'current', coalesce((select sum(total) from bookings
                           where created_at >= since_30 and status <> 'cancelled'), 0),
      'previous', coalesce((select sum(total) from bookings
                            where created_at >= since_60 and created_at < since_30
                              and status <> 'cancelled'), 0)),
    'revenue', jsonb_build_object(
      'current', coalesce((select sum(commission) from payments
                           where created_at >= since_30 and status = 'paid'), 0),
      'previous', coalesce((select sum(commission) from payments
                            where created_at >= since_60 and created_at < since_30
                              and status = 'paid'), 0)),
    'payments_volume', jsonb_build_object(
      'current', coalesce((select sum(amount) from payments
                           where created_at >= since_30 and status = 'paid'), 0),
      'previous', coalesce((select sum(amount) from payments
                            where created_at >= since_60 and created_at < since_30
                              and status = 'paid'), 0)),
    'active_reservations', (select count(*) from bookings where status = 'confirmed'),
    'customers', jsonb_build_object(
      'current', (select count(*) from profiles),
      'previous', (select count(*) from profiles where created_at < since_30)),
    'partners_active', (select count(*) from partners where status = 'active'),
    'listings_published', (select count(*) from listings where status = 'published'),
    'health', jsonb_build_object(
      'pending_partner_approvals', (select count(*) from partner_applications
                                    where status in ('new', 'reviewing')),
      'pending_listing_reviews',   (select count(*) from listings where status = 'pending_review'),
      'payment_issues',            (select count(*) from payments
                                    where status in ('failed', 'disputed', 'chargeback')),
      'refund_requests',           (select count(*) from refunds
                                    where status in ('requested', 'under_review')),
      'open_disputes',             (select count(*) from disputes
                                    where status in ('open', 'investigating', 'awaiting_evidence')),
      'support_tickets',           (select count(*) from support_tickets
                                    where status in ('new', 'open', 'escalated')),
      'urgent_tickets',            (select count(*) from support_tickets
                                    where status <> 'closed' and priority = 'urgent'),
      'risk_alerts',               (select count(*) from security_events
                                    where not resolved and severity in ('warning', 'critical')),
      'payout_failures',           (select count(*) from payouts where status = 'failed'),
      'flagged_reviews',           (select count(*) from reviews where status = 'flagged'),
      'listings_attention',        (select count(*) from listings
                                    where status in ('rejected', 'suspended')),
      'expiring_verifications',    (select count(*) from partners
                                    where verification in ('expired', 'rejected')))
  ) into result;

  return result;
end;
$$;

-- Revenue over time (spec section 7). One row per day so the client can bucket
-- and compare without shipping raw bookings to the browser.
create or replace function admin_revenue_series(p_days integer default 30)
returns table (day date, gbv numeric, revenue numeric, refunds numeric, payouts numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select d::date as day,
    coalesce((select sum(b.total) from bookings b
              where b.created_at::date = d::date and b.status <> 'cancelled'), 0),
    coalesce((select sum(p.commission) from payments p
              where p.created_at::date = d::date and p.status = 'paid'), 0),
    coalesce((select sum(r.final_amount) from refunds r
              where r.decided_at::date = d::date and r.status = 'completed'), 0),
    coalesce((select sum(po.net) from payouts po
              where po.paid_at::date = d::date and po.status = 'paid'), 0)
  from generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day') d
  where is_staff();
$$;

-- Spec section 8: reservations by service and by status.
create or replace function admin_booking_distribution()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not is_staff() then null else jsonb_build_object(
    'by_service', coalesce((select jsonb_object_agg(kind, n) from (
        select bi.kind::text as kind, count(*) n from booking_items bi group by bi.kind) s), '{}'::jsonb),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (
        select b.status::text as status, count(*) n from bookings b group by b.status) s), '{}'::jsonb),
    'by_partner_type', coalesce((select jsonb_object_agg(type, n) from (
        select p.type::text as type, count(*) n from partners p
        where p.status = 'active' group by p.type) s), '{}'::jsonb)
  ) end;
$$;

-- Spec section 9: performance by place, built from listings and their bookings.
create or replace function admin_geo_performance()
returns table (city text, listings bigint, partners bigint, bookings bigint, revenue numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.city,
         count(distinct l.id),
         count(distinct l.partner_id),
         count(distinct bi.booking_id),
         coalesce(sum(bi.amount), 0)
  from listings l
  left join booking_items bi on bi.listing_id = l.id
  where is_staff() and l.city is not null
  group by l.city
  order by 5 desc, 4 desc, 2 desc;
$$;

-- Spec section 6: one merged stream instead of six polled endpoints.
create or replace function admin_activity_feed(p_limit integer default 20)
returns table (at timestamptz, event text, entity_type text, entity_id text,
               label text, actor text, severity text)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from (
    select a.submitted_at, 'partner_application', 'application', a.id::text,
           a.business_name, coalesce(a.first_name || ' ' || a.last_name, a.email), 'info'
      from partner_applications a where a.submitted_at is not null
    union all
    select b.created_at, 'booking_created', 'booking', b.reference,
           b.reference, coalesce(b.first_name || ' ' || b.last_name, b.email), 'info'
      from bookings b
    union all
    select r.created_at, 'refund_requested', 'refund', r.id::text,
           coalesce(r.booking_ref, r.reference), r.customer_label, 'notice'
      from refunds r
    union all
    select d.opened_at, 'dispute_opened', 'dispute', d.id::text,
           d.reference, d.customer_label, 'warning' from disputes d
    union all
    select p.paid_at, 'payout_paid', 'payout', p.id::text,
           p.reference, null, 'info' from payouts p where p.paid_at is not null
    union all
    select t.created_at, 'ticket_created', 'ticket', t.id::text,
           t.subject, t.requester_label, case when t.priority = 'urgent' then 'warning' else 'info' end
      from support_tickets t
    union all
    select l.at, 'admin_action', l.entity_type, l.entity_id,
           coalesce(l.entity_label, l.action), l.admin_label, l.severity
      from admin_audit_log l
  ) feed(at, event, entity_type, entity_id, label, actor, severity)
  where is_staff() and at is not null
  order by at desc
  limit greatest(p_limit, 1);
$$;

-- Spec section 56: one search box across every entity an admin thinks in.
create or replace function admin_global_search(q text)
returns table (group_name text, id text, title text, subtitle text, href text)
language sql stable security definer set search_path = public, pg_temp as $$
  with needle as (select '%' || btrim(q) || '%' as pat)
  select * from (
    select 'Clients', p.id::text, coalesce(p.full_name, 'Client'), p.phone,
           '/admin/clients/' || p.id
      from profiles p, needle
     where p.full_name ilike pat or p.phone ilike pat or p.id::text ilike pat
    union all
    select 'Partenaires', pa.id::text, pa.business_name, pa.city, '/admin/partenaires/' || pa.id
      from partners pa, needle
     where pa.business_name ilike pat or pa.email ilike pat or pa.city ilike pat
    union all
    select 'Annonces', l.id::text, l.name, l.city, '/admin/annonces/' || l.id
      from listings l, needle
     where l.name ilike pat or l.city ilike pat
    union all
    select 'Réservations', b.reference, b.reference,
           coalesce(b.first_name || ' ' || b.last_name, b.email), '/admin/reservations/' || b.reference
      from bookings b, needle
     where b.reference ilike pat or b.email ilike pat
        or (b.first_name || ' ' || b.last_name) ilike pat
    union all
    select 'Transactions', t.id::text, t.reference, t.customer_label, '/admin/paiements/' || t.id
      from payments t, needle
     where t.reference ilike pat or t.processor_ref ilike pat or t.customer_label ilike pat
    union all
    select 'Support', s.id::text, s.subject, s.reference, '/admin/support/' || s.id
      from support_tickets s, needle
     where s.subject ilike pat or s.reference ilike pat
  ) hits(group_name, id, title, subtitle, href)
  where is_staff() and length(btrim(q)) >= 2
  limit 30;
$$;

grant execute on function admin_me() to authenticated;
grant execute on function admin_overview() to authenticated;
grant execute on function admin_revenue_series(integer) to authenticated;
grant execute on function admin_booking_distribution() to authenticated;
grant execute on function admin_geo_performance() to authenticated;
grant execute on function admin_activity_feed(integer) to authenticated;
grant execute on function admin_global_search(text) to authenticated;;
