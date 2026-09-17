-- A partner_application is a submission; a partner is a business trading on the
-- platform. They were the same thing until now, which is why nothing could
-- express "approved partner, currently suspended".
create type partner_status as enum ('pending', 'active', 'suspended', 'rejected', 'inactive');
create type verification_status as enum ('unverified', 'pending', 'in_review', 'verified', 'rejected', 'expired');

create table partners (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid references partner_applications(id) on delete set null,
  owner_id        uuid references auth.users(id) on delete set null,
  type            partner_type not null,
  business_name   text not null,
  legal_name      text,
  owner_name      text,
  email           text,
  phone           text,
  city            text,
  department      text,
  country         text not null default 'Haïti',
  status          partner_status not null default 'pending',
  verification    verification_status not null default 'unverified',
  -- Null means "use the rule for this partner type" (spec section 30).
  commission_override numeric(5,2) check (commission_override between 0 and 100),
  rating          numeric(2,1) check (rating between 0 and 5),
  suspended_reason text,
  joined_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index partners_status_idx on partners (status);
create index partners_type_idx on partners (type);

-- A published boolean cannot express "pending review" or "suspended", which is
-- the entire subject of the listing review workspace (spec sections 17-19).
create type listing_status as enum
  ('draft', 'pending_review', 'approved', 'published', 'paused', 'rejected', 'suspended', 'archived');

alter table listings add column partner_id uuid references partners(id) on delete set null;
alter table listings add column status listing_status not null default 'draft';
alter table listings add column submitted_at timestamptz;
alter table listings add column reviewed_at timestamptz;
alter table listings add column reviewed_by uuid references auth.users(id) on delete set null;
alter table listings add column review_note text;
alter table listings add column updated_at timestamptz not null default now();

-- Existing rows are live on the site, so they are published, not drafts.
update listings set status = 'published' where published = true;
update listings set status = 'paused'    where published = false;

create index listings_status_idx on listings (status);
create index listings_partner_idx on listings (partner_id);

-- published stays the single source of truth for what the public site serves,
-- so an admin status change cannot leave the two disagreeing.
create or replace function sync_listing_published()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.published := (new.status = 'published');
  new.updated_at := now();
  return new;
end;
$$;

create trigger listings_sync_published
  before insert or update of status on listings
  for each row execute function sync_listing_published();

alter table partners enable row level security;

-- Anyone may see an active partner's public identity (a listing shows its host).
create policy partners_public_read on partners for select to anon, authenticated
  using (status = 'active');
create policy partners_staff_read on partners for select to authenticated
  using (admin_can('view_partners'));
create policy partners_staff_write on partners for update to authenticated
  using (admin_can('approve_partners') or admin_can('suspend_partners'))
  with check (admin_can('approve_partners') or admin_can('suspend_partners'));
create policy partners_staff_insert on partners for insert to authenticated
  with check (admin_can('approve_partners'));

-- Staff need to see listings the public cannot (drafts, rejected, suspended).
create policy listings_staff_read on listings for select to authenticated
  using (admin_can('view_listings'));
create policy listings_staff_write on listings for update to authenticated
  using (admin_can('moderate_listings')) with check (admin_can('moderate_listings'));

-- Applications are the verification queue, so staff must be able to read and
-- decide them. Insert stays anonymous-friendly for the public partner form.
create policy applications_staff_read on partner_applications for select to authenticated
  using (admin_can('view_partners'));
create policy applications_staff_write on partner_applications for update to authenticated
  using (admin_can('manage_verification')) with check (admin_can('manage_verification'));
create policy app_docs_staff_read on partner_application_documents for select to authenticated
  using (admin_can('manage_verification'));
create policy app_docs_staff_write on partner_application_documents for update to authenticated
  using (admin_can('manage_verification')) with check (admin_can('manage_verification'));
create policy app_rooms_staff_read on partner_application_rooms for select to authenticated
  using (admin_can('view_partners'));
create policy app_vehicles_staff_read on partner_application_vehicles for select to authenticated
  using (admin_can('view_partners'));
create policy app_hours_staff_read on partner_application_hours for select to authenticated
  using (admin_can('view_partners'));
create policy app_amenities_staff_read on partner_application_amenities for select to authenticated
  using (admin_can('view_partners'));;
