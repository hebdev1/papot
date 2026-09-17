-- A customer had no account state, so "suspended account" (spec sections 10-12)
-- could not be represented at all.
create type customer_status as enum ('active', 'suspended', 'closed');

alter table profiles add column email text;
alter table profiles add column country text;
alter table profiles add column status customer_status not null default 'active';
alter table profiles add column suspended_reason text;
alter table profiles add column suspended_at timestamptz;
alter table profiles add column last_seen_at timestamptz;
alter table profiles add column risk_flags text[] not null default '{}';

-- Email lives in auth.users, which the client may never read. Mirroring it onto
-- the profile is what lets every admin list filter and search by email without
-- a SECURITY DEFINER wrapper around each query.
update profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''),
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Keep the mirror honest when a user changes their address later.
create or replace function sync_profile_email()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger sync_profile_email_trg
  after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function sync_profile_email();

-- List views. security_invoker means the caller's RLS still applies, so these
-- widen convenience, never access: a non-staff session sees nothing through them.
create view admin_customer_rows with (security_invoker = on) as
  select p.id, p.full_name, p.email, p.phone, p.country, p.locale, p.status,
         p.risk_flags, p.created_at, p.last_seen_at, p.suspended_reason,
         coalesce(b.bookings, 0) as bookings,
         coalesce(b.spend, 0) as total_spend,
         b.last_booking_at
    from profiles p
    left join lateral (
      select count(*) as bookings, sum(total) as spend, max(created_at) as last_booking_at
        from bookings where user_id = p.id and status <> 'cancelled'
    ) b on true;

create view admin_partner_rows with (security_invoker = on) as
  select pa.id, pa.business_name, pa.type, pa.owner_name, pa.email, pa.phone,
         pa.city, pa.country, pa.status, pa.verification, pa.rating,
         pa.commission_override, pa.created_at, pa.joined_at,
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
    ) po on true;

create view admin_listing_rows with (security_invoker = on) as
  select l.id, l.name, l.kind, l.type, l.city, l.country, l.location, l.price,
         l.currency, l.rating, l.reviews, l.status, l.img, l.updated_at,
         l.submitted_at, l.review_note, l.partner_id,
         pa.business_name as partner_name, pa.type as partner_type,
         coalesce(bk.bookings, 0) as bookings
    from listings l
    left join partners pa on pa.id = l.partner_id
    left join lateral (
      select count(distinct booking_id) as bookings from booking_items where listing_id = l.id
    ) bk on true;

create view admin_reservation_rows with (security_invoker = on) as
  select b.id, b.reference, b.created_at, b.status, b.total, b.currency,
         b.payment_method, b.user_id,
         coalesce(b.first_name || ' ' || b.last_name, b.email) as customer_label,
         b.email as customer_email,
         it.kinds, it.item_count, it.starts_on, it.ends_on, it.first_title,
         it.partner_id, it.partner_name,
         pay.status as payment_status, pay.id as payment_id
    from bookings b
    left join lateral (
      select array_agg(distinct bi.kind::text) as kinds,
             count(*) as item_count,
             min(bi.starts_on) as starts_on,
             max(coalesce(bi.ends_on, bi.starts_on)) as ends_on,
             min(bi.title) as first_title,
             (array_agg(li.partner_id) filter (where li.partner_id is not null))[1] as partner_id,
             (array_agg(pa.business_name) filter (where pa.business_name is not null))[1] as partner_name
        from booking_items bi
        left join listings li on li.id = bi.listing_id
        left join partners pa on pa.id = li.partner_id
       where bi.booking_id = b.id
    ) it on true
    left join lateral (
      select id, status from payments where booking_id = b.id
       order by created_at desc limit 1
    ) pay on true;

grant select on admin_customer_rows, admin_partner_rows,
                admin_listing_rows, admin_reservation_rows to authenticated;;
