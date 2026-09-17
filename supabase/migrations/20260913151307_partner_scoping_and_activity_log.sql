-- Partner-visible history (spec section 69). Separate from admin_audit_log:
-- these are a business's own actions, shown to that business.
create table partner_activity_log (
  id          bigint generated always as identity primary key,
  partner_id  uuid not null references partners(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_label text,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  entity_label text,
  detail      jsonb,
  at          timestamptz not null default now()
);

create index partner_activity_idx on partner_activity_log (partner_id, at desc);

alter table partner_activity_log enable row level security;
create policy partner_activity_read on partner_activity_log for select to authenticated
  using (partner_id in (select my_partner_ids()) or admin_can('view_partners'));

/**
 * Records a change on a partner-owned row.
 *
 * Admin RPCs set papot.admin_rpc for the transaction, because they already
 * write their own audit entry with a reason; without that flag an approval
 * would be logged twice and the partner's own history would fill with
 * platform actions.
 */
create or replace function log_partner_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row     jsonb;
  v_partner uuid;
  v_label   text;
begin
  if coalesce(current_setting('papot.admin_rpc', true), '') = '1' then
    return coalesce(new, old);
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_partner := nullif(v_row ->> 'partner_id', '')::uuid;

  -- listing_units and friends hang off a listing rather than a partner.
  if v_partner is null and (v_row ? 'listing_id') then
    select l.partner_id into v_partner from listings l
     where l.id = (v_row ->> 'listing_id')::uuid;
  end if;

  if v_partner is null or auth.uid() is null then
    return coalesce(new, old);
  end if;

  select full_name into v_label from partner_members
   where user_id = auth.uid() and partner_id = v_partner;

  insert into partner_activity_log (partner_id, actor_id, actor_label, action,
                                    entity_type, entity_id, entity_label, detail)
  values (v_partner, auth.uid(), v_label, lower(tg_op) || '_' || tg_table_name,
          tg_table_name, v_row ->> 'id',
          coalesce(v_row ->> 'name', v_row ->> 'title'),
          case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old)) else null end);

  return coalesce(new, old);
end;
$$;

-- Admin RPCs that touch partner-owned rows announce themselves, so the
-- partner's history stays the partner's and the audit log stays the audit log.
create or replace function admin_set_listing_status(
  p_id uuid, p_status listing_status, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before listing_status; v_name text;
begin
  if not admin_can('moderate_listings') then
    raise exception 'Permission requise : moderate_listings' using errcode = '42501';
  end if;
  if p_status in ('rejected', 'suspended') and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour cette action.' using errcode = '23514';
  end if;

  perform set_config('papot.admin_rpc', '1', true);

  select status, name into v_before, v_name from listings where id = p_id;
  if not found then raise exception 'Annonce introuvable' using errcode = 'P0002'; end if;

  update listings
     set status = p_status, review_note = p_note,
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;

  perform admin_log('listing_' || p_status, 'listing', p_id::text, v_name,
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status),
    p_note, case when p_status in ('rejected', 'suspended') then 'warning' else 'notice' end);
end;
$$;

-- Listings become writable again, scoped by policy rather than by grant, and
-- every direct write now leaves a trace in one log or the other.
grant insert, update, delete on listings to authenticated;

create trigger listings_partner_activity
  after insert or update or delete on listings
  for each row execute function log_partner_change();

create policy listings_partner_read on listings for select to authenticated
  using (partner_id in (select my_partner_ids()));
create policy listings_partner_insert on listings for insert to authenticated
  with check (partner_can(partner_id, 'manage_listings'));
create policy listings_partner_update on listings for update to authenticated
  using (partner_can(partner_id, 'manage_listings'))
  with check (partner_can(partner_id, 'manage_listings'));
create policy listings_partner_delete on listings for delete to authenticated
  using (partner_can(partner_id, 'manage_listings'));

-- The business itself: readable by its members, editable with manage_settings.
create policy partners_member_read on partners for select to authenticated
  using (id in (select my_partner_ids()));
create policy partners_member_update on partners for update to authenticated
  using (partner_can(id, 'manage_settings'))
  with check (partner_can(id, 'manage_settings'));
grant update on partners to authenticated;

-- Reservations: a partner sees a booking when one of its lines is theirs.
create policy bookings_partner_read on bookings for select to authenticated
  using (exists (
    select 1 from booking_items bi
    join listings l on l.id = bi.listing_id
    where bi.booking_id = bookings.id
      and l.partner_id in (select my_partner_ids())
      and partner_can(l.partner_id, 'view_reservations')));

create policy booking_items_partner_read on booking_items for select to authenticated
  using (exists (
    select 1 from listings l
    where l.id = booking_items.listing_id
      and l.partner_id in (select my_partner_ids())
      and partner_can(l.partner_id, 'view_reservations')));

-- Money is a separate permission from operations.
create policy payouts_partner_read on payouts for select to authenticated
  using (partner_can(partner_id, 'view_finance'));
create policy payments_partner_read on payments for select to authenticated
  using (partner_id is not null and partner_can(partner_id, 'view_finance'));
create policy invoices_partner_read on invoices for select to authenticated
  using (partner_id is not null and partner_can(partner_id, 'view_finance'));

-- Reviews: visible to the business, answerable with manage_reviews. A partner
-- can reply but never delete: moderation stays with the platform.
create policy reviews_partner_read on reviews for select to authenticated
  using (partner_can(partner_id, 'view_customers') or partner_can(partner_id, 'manage_reviews'));
create policy reviews_partner_reply on reviews for update to authenticated
  using (partner_can(partner_id, 'manage_reviews'))
  with check (partner_can(partner_id, 'manage_reviews'));

-- Supporting listing tables follow their listing.
create policy units_partner_all on listing_units for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')));

create policy menu_items_partner_all on menu_items for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')));

create policy car_details_partner_all on car_details for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')));

create policy restaurant_details_partner_all on restaurant_details for all to authenticated
  using (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')))
  with check (exists (select 1 from listings l where l.id = listing_id
                  and partner_can(l.partner_id, 'manage_listings')));

grant insert, update, delete on listing_units, menu_items, car_details, restaurant_details
  to authenticated;

create trigger units_partner_activity after insert or update or delete on listing_units
  for each row execute function log_partner_change();
create trigger menu_items_partner_activity after insert or update or delete on menu_items
  for each row execute function log_partner_change();;
