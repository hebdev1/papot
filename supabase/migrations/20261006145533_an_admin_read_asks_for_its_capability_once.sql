/**
 * A capability is a fact about the caller, so it is read once per call.
 *
 * The migration that gave these functions their per-capability gates put the
 * `admin_can()` calls where they were needed and not where they were cheap.
 * `admin_revenue_series` ended up with one in the WHERE and four in the select
 * list, all inside a `generate_series`: a year of revenue is 365 rows, so the
 * Finance screen made on the order of two thousand calls to a SECURITY DEFINER
 * function that joins `staff` to `role_permissions` -- to compute six booleans
 * that are identical for every row, because they describe the person asking,
 * not the day being described. The version before it tested `is_staff()` once
 * per row, which was already one more than necessary.
 *
 * `admin_geo_performance` had the same shape per group, and `admin_global_search`
 * and `admin_activity_feed` evaluate theirs as a filter condition on every row
 * they scan -- a STABLE function cannot be folded at plan time, so nothing
 * hoists it for us.
 *
 * So each one now reads its capabilities in a `materialized` CTE and
 * cross-joins the single row. `materialized` is deliberate: a CTE referenced
 * once would be inlined and expanded straight back into the per-row calls this
 * migration exists to remove. `admin_overview` already did this correctly with
 * plpgsql variables, and this is the same idea in the one dialect the other
 * five are written in.
 *
 * `admin_geo_performance` groups by the capability columns as well as the city.
 * They are constant, so the grouping is unchanged -- one group per city -- and
 * it is what lets the select list reference them without wrapping each in an
 * aggregate.
 *
 * Behaviour is identical in every case: same rows, same columns, same nulls,
 * same `nulls last` ordering. Only the number of times the database is asked
 * who is calling changes.
 *
 * Deliberately left alone. **`admin_booking_distribution` keeps its three
 * inline calls**: it returns exactly one row, so there is nothing to hoist and
 * a CTE would be ceremony around three function calls. **`admin_overview` is
 * untouched** -- it reads each capability into a variable before building the
 * JSON, which is already the shape this migration is reaching for. **No gate
 * moves and no capability changes**, so nothing here alters who may read what;
 * that was settled in the previous migration and this one is only about cost.
 */

create or replace function admin_revenue_series(p_days integer default 30)
returns table (day date, gbv numeric, revenue numeric, refunds numeric, payouts numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with cap as materialized (
    select admin_can('view_analytics') as analytics,
           admin_can('view_payments')  as pay,
           admin_can('view_bookings')  as book
  )
  select d::date as day,
    case when cap.book then
      coalesce((select sum(b.total) from bookings b
                where b.created_at::date = d::date and b.status <> 'cancelled'), 0) end,
    case when cap.pay then
      coalesce((select sum(p.commission) from payments p
                where p.created_at::date = d::date and p.status = 'paid'), 0) end,
    case when cap.pay then
      coalesce((select sum(r.final_amount) from refunds r
                where r.decided_at::date = d::date and r.status = 'completed'), 0) end,
    case when cap.pay then
      coalesce((select sum(po.net) from payouts po
                where po.paid_at::date = d::date and po.status = 'paid'), 0) end
  from cap,
       generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day') d
  where cap.analytics or cap.pay;
$$;

comment on function admin_revenue_series(integer) is
  'One row per day for the revenue charts. Empty without view_analytics or view_payments; the money columns are null without view_payments. The capabilities are read once per call, not once per day.';

create or replace function admin_geo_performance()
returns table (city text, listings bigint, partners bigint, bookings bigint, revenue numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with cap as materialized (
    select admin_can('view_listings') as list,
           admin_can('view_partners') as part,
           admin_can('view_bookings') as book,
           admin_can('view_payments') as pay
  )
  select l.city,
         count(distinct l.id),
         case when cap.part then count(distinct l.partner_id) end,
         case when cap.book then count(distinct bi.booking_id) end,
         case when cap.pay  then coalesce(sum(bi.amount), 0) end
  from listings l
  left join booking_items bi on bi.listing_id = l.id
  cross join cap
  where cap.list and l.city is not null
  group by l.city, cap.part, cap.book, cap.pay
  order by 5 desc nulls last, 4 desc nulls last, 2 desc;
$$;

comment on function admin_geo_performance() is
  'Performance by city. Needs view_listings for the rows; the partner, booking and revenue columns each need their own capability, read once per call.';

create or replace function admin_activity_feed(p_limit integer default 20)
returns table (at timestamptz, event text, entity_type text, entity_id text,
               label text, actor text, severity text)
language sql stable security definer set search_path = public, pg_temp as $$
  with cap as materialized (
    select admin_can('view_partners')   as part,
           admin_can('view_bookings')   as book,
           admin_can('view_payments')   as pay,
           admin_can('view_disputes')   as disp,
           admin_can('view_support')    as supp,
           admin_can('view_audit_logs') as audit
  )
  select * from (
    select a.submitted_at, 'partner_application', 'application', a.id::text,
           a.business_name, coalesce(a.first_name || ' ' || a.last_name, a.email), 'info'
      from partner_applications a, cap
     where cap.part and a.submitted_at is not null
    union all
    select b.created_at, 'booking_created', 'booking', b.reference,
           b.reference, coalesce(b.first_name || ' ' || b.last_name, b.email), 'info'
      from bookings b, cap
     where cap.book
    union all
    select r.created_at, 'refund_requested', 'refund', r.id::text,
           coalesce(r.booking_ref, r.reference), r.customer_label, 'notice'
      from refunds r, cap
     where cap.pay
    union all
    select d.opened_at, 'dispute_opened', 'dispute', d.id::text,
           d.reference, d.customer_label, 'warning'
      from disputes d, cap
     where cap.disp
    union all
    select p.paid_at, 'payout_paid', 'payout', p.id::text,
           p.reference, null, 'info'
      from payouts p, cap
     where cap.pay and p.paid_at is not null
    union all
    select t.created_at, 'ticket_created', 'ticket', t.id::text,
           t.subject, t.requester_label, case when t.priority = 'urgent' then 'warning' else 'info' end
      from support_tickets t, cap
     where cap.supp
    union all
    -- The audit trail is the branch that was leaking to everyone:
    -- `admin_audit_log`'s own policy asks for `view_audit_logs`, which only
    -- risk_manager and super_admin hold.
    select l.at, 'admin_action', l.entity_type, l.entity_id,
           coalesce(l.entity_label, l.action), l.admin_label, l.severity
      from admin_audit_log l, cap
     where cap.audit
  ) feed(at, event, entity_type, entity_id, label, actor, severity)
  where at is not null
  order by at desc
  limit greatest(p_limit, 1);
$$;

comment on function admin_activity_feed(integer) is
  'One merged stream of platform events. Each source answers to its own capability, read once per call, and the limit is applied after filtering so a narrow role still gets a full page.';

create or replace function admin_global_search(q text)
returns table (group_name text, id text, title text, subtitle text, href text)
language sql stable security definer set search_path = public, pg_temp as $$
  -- The needle already cross-joins into every branch, so the capabilities ride
  -- along with it rather than earning a second CTE.
  with needle as materialized (
    select '%' || btrim(q) || '%'   as pat,
           admin_can('view_customers') as can_cust,
           admin_can('view_partners')  as can_part,
           admin_can('view_listings')  as can_list,
           admin_can('view_bookings')  as can_book,
           admin_can('view_payments')  as can_pay,
           admin_can('view_support')   as can_supp
  )
  select * from (
    -- The parentheses around each OR group are load-bearing: written as
    -- `can_x and a or b or c` the gate would cover the first term only.
    select 'Clients', p.id::text, coalesce(p.full_name, 'Client'), p.phone,
           '/admin/clients/' || p.id
      from profiles p, needle
     where needle.can_cust
       and (p.full_name ilike needle.pat or p.phone ilike needle.pat
            or p.id::text ilike needle.pat)
    union all
    select 'Partenaires', pa.id::text, pa.business_name, pa.city, '/admin/partenaires/' || pa.id
      from partners pa, needle
     where needle.can_part
       and (pa.business_name ilike needle.pat or pa.email ilike needle.pat
            or pa.city ilike needle.pat)
    union all
    select 'Annonces', l.id::text, l.name, l.city, '/admin/annonces/' || l.id
      from listings l, needle
     where needle.can_list
       and (l.name ilike needle.pat or l.city ilike needle.pat)
    union all
    select 'Réservations', b.reference, b.reference,
           coalesce(b.first_name || ' ' || b.last_name, b.email), '/admin/reservations/' || b.reference
      from bookings b, needle
     where needle.can_book
       and (b.reference ilike needle.pat or b.email ilike needle.pat
            or (b.first_name || ' ' || b.last_name) ilike needle.pat)
    union all
    select 'Transactions', t.id::text, t.reference, t.customer_label, '/admin/paiements/' || t.id
      from payments t, needle
     where needle.can_pay
       and (t.reference ilike needle.pat or t.processor_ref ilike needle.pat
            or t.customer_label ilike needle.pat)
    union all
    select 'Support', s.id::text, s.subject, s.reference, '/admin/support/' || s.id
      from support_tickets s, needle
     where needle.can_supp
       and (s.subject ilike needle.pat or s.reference ilike needle.pat)
  ) hits(group_name, id, title, subtitle, href)
  where length(btrim(q)) >= 2
  limit 30;
$$;

comment on function admin_global_search(text) is
  'One search box across six entity types. Each group answers to its own capability, read once per call, and the limit is applied after filtering so a narrow role gets thirty of what it may read.';
;
