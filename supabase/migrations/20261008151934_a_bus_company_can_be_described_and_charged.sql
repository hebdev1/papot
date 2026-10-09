-- What a transport company may do, what it can declare, and what it is charged.
--
-- Rows, not DDL. Four screens in the product are already data-driven and light
-- up on their own once the catalogue knows about 'bus': the wizard's amenity
-- step reads partner_amenities.applies_to, the verification step and the
-- partner's own Verification screen read partner_document_types.applies_to, and
-- the finance pipeline reads commission_rules. Without these rows the wizard
-- would show a bus company the *restaurant* amenities and the *hotel*
-- documents, and every ticket would earn zero commission.
insert into public.partner_permissions (code, label_fr, group_name, sensitive, position) values
  ('manage_fleet',      'Gérer la flotte',           'Transport', false, 160),
  ('manage_network',    'Gérer gares et itinéraires','Transport', false, 170),
  ('manage_departures', 'Gérer les départs',         'Transport', true,  180),
  ('sell_tickets',      'Vendre des billets',        'Transport', true,  190),
  ('board_passengers',  'Embarquer les passagers',   'Transport', false, 200)
on conflict (code) do nothing;

-- The owner's grant was a one-time `select 'owner', code from
-- partner_permissions` (20260913151204:65), so it covers only the fifteen
-- permissions that existed that day. A new capability reaches nobody — not even
-- the owner — unless its rows are inserted here. The restaurant permissions
-- added in 20260914015905 had to do the same.
insert into public.partner_role_permissions (role, permission)
select r.role, p.code
  from (values ('owner'::public.partner_member_role), ('manager')) as r(role)
 cross join (values ('manage_fleet'), ('manage_network'), ('manage_departures'),
                    ('sell_tickets'), ('board_passengers')) as p(code)
on conflict do nothing;

-- A dispatcher moves departures, an agent sells, a boarding agent scans, a
-- driver only reads the manifest of a departure assigned to them. None of the
-- four may see money: view_finance and manage_payouts stay with owner, manager
-- and finance.
insert into public.partner_role_permissions (role, permission) values
  ('dispatcher',     'manage_departures'),
  ('dispatcher',     'manage_fleet'),
  ('dispatcher',     'manage_network'),
  ('dispatcher',     'view_reservations'),
  ('ticket_agent',   'sell_tickets'),
  ('ticket_agent',   'view_reservations'),
  ('ticket_agent',   'view_customers'),
  ('boarding_agent', 'board_passengers'),
  ('boarding_agent', 'view_reservations'),
  ('driver',         'view_reservations')
on conflict do nothing;

-- Four amenities a coach shares with the verticals that already offer them.
-- The wizard keys an amenity by amenitySlug(label) and so does this table, so
-- the label a bus company ticks must be the label that produced the code.
update public.partner_amenities
   set applies_to = array_append(applies_to, 'bus'::public.partner_type)
 where code in ('wi_fi', 'climatisation', 'usb', 'acces_handicape')
   and not ('bus' = any (applies_to));

insert into public.partner_amenities (code, label_fr, applies_to, position) values
  ('television',          'Télévision',         array['bus']::public.partner_type[], 80),
  ('sieges_inclinables',  'Sièges inclinables', array['bus']::public.partner_type[], 81),
  ('toilettes_a_bord',    'Toilettes à bord',   array['bus']::public.partner_type[], 82),
  ('soute_a_bagages',     'Soute à bagages',    array['bus']::public.partner_type[], 83),
  ('eau_offerte',         'Eau offerte',        array['bus']::public.partner_type[], 84),
  ('collation',           'Collation',          array['bus']::public.partner_type[], 85),
  ('prises_electriques',  'Prises électriques', array['bus']::public.partner_type[], 86)
on conflict (code) do nothing;

-- The five shared documents every business supplies. DOCS_SHARED in the wizard
-- lists them for all verticals, so they must list 'bus' back or the required-set
-- check in attach_application_documents refuses a complete file.
update public.partner_document_types
   set applies_to = array_append(applies_to, 'bus'::public.partner_type)
 where code in ('piece_d_identite_passeport',
                'registre_du_commerce_carte_d_identite_fiscale',
                'justificatif_de_domicile',
                'nif_numero_fiscal',
                'licence_commerciale')
   and not ('bus' = any (applies_to));

insert into public.partner_document_types (code, label_fr, applies_to, required, position) values
  ('licence_de_transport_public', 'Licence de transport public',
   array['bus']::public.partner_type[], true,  13),
  ('assurance_de_la_flotte', 'Assurance de la flotte',
   array['bus']::public.partner_type[], true,  14),
  ('carte_grise_des_autocars', 'Carte grise des autocars',
   array['bus']::public.partner_type[], true,  15),
  ('controle_technique_des_autocars', 'Contrôle technique des autocars',
   array['bus']::public.partner_type[], false, 16),
  ('permis_des_chauffeurs', 'Permis des chauffeurs',
   array['bus']::public.partner_type[], false, 17)
on conflict (code) do nothing;

-- platform_settings only displays a rate; effective_commission reads
-- commission_rules. Both are seeded here, at the same figure, so the number
-- shown in the console and the number charged cannot part company on day one —
-- the exact failure AGENTS.md records for the other four verticals.
insert into public.platform_settings (key, group_name, label_fr, value, value_type, position)
values ('commission_bus', 'Commissions', 'Commission transport', '10', 'percent', 195)
on conflict (key) do nothing;

insert into public.commission_rules (scope, partner_type, label, percentage, active)
select 'partner_type', 'bus'::public.partner_type, 'Commission transport',
       (ps.value)::numeric, true
  from public.platform_settings ps
 where ps.key = 'commission_bus'
   and not exists (select 1 from public.commission_rules r
                    where r.scope = 'partner_type'
                      and r.partner_type = 'bus'::public.partner_type);;
