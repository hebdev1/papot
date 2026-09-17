create or replace function admin_set_partner_commission(p_id uuid, p_percentage numeric)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before numeric; v_name text;
begin
  if not admin_can('manage_commissions') then
    raise exception 'Permission requise : manage_commissions' using errcode = '42501';
  end if;
  if p_percentage is not null and (p_percentage < 0 or p_percentage > 100) then
    raise exception 'La commission doit être comprise entre 0 et 100 %%.' using errcode = '23514';
  end if;

  select commission_override, business_name into v_before, v_name from partners where id = p_id;
  if not found then raise exception 'Partenaire introuvable' using errcode = 'P0002'; end if;

  update partners set commission_override = p_percentage where id = p_id;

  perform admin_log('partner_commission_changed', 'partner', p_id::text, v_name,
    jsonb_build_object('commission_override', v_before),
    jsonb_build_object('commission_override', p_percentage), null, 'warning');
end;
$$;

grant execute on function admin_set_partner_commission(uuid, numeric) to authenticated;

-- The unified money journal (spec §27). A view, not a table, so it can never
-- drift from the payments, refunds and payouts it summarises.
create view admin_transactions with (security_invoker = on) as
  select p.id, 'payment' as kind, p.reference,
         coalesce(p.customer_label, p.booking_ref) as label,
         p.amount, 'in' as direction, p.status::text as status, p.created_at as at
    from payments p
   where admin_can('view_payments')
  union all
  select r.id, 'refund', r.reference,
         coalesce(r.customer_label, r.booking_ref),
         coalesce(r.final_amount, r.requested_amount), 'out', r.status::text,
         coalesce(r.decided_at, r.created_at)
    from refunds r
   where admin_can('view_payments')
  union all
  select po.id, 'payout', po.reference,
         (select business_name from partners where id = po.partner_id),
         po.net, 'out', po.status::text, coalesce(po.paid_at, po.created_at)
    from payouts po
   where admin_can('view_payments');

grant select on admin_transactions to authenticated;

create or replace function admin_funnel()
returns table (stage text, value bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from (values
    ('search'::text,       0::bigint),
    ('listing_view',       0::bigint),
    ('checkout',           (select count(*) from bookings)),
    ('payment',            (select count(*) from payments where status = 'paid')),
    ('confirmed',          (select count(*) from bookings where status = 'confirmed'))
  ) f(stage, value)
  where admin_can('view_analytics');
$$;

grant execute on function admin_funnel() to authenticated;

drop view if exists admin_listing_rows;
create view admin_listing_rows with (security_invoker = on) as
  select l.id, l.name, l.kind, l.type, l.city, l.country, l.location, l.price,
         l.currency, l.rating, l.reviews, l.status, l.img, l.updated_at,
         l.submitted_at, l.review_note, l.partner_id,
         l.amenities, l.free_cancellation, l.breakfast, l.attrs,
         pa.business_name as partner_name, pa.type as partner_type,
         coalesce(bk.bookings, 0) as bookings
    from listings l
    left join partners pa on pa.id = l.partner_id
    left join lateral (
      select count(distinct booking_id) as bookings from booking_items where listing_id = l.id
    ) bk on true
   where admin_can('view_listings');

drop view if exists admin_partner_rows;
create view admin_partner_rows with (security_invoker = on) as
  select pa.id, pa.application_id, pa.business_name, pa.type, pa.owner_name, pa.email, pa.phone,
         pa.city, pa.country, pa.status, pa.verification, pa.rating,
         pa.commission_override, pa.created_at, pa.joined_at, pa.suspended_reason,
         coalesce(l.total, 0) as listings,
         coalesce(l.published, 0) as published_listings,
         coalesce(r.bookings, 0) as bookings,
         coalesce(r.revenue, 0) as revenue,
         coalesce(po.outstanding, 0) as outstanding_payout
    from partners pa
    left join lateral (
      select count(*) as total, count(*) filter (where status = 'published') as published
        from listings where partner_id = pa.id
    ) l on true
    left join lateral (
      select count(distinct bi.booking_id) as bookings, sum(bi.amount) as revenue
        from booking_items bi
        join listings li on li.id = bi.listing_id
       where li.partner_id = pa.id
    ) r on true
    left join lateral (
      select sum(net) as outstanding from payouts
       where partner_id = pa.id and status in ('ready', 'processing', 'held')
    ) po on true
   where admin_can('view_partners');

grant select on admin_listing_rows, admin_partner_rows to authenticated;

-- The amenities screen groups by category; the catalogue had none.
alter table partner_amenities add column category text;

update partner_amenities set category = case
  when code like 'wifi%' or code like '%internet%' then 'Connectivité'
  when code like '%parking%' or code like '%navette%' or code like '%transfert%' then 'Accès'
  when code like '%piscine%' or code like '%plage%' or code like '%jardin%'
       or code like '%terrasse%' or code like '%vue%' then 'Extérieur'
  when code like '%clim%' or code like '%generat%' or code like '%inverter%'
       or code like '%eau%' or code like '%solaire%' then 'Confort et énergie'
  when code like '%cuisine%' or code like '%petit%' or code like '%restaurant%'
       or code like '%bar%' then 'Restauration'
  when code like '%gardien%' or code like '%securit%' or code like '%coffre%' then 'Sécurité'
  else 'Autres'
end;;
