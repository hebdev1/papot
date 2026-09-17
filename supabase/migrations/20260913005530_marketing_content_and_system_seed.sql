create type promotion_kind as enum
  ('percentage', 'fixed', 'free_service', 'promo_code', 'partner', 'destination', 'seasonal');
create type promotion_status as enum ('draft', 'scheduled', 'active', 'paused', 'expired');

create table promotions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code           text unique,
  kind           promotion_kind not null,
  discount_value numeric(10,2),
  usage_limit    integer check (usage_limit is null or usage_limit > 0),
  used_count     integer not null default 0,
  min_spend      numeric(12,2),
  starts_on      date,
  ends_on        date,
  eligible_kinds listing_kind[],
  eligible_partners uuid[],
  status         promotion_status not null default 'draft',
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  -- A promo code campaign without a code cannot be redeemed.
  check (kind <> 'promo_code' or code is not null),
  check (used_count >= 0)
);

create table featured_placements (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('listing', 'destination', 'partner')),
  entity_id   uuid not null,
  entity_label text,
  placement   text not null check (placement in
              ('homepage_hero', 'homepage_grid', 'search_top', 'destination_page', 'newsletter')),
  priority    smallint not null default 0,
  starts_on   date,
  ends_on     date,
  target_market text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create type campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'cancelled');

create table notification_campaigns (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  audience     text not null check (audience in
               ('all_customers', 'all_partners', 'hotel_partners', 'guesthouse_partners',
                'car_partners', 'restaurant_partners', 'selected_users', 'selected_regions')),
  audience_filter jsonb,
  channels     text[] not null default '{in_app}',
  cta_label    text,
  cta_url      text,
  scheduled_at timestamptz,
  sent_at      timestamptz,
  recipients   integer,
  status       campaign_status not null default 'draft',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Editorial content: static pages, FAQs, policies, banners, announcements.
create type content_status as enum ('draft', 'published', 'archived');

create table content_blocks (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in
             ('page', 'faq', 'policy', 'help_article', 'banner', 'announcement', 'homepage')),
  slug       text not null,
  title      text not null,
  body       text,
  locale     text not null default 'fr',
  category   text,
  status     content_status not null default 'draft',
  position   smallint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (kind, slug, locale)
);

alter table promotions enable row level security;
alter table featured_placements enable row level security;
alter table notification_campaigns enable row level security;
alter table content_blocks enable row level security;

create policy promotions_staff_read on promotions for select to authenticated using (is_staff());
create policy promotions_staff_write on promotions for all to authenticated
  using (admin_can('manage_promotions')) with check (admin_can('manage_promotions'));

create policy featured_public_read on featured_placements for select to anon, authenticated
  using (active and (starts_on is null or starts_on <= current_date)
                and (ends_on is null or ends_on >= current_date));
create policy featured_staff_write on featured_placements for all to authenticated
  using (admin_can('manage_promotions')) with check (admin_can('manage_promotions'));

create policy campaigns_staff_read on notification_campaigns for select to authenticated using (is_staff());
create policy campaigns_staff_write on notification_campaigns for all to authenticated
  using (admin_can('manage_content')) with check (admin_can('manage_content'));

create policy content_public_read on content_blocks for select to anon, authenticated
  using (status = 'published');
create policy content_staff_read on content_blocks for select to authenticated using (is_staff());
create policy content_staff_write on content_blocks for all to authenticated
  using (admin_can('manage_content')) with check (admin_can('manage_content'));

-- Staff need destinations management (spec section 41).
create policy destinations_staff_write on destinations for all to authenticated
  using (admin_can('manage_content')) with check (admin_can('manage_content'));

-- Staff read access to the booking tables the admin is built on.
create policy bookings_staff_read on bookings for select to authenticated
  using (admin_can('view_bookings'));
create policy booking_items_staff_read on booking_items for select to authenticated
  using (admin_can('view_bookings'));
create policy bookings_staff_write on bookings for update to authenticated
  using (admin_can('modify_bookings') or admin_can('cancel_bookings'))
  with check (admin_can('modify_bookings') or admin_can('cancel_bookings'));
create policy profiles_staff_read on profiles for select to authenticated
  using (admin_can('view_customers'));
create policy trips_staff_read on trips for select to authenticated
  using (admin_can('view_bookings'));

-- Monitored dependencies, seeded with what the platform actually depends on.
insert into system_services (key, label_fr, status, position) values
  ('api',        'API',                   'operational', 10),
  ('database',   'Base de données',       'operational', 20),
  ('payments',   'Processeur de paiement','operational', 30),
  ('email',      'Courriel',              'degraded',    40),
  ('sms',        'SMS',                   'maintenance', 50),
  ('push',       'Notifications push',    'operational', 60),
  ('storage',    'Stockage de fichiers',  'operational', 70),
  ('search',     'Recherche',             'operational', 80),
  ('maps',       'Cartes',                'operational', 90);

-- Email is genuinely degraded on this project: the built-in sender is rate
-- limited until custom SMTP is configured, which is what blocks signup.
update system_services
   set detail_fr = 'Limite d''envoi du fournisseur intégré atteinte. Configurer un SMTP personnalisé.'
 where key = 'email';
update system_services
   set detail_fr = 'Aucun fournisseur SMS configuré.'
 where key = 'sms';

insert into platform_settings (key, group_name, label_fr, value, value_type, position) values
  ('platform_name',      'Général',     'Nom de la plateforme',      '"PAPOT"',        'text',    10),
  ('support_email',      'Général',     'Courriel du support',       '"support@papot.ht"', 'text', 20),
  ('support_phone',      'Général',     'Téléphone du support',      '"+509 3712 4408"','text',   30),
  ('default_country',    'Localisation','Pays par défaut',           '"Haïti"',        'text',    40),
  ('default_currency',   'Devise',      'Devise par défaut',         '"USD"',          'select',  50),
  ('default_language',   'Localisation','Langue par défaut',         '"fr"',           'select',  60),
  ('timezone',           'Localisation','Fuseau horaire',            '"America/Port-au-Prince"','text', 70),
  ('date_format',        'Localisation','Format de date',            '"DD/MM/YYYY"',   'select',  80),
  ('time_format',        'Localisation','Format d''heure',           '"24h"',          'select',  90),
  ('min_booking_notice_hours','Réservation','Préavis minimum (heures)','2',            'number', 100),
  ('max_advance_days',   'Réservation', 'Réservation à l''avance (jours)','365',       'number', 110),
  ('reservation_expiry_minutes','Réservation','Expiration d''une réservation (min)','30','number',120),
  ('payment_deadline_hours','Réservation','Délai de paiement (heures)','24',           'number', 130),
  ('grace_period_hours', 'Réservation', 'Période de grâce (heures)',  '1',             'number', 140),
  ('commission_default', 'Commissions', 'Commission par défaut',      '12',            'percent',150),
  ('commission_hotel',   'Commissions', 'Commission hôtels',          '15',            'percent',160),
  ('commission_guesthouse','Commissions','Commission maisons d''hôtes','12',           'percent',170),
  ('commission_car',     'Commissions', 'Commission voitures',        '10',            'percent',180),
  ('commission_restaurant','Commissions','Commission restaurants',    '8',             'percent',190),
  ('payout_delay_days',  'Versements',  'Délai de versement (jours)', '7',             'number', 200),
  ('payout_minimum',     'Versements',  'Versement minimum',          '50',            'money',  210),
  ('accept_card',        'Paiements',   'Carte bancaire',             'true',          'boolean',220),
  ('accept_mobile_money','Paiements',   'Mobile money',               'true',          'boolean',230),
  ('accept_bank_transfer','Paiements',  'Virement bancaire',          'false',         'boolean',240),
  ('require_mfa_staff',  'Sécurité',    'MFA obligatoire pour le personnel','false',   'boolean',250),
  ('maintenance_mode',   'Sécurité',    'Mode maintenance',           'false',         'boolean',260);;
