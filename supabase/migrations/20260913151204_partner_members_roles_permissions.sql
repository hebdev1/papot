-- Who may act for a business, and what they may do (spec sections 51-53).
--
-- A partner is a business, not a person: an owner invites staff, and a front
-- desk agent must not see payouts. Until now nothing linked a signed-in user to
-- a partner at all, so "my listings" had no meaning and every partner-facing
-- rule would have had to trust the browser.

create type partner_member_role as enum
  ('owner', 'manager', 'reservations_agent', 'front_desk', 'finance', 'marketing', 'viewer');

create type partner_member_status as enum ('invited', 'active', 'inactive');

create table partner_members (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  -- An invitation exists before the person has an account, so the email is the
  -- link until they sign up.
  email        text not null,
  full_name    text,
  role         partner_member_role not null default 'viewer',
  status       partner_member_status not null default 'invited',
  invited_by   uuid references auth.users(id) on delete set null,
  last_active_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (partner_id, email)
);

create index partner_members_user_idx on partner_members (user_id) where user_id is not null;
create index partner_members_partner_idx on partner_members (partner_id);

create table partner_permissions (
  code       text primary key,
  label_fr   text not null,
  group_name text not null,
  sensitive  boolean not null default false,
  position   smallint not null default 0
);

create table partner_role_permissions (
  role       partner_member_role not null,
  permission text not null references partner_permissions(code) on delete cascade,
  primary key (role, permission)
);

insert into partner_permissions (code, label_fr, group_name, sensitive, position) values
  ('manage_listings',     'Gérer les annonces',        'Annonces',     false, 10),
  ('manage_availability', 'Gérer la disponibilité',    'Annonces',     false, 20),
  ('manage_pricing',      'Gérer les tarifs',          'Annonces',     true,  30),
  ('view_reservations',   'Voir les réservations',     'Réservations', false, 40),
  ('manage_reservations', 'Gérer les réservations',    'Réservations', true,  50),
  ('manage_messages',     'Répondre aux clients',      'Clients',      false, 60),
  ('manage_reviews',      'Répondre aux avis',         'Clients',      false, 70),
  ('view_customers',      'Voir les clients',          'Clients',      false, 80),
  ('view_finance',        'Voir les finances',         'Finance',      true,  90),
  ('manage_payouts',      'Gérer les versements',      'Finance',      true, 100),
  ('manage_promotions',   'Gérer les promotions',      'Marketing',    false,110),
  ('view_analytics',      'Voir les analyses',         'Analyses',     false,120),
  ('manage_staff',        'Gérer l''équipe',           'Entreprise',   true, 130),
  ('manage_documents',    'Gérer les documents',       'Entreprise',   true, 140),
  ('manage_settings',     'Modifier les réglages',     'Entreprise',   true, 150);

-- Owner holds everything, now and as capabilities are added.
insert into partner_role_permissions (role, permission)
select 'owner'::partner_member_role, code from partner_permissions;

insert into partner_role_permissions (role, permission) values
  ('manager','manage_listings'),('manager','manage_availability'),('manager','manage_pricing'),
  ('manager','view_reservations'),('manager','manage_reservations'),('manager','manage_messages'),
  ('manager','manage_reviews'),('manager','view_customers'),('manager','view_finance'),
  ('manager','manage_promotions'),('manager','view_analytics'),('manager','manage_documents'),

  ('reservations_agent','view_reservations'),('reservations_agent','manage_reservations'),
  ('reservations_agent','manage_availability'),('reservations_agent','manage_messages'),
  ('reservations_agent','view_customers'),

  ('front_desk','view_reservations'),('front_desk','manage_reservations'),
  ('front_desk','view_customers'),('front_desk','manage_messages'),

  ('finance','view_finance'),('finance','manage_payouts'),('finance','view_reservations'),
  ('finance','view_analytics'),

  ('marketing','manage_promotions'),('marketing','manage_reviews'),('marketing','view_analytics'),
  ('marketing','manage_listings'),

  ('viewer','view_reservations'),('viewer','view_analytics');

-- The gates. Mirrors admin_can(): computed in the database so hiding a menu is
-- never what protects anything.
create or replace function my_partner_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select partner_id from partner_members
   where user_id = auth.uid() and status = 'active';
$$;

create or replace function partner_can(p_partner uuid, perm text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from partner_members m
    join partner_role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.partner_id = p_partner
      and rp.permission = perm
  );
$$;

/** True when the caller may do `perm` for at least one business. */
create or replace function is_partner_member()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from partner_members
                  where user_id = auth.uid() and status = 'active');
$$;

create or replace function partner_me()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object(
        'partner_id', p.id,
        'business_name', p.business_name,
        'type', p.type,
        'status', p.status,
        'verification', p.verification,
        'rating', p.rating,
        'city', p.city,
        'role', m.role,
        'member_status', m.status,
        'permissions', coalesce((select jsonb_agg(rp.permission order by rp.permission)
                                   from partner_role_permissions rp where rp.role = m.role),
                                '[]'::jsonb))
      order by p.business_name)
     from partner_members m
     join partners p on p.id = m.partner_id
    where m.user_id = auth.uid() and m.status = 'active'),
    '[]'::jsonb);
$$;

alter table partner_members enable row level security;
alter table partner_permissions enable row level security;
alter table partner_role_permissions enable row level security;

-- A member always sees their own membership: the client needs it to know which
-- business it is rendering. Seeing colleagues requires manage_staff.
create policy members_self_read on partner_members for select to authenticated
  using (user_id = auth.uid() or partner_can(partner_id, 'manage_staff') or admin_can('view_partners'));

create policy partner_perms_read on partner_permissions for select to authenticated
  using (is_partner_member() or is_staff());
create policy partner_role_perms_read on partner_role_permissions for select to authenticated
  using (is_partner_member() or is_staff());

grant execute on function my_partner_ids() to authenticated;
grant execute on function partner_can(uuid, text) to authenticated;
grant execute on function is_partner_member() to authenticated;
grant execute on function partner_me() to authenticated;
revoke execute on function my_partner_ids() from anon;
revoke execute on function partner_can(uuid, text) from anon;
revoke execute on function is_partner_member() from anon;
revoke execute on function partner_me() from anon;;
