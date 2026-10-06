/**
 * An admin read asks for the capability that names the data it returns.
 *
 * Every table behind these six functions carries a staff SELECT policy keyed to
 * a specific capability -- `payments`, `refunds` and `payouts` to
 * `view_payments`, `profiles` to `view_customers`, `admin_audit_log` to
 * `view_audit_logs`, `support_tickets` to `view_support`, `disputes` to
 * `view_disputes`, `security_events` to `view_security`. All six functions are
 * SECURITY DEFINER and gated on `is_staff()`, so they answered past every one of
 * those policies on the strength of "you are on the staff table".
 *
 * The capability matrix says what that costs. A `content_manager` holds
 * `manage_content`, `view_listings` and `view_analytics` and nothing else, and
 * `admin_overview()` handed them the platform's commission, the volume of
 * payments taken, the customer count and the dispute backlog.
 * `admin_global_search` returned `payments.processor_ref` and
 * `support_tickets.subject` to a `partner_manager` who may read neither. The
 * sharpest is `admin_activity_feed`: `view_audit_logs` belongs to
 * `risk_manager` and `super_admin` alone, and the feed's last branch is
 * `admin_audit_log` itself -- the record of who did what, including the entries
 * about the person reading it, handed to any staff member with any role.
 *
 * Two styles are already in this file and both are kept, because the difference
 * is the right one. `admin_overview` is `plpgsql` and raises `42501`: it is the
 * landing page, and a stranger asking for it should be told no. The five
 * `language sql` ones fold the test into the WHERE and return empty, which is
 * what lets a degraded console render instead of erroring. Inside both, the gate
 * moves from one `is_staff()` to one `admin_can()` per block:
 * `admin_global_search` and `admin_activity_feed` gate each union branch
 * separately, with the `limit` left where it was -- on the outer query, after
 * filtering, so a `support_agent` gets thirty support hits rather than thirty
 * rows of which four survive.
 *
 * `admin_overview` and `admin_revenue_series` null their figures individually
 * and **keep every JSON key and every column present**. That is not tidiness:
 * `Overview.tsx:82` reads `data?.gbv.current`, optional-chained on `data` only,
 * so a null `gbv` object is a TypeError and a white screen. A null leaf reaches
 * `moneyShort(null)`, which already answers "0 $". All eight call sites were
 * read; every one is null-safe.
 *
 * Deliberately left alone, four things. **`admin_me()` keeps no gate at all** --
 * it answers "who am I" from `auth.uid()`, it is what the console asks before it
 * knows whether to ask anything else, and 20260922220113 already recorded that
 * decision. **`admin_overview` keeps `is_staff()` as its outer door** rather
 * than demanding `view_analytics`: that capability is missing from
 * `risk_manager` and `support_agent`, and this function feeds the sidebar badge
 * counts, so requiring it would blank the navigation for two roles to protect
 * figures that are now nulled one by one anyway. **`admin_booking_distribution`
 * loses its outer test**: it returned a bare `null` to a non-staff caller and
 * now returns `{by_service:{},by_status:{},by_partner_type:{}}`, the same amount
 * of information in a shape the browser can read. **Nothing changes for anyone
 * today**: `staff` holds two rows, both `super_admin`, which holds all 32
 * capabilities. This is a lock fitted before the second key is cut.
 */

create or replace function admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
  since_30 timestamptz := now() - interval '30 days';
  since_60 timestamptz := now() - interval '60 days';
  v_pay      boolean;
  v_book     boolean;
  v_cust     boolean;
  v_part     boolean;
  v_list     boolean;
  v_support  boolean;
  v_disputes boolean;
  v_security boolean;
  v_reviews  boolean;
  v_verif    boolean;
begin
  if not is_staff() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  -- One `admin_can()` per capability rather than one per figure: the same
  -- capability each of these tables asks for in its own SELECT policy.
  v_pay      := admin_can('view_payments');
  v_book     := admin_can('view_bookings');
  v_cust     := admin_can('view_customers');
  v_part     := admin_can('view_partners');
  v_list     := admin_can('view_listings');
  v_support  := admin_can('view_support');
  v_disputes := admin_can('view_disputes');
  v_security := admin_can('view_security');
  v_reviews  := admin_can('view_reviews');
  v_verif    := admin_can('manage_verification') or admin_can('view_partners');

  select jsonb_build_object(
    'gbv', jsonb_build_object(
      'current', case when v_book then coalesce((select sum(total) from bookings
                           where created_at >= since_30 and status <> 'cancelled'), 0) end,
      'previous', case when v_book then coalesce((select sum(total) from bookings
                            where created_at >= since_60 and created_at < since_30
                              and status <> 'cancelled'), 0) end),
    'revenue', jsonb_build_object(
      'current', case when v_pay then coalesce((select sum(commission) from payments
                           where created_at >= since_30 and status = 'paid'), 0) end,
      'previous', case when v_pay then coalesce((select sum(commission) from payments
                            where created_at >= since_60 and created_at < since_30
                              and status = 'paid'), 0) end),
    'payments_volume', jsonb_build_object(
      'current', case when v_pay then coalesce((select sum(amount) from payments
                           where created_at >= since_30 and status = 'paid'), 0) end,
      'previous', case when v_pay then coalesce((select sum(amount) from payments
                            where created_at >= since_60 and created_at < since_30
                              and status = 'paid'), 0) end),
    'active_reservations', case when v_book then (select count(*) from bookings where status = 'confirmed') end,
    'customers', jsonb_build_object(
      'current', case when v_cust then (select count(*) from profiles) end,
      'previous', case when v_cust then (select count(*) from profiles where created_at < since_30) end),
    'partners_active', case when v_part then (select count(*) from partners where status = 'active') end,
    'listings_published', case when v_list then (select count(*) from listings where status = 'published') end,
    'health', jsonb_build_object(
      'pending_partner_approvals', case when v_verif then (select count(*) from partner_applications
                                    where status in ('new', 'reviewing')) end,
      'pending_listing_reviews',   case when v_list then (select count(*) from listings where status = 'pending_review') end,
      'payment_issues',            case when v_pay then (select count(*) from payments
                                    where status in ('failed', 'disputed', 'chargeback')) end,
      'refund_requests',           case when v_pay then (select count(*) from refunds
                                    where status in ('requested', 'under_review')) end,
      'open_disputes',             case when v_disputes then (select count(*) from disputes
                                    where status in ('open', 'investigating', 'awaiting_evidence')) end,
      'support_tickets',           case when v_support then (select count(*) from support_tickets
                                    where status in ('new', 'open', 'escalated')) end,
      'urgent_tickets',            case when v_support then (select count(*) from support_tickets
                                    where status <> 'closed' and priority = 'urgent') end,
      'risk_alerts',               case when v_security then (select count(*) from security_events
                                    where not resolved and severity in ('warning', 'critical')) end,
      'payout_failures',           case when v_pay then (select count(*) from payouts where status = 'failed') end,
      'flagged_reviews',           case when v_reviews then (select count(*) from reviews where status = 'flagged') end,
      'listings_attention',        case when v_list then (select count(*) from listings
                                    where status in ('rejected', 'suspended')) end,
      'expiring_verifications',    case when v_part then (select count(*) from partners
                                    where verification in ('expired', 'rejected')) end)
  ) into result;

  return result;
end;
$$;

comment on function admin_overview() is
  'The KPI row and the health row. Any active staff member may call it; every figure in it is null unless the caller holds the capability its own table asks for.';

-- The series feeds two screens -- Analyses and Finance -- so it answers to
-- either capability, and nulls each money column behind the one that names it.
create or replace function admin_revenue_series(p_days integer default 30)
returns table (day date, gbv numeric, revenue numeric, refunds numeric, payouts numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select d::date as day,
    case when admin_can('view_bookings') then
      coalesce((select sum(b.total) from bookings b
                where b.created_at::date = d::date and b.status <> 'cancelled'), 0) end,
    case when admin_can('view_payments') then
      coalesce((select sum(p.commission) from payments p
                where p.created_at::date = d::date and p.status = 'paid'), 0) end,
    case when admin_can('view_payments') then
      coalesce((select sum(r.final_amount) from refunds r
                where r.decided_at::date = d::date and r.status = 'completed'), 0) end,
    case when admin_can('view_payments') then
      coalesce((select sum(po.net) from payouts po
                where po.paid_at::date = d::date and po.status = 'paid'), 0) end
  from generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day') d
  where admin_can('view_analytics') or admin_can('view_payments');
$$;

comment on function admin_revenue_series(integer) is
  'One row per day for the revenue charts. Empty without view_analytics or view_payments; the money columns are null without view_payments.';

-- An empty distribution renders the "aucune réservation" state; the old
-- whole-object null did not render at all.
create or replace function admin_booking_distribution()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'by_service', case when admin_can('view_bookings') then
        coalesce((select jsonb_object_agg(kind, n) from (
          select bi.kind::text as kind, count(*) n from booking_items bi group by bi.kind) s), '{}'::jsonb)
      else '{}'::jsonb end,
    'by_status', case when admin_can('view_bookings') then
        coalesce((select jsonb_object_agg(status, n) from (
          select b.status::text as status, count(*) n from bookings b group by b.status) s), '{}'::jsonb)
      else '{}'::jsonb end,
    'by_partner_type', case when admin_can('view_partners') then
        coalesce((select jsonb_object_agg(type, n) from (
          select p.type::text as type, count(*) n from partners p
          where p.status = 'active' group by p.type) s), '{}'::jsonb)
      else '{}'::jsonb end
  );
$$;

comment on function admin_booking_distribution() is
  'Reservations by service, by status and by partner type. Each map is empty unless the caller holds view_bookings or view_partners; the shape is always complete.';

-- `nulls last` is not decoration: once `revenue` can be null for everyone, a
-- bare `order by 5 desc` would sort the whole table by its null column first.
create or replace function admin_geo_performance()
returns table (city text, listings bigint, partners bigint, bookings bigint, revenue numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.city,
         count(distinct l.id),
         case when admin_can('view_partners') then count(distinct l.partner_id) end,
         case when admin_can('view_bookings') then count(distinct bi.booking_id) end,
         case when admin_can('view_payments') then coalesce(sum(bi.amount), 0) end
  from listings l
  left join booking_items bi on bi.listing_id = l.id
  where admin_can('view_listings') and l.city is not null
  group by l.city
  order by 5 desc nulls last, 4 desc nulls last, 2 desc;
$$;

comment on function admin_geo_performance() is
  'Performance by city. Needs view_listings for the rows; the partner, booking and revenue columns each need their own capability.';

create or replace function admin_activity_feed(p_limit integer default 20)
returns table (at timestamptz, event text, entity_type text, entity_id text,
               label text, actor text, severity text)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from (
    select a.submitted_at, 'partner_application', 'application', a.id::text,
           a.business_name, coalesce(a.first_name || ' ' || a.last_name, a.email), 'info'
      from partner_applications a
     where admin_can('view_partners') and a.submitted_at is not null
    union all
    select b.created_at, 'booking_created', 'booking', b.reference,
           b.reference, coalesce(b.first_name || ' ' || b.last_name, b.email), 'info'
      from bookings b
     where admin_can('view_bookings')
    union all
    select r.created_at, 'refund_requested', 'refund', r.id::text,
           coalesce(r.booking_ref, r.reference), r.customer_label, 'notice'
      from refunds r
     where admin_can('view_payments')
    union all
    select d.opened_at, 'dispute_opened', 'dispute', d.id::text,
           d.reference, d.customer_label, 'warning'
      from disputes d
     where admin_can('view_disputes')
    union all
    select p.paid_at, 'payout_paid', 'payout', p.id::text,
           p.reference, null, 'info'
      from payouts p
     where admin_can('view_payments') and p.paid_at is not null
    union all
    select t.created_at, 'ticket_created', 'ticket', t.id::text,
           t.subject, t.requester_label, case when t.priority = 'urgent' then 'warning' else 'info' end
      from support_tickets t
     where admin_can('view_support')
    union all
    -- The audit trail is the branch that was leaking to everyone:
    -- `admin_audit_log`'s own policy asks for `view_audit_logs`, which only
    -- risk_manager and super_admin hold.
    select l.at, 'admin_action', l.entity_type, l.entity_id,
           coalesce(l.entity_label, l.action), l.admin_label, l.severity
      from admin_audit_log l
     where admin_can('view_audit_logs')
  ) feed(at, event, entity_type, entity_id, label, actor, severity)
  where at is not null
  order by at desc
  limit greatest(p_limit, 1);
$$;

comment on function admin_activity_feed(integer) is
  'One merged stream of platform events. Each source answers to its own capability, and the limit is applied after filtering so a narrow role still gets a full page.';

create or replace function admin_global_search(q text)
returns table (group_name text, id text, title text, subtitle text, href text)
language sql stable security definer set search_path = public, pg_temp as $$
  with needle as (select '%' || btrim(q) || '%' as pat)
  select * from (
    -- The parentheses around each OR group are load-bearing: written as
    -- `admin_can(...) and a or b or c` the gate would cover the first term only.
    select 'Clients', p.id::text, coalesce(p.full_name, 'Client'), p.phone,
           '/admin/clients/' || p.id
      from profiles p, needle
     where admin_can('view_customers')
       and (p.full_name ilike pat or p.phone ilike pat or p.id::text ilike pat)
    union all
    select 'Partenaires', pa.id::text, pa.business_name, pa.city, '/admin/partenaires/' || pa.id
      from partners pa, needle
     where admin_can('view_partners')
       and (pa.business_name ilike pat or pa.email ilike pat or pa.city ilike pat)
    union all
    select 'Annonces', l.id::text, l.name, l.city, '/admin/annonces/' || l.id
      from listings l, needle
     where admin_can('view_listings')
       and (l.name ilike pat or l.city ilike pat)
    union all
    select 'Réservations', b.reference, b.reference,
           coalesce(b.first_name || ' ' || b.last_name, b.email), '/admin/reservations/' || b.reference
      from bookings b, needle
     where admin_can('view_bookings')
       and (b.reference ilike pat or b.email ilike pat
            or (b.first_name || ' ' || b.last_name) ilike pat)
    union all
    select 'Transactions', t.id::text, t.reference, t.customer_label, '/admin/paiements/' || t.id
      from payments t, needle
     where admin_can('view_payments')
       and (t.reference ilike pat or t.processor_ref ilike pat or t.customer_label ilike pat)
    union all
    select 'Support', s.id::text, s.subject, s.reference, '/admin/support/' || s.id
      from support_tickets s, needle
     where admin_can('view_support')
       and (s.subject ilike pat or s.reference ilike pat)
  ) hits(group_name, id, title, subtitle, href)
  where length(btrim(q)) >= 2
  limit 30;
$$;

comment on function admin_global_search(text) is
  'One search box across six entity types. Each group answers to its own capability and the limit is applied after filtering, so a narrow role gets thirty of what it may read.';
;
