-- Admin control model: staff, roles, granular permissions.
-- Nothing here is enforced in the browser alone; every admin read and write is
-- gated in the database by admin_can(), so a forged client cannot widen access.

create type admin_role as enum (
  'super_admin', 'operations_manager', 'partner_manager', 'finance_manager',
  'support_agent', 'content_manager', 'marketing_manager', 'analyst', 'risk_manager'
);

create type staff_status as enum ('invited', 'active', 'inactive');

create table staff (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  role          admin_role not null,
  status        staff_status not null default 'invited',
  job_title     text,
  last_login_at timestamptz,
  invited_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- The permission catalogue. A table rather than an enum so a new capability is
-- a row, not a type migration, and so the UI can render the real list.
create table admin_permissions (
  code       text primary key,
  label_fr   text not null,
  group_name text not null,
  -- Destructive permissions are surfaced differently in the role editor.
  sensitive  boolean not null default false,
  position   smallint not null default 0
);

create table role_permissions (
  role       admin_role not null,
  permission text not null references admin_permissions(code) on delete cascade,
  primary key (role, permission)
);

insert into admin_permissions (code, label_fr, group_name, sensitive, position) values
  ('view_customers',           'Voir les clients',                'Clients',     false, 10),
  ('edit_customers',           'Modifier les clients',            'Clients',     false, 11),
  ('suspend_customers',        'Suspendre un client',             'Clients',     true,  12),
  ('view_partners',            'Voir les partenaires',            'Partenaires', false, 20),
  ('approve_partners',         'Approuver un partenaire',         'Partenaires', true,  21),
  ('suspend_partners',         'Suspendre un partenaire',         'Partenaires', true,  22),
  ('manage_verification',      'Traiter les vérifications',       'Partenaires', true,  23),
  ('view_listings',            'Voir les annonces',               'Annonces',    false, 30),
  ('moderate_listings',        'Modérer les annonces',            'Annonces',    true,  31),
  ('view_bookings',            'Voir les réservations',           'Réservations',false, 40),
  ('modify_bookings',          'Modifier une réservation',        'Réservations',true,  41),
  ('cancel_bookings',          'Annuler une réservation',         'Réservations',true,  42),
  ('view_payments',            'Voir les paiements',              'Finance',     false, 50),
  ('issue_refunds',            'Émettre un remboursement',        'Finance',     true,  51),
  ('manage_payouts',           'Gérer les versements',            'Finance',     true,  52),
  ('manage_commissions',       'Gérer les commissions',           'Finance',     true,  53),
  ('view_reviews',             'Voir les avis',                   'Opérations',  false, 60),
  ('moderate_reviews',         'Modérer les avis',                'Opérations',  true,  61),
  ('view_disputes',            'Voir les litiges',                'Opérations',  false, 62),
  ('resolve_disputes',         'Résoudre un litige',              'Opérations',  true,  63),
  ('view_support',             'Voir le support',                 'Opérations',  false, 64),
  ('manage_support',           'Traiter les tickets',             'Opérations',  false, 65),
  ('view_messages',            'Voir les messages',               'Opérations',  true,  66),
  ('manage_promotions',        'Gérer les promotions',            'Marketing',   false, 70),
  ('manage_content',           'Gérer le contenu',                'Contenu',     false, 80),
  ('view_analytics',           'Voir les analyses',               'Analyses',    false, 90),
  ('manage_staff',             'Gérer le personnel',              'Système',     true, 100),
  ('view_audit_logs',          'Voir le journal d''audit',        'Système',     false,101),
  ('view_security',            'Voir la sécurité',                'Système',     false,102),
  ('manage_security',          'Agir sur la sécurité',            'Système',     true, 103),
  ('manage_platform_settings', 'Configurer la plateforme',        'Système',     true, 104);

-- Super admin holds every permission, now and as new ones are added.
insert into role_permissions (role, permission)
select 'super_admin'::admin_role, code from admin_permissions;

insert into role_permissions (role, permission) values
  ('operations_manager','view_customers'),('operations_manager','view_partners'),
  ('operations_manager','view_listings'),('operations_manager','moderate_listings'),
  ('operations_manager','view_bookings'),('operations_manager','modify_bookings'),
  ('operations_manager','cancel_bookings'),('operations_manager','view_reviews'),
  ('operations_manager','moderate_reviews'),('operations_manager','view_disputes'),
  ('operations_manager','resolve_disputes'),('operations_manager','view_support'),
  ('operations_manager','manage_support'),('operations_manager','manage_verification'),
  ('operations_manager','view_analytics'),('operations_manager','view_payments'),

  ('partner_manager','view_partners'),('partner_manager','approve_partners'),
  ('partner_manager','suspend_partners'),('partner_manager','manage_verification'),
  ('partner_manager','view_listings'),('partner_manager','moderate_listings'),
  ('partner_manager','view_bookings'),('partner_manager','view_analytics'),

  ('finance_manager','view_payments'),('finance_manager','issue_refunds'),
  ('finance_manager','manage_payouts'),('finance_manager','manage_commissions'),
  ('finance_manager','view_bookings'),('finance_manager','view_partners'),
  ('finance_manager','view_analytics'),

  ('support_agent','view_customers'),('support_agent','view_bookings'),
  ('support_agent','view_partners'),('support_agent','view_support'),
  ('support_agent','manage_support'),('support_agent','view_reviews'),

  ('content_manager','manage_content'),('content_manager','view_listings'),
  ('content_manager','view_analytics'),

  ('marketing_manager','manage_promotions'),('marketing_manager','manage_content'),
  ('marketing_manager','view_analytics'),('marketing_manager','view_customers'),

  ('analyst','view_analytics'),('analyst','view_customers'),('analyst','view_partners'),
  ('analyst','view_listings'),('analyst','view_bookings'),('analyst','view_payments'),

  ('risk_manager','view_security'),('risk_manager','manage_security'),
  ('risk_manager','view_customers'),('risk_manager','suspend_customers'),
  ('risk_manager','view_payments'),('risk_manager','view_disputes'),
  ('risk_manager','resolve_disputes'),('risk_manager','view_audit_logs'),
  ('risk_manager','view_bookings');

-- The two gates every admin policy is built on.
create or replace function admin_can(perm text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from staff s
    join role_permissions rp on rp.role = s.role
    where s.user_id = auth.uid()
      and s.status = 'active'
      and rp.permission = perm
  );
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from staff where user_id = auth.uid() and status = 'active');
$$;

alter table staff enable row level security;
alter table admin_permissions enable row level security;
alter table role_permissions enable row level security;

-- A staff member always sees their own row: the client needs it to know which
-- navigation to render. Seeing anyone else's requires manage_staff.
create policy staff_self_read on staff for select to authenticated
  using (user_id = auth.uid() or admin_can('manage_staff'));
create policy staff_write on staff for all to authenticated
  using (admin_can('manage_staff')) with check (admin_can('manage_staff'));

create policy perms_read on admin_permissions for select to authenticated using (is_staff());
create policy role_perms_read on role_permissions for select to authenticated using (is_staff());
create policy role_perms_write on role_permissions for all to authenticated
  using (admin_can('manage_staff')) with check (admin_can('manage_staff'));

grant execute on function admin_can(text) to authenticated;
grant execute on function is_staff() to authenticated;;
