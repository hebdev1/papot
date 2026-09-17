-- TRUNCATE is a table privilege that row-level security does not filter, and the
-- default grants handed it to anon on every table in public. Verified: an
-- anonymous role could truncate destinations, platform_settings and the audit
-- log itself. RLS was never protecting against this. Nothing in the app needs
-- TRUNCATE, TRIGGER or REFERENCES, and anon writes nothing directly.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;

-- Future tables must not re-acquire what was just revoked.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges in schema public
  revoke insert, update, delete on tables from anon;

-- The admin reads these directly; RLS restricts every row to staff (there is no
-- owner policy on bookings, so customers still reach their own only via RPC).
grant select on bookings, booking_items, trips, partner_applications,
                partner_application_documents, partner_application_rooms,
                partner_application_vehicles, partner_application_hours,
                partner_application_amenities
  to authenticated;

-- Workflow writes must go through the audited RPCs, so the direct paths close.
-- A status change that leaves no audit row is now impossible, not merely
-- discouraged: the only writable route runs admin_log in the same transaction.
revoke insert, update, delete on
  staff, role_permissions, partners, listings, refunds, payouts, reviews,
  disputes, support_tickets, ticket_messages, platform_settings, payments,
  invoices, bookings, booking_items, partner_applications,
  partner_application_documents, admin_audit_log, security_events
  from authenticated;

-- Editorial tables stay directly writable: they are ordinary CRUD, not workflow.
grant insert, update, delete on
  promotions, featured_placements, content_blocks, notification_campaigns,
  commission_rules, destinations, internal_notes, admin_saved_views
  to authenticated;

-- ...but they are audited by trigger, so a direct edit is recorded too.
create or replace function audit_row_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_label text;
  v_row   jsonb;
  v_prev  jsonb;
begin
  v_row  := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_prev := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  select full_name into v_label from staff where user_id = auth.uid();

  insert into admin_audit_log (admin_id, admin_label, action, entity_type, entity_id,
                               entity_label, previous, next, severity)
  values (auth.uid(), v_label, lower(tg_op) || '_' || tg_table_name, tg_table_name,
          v_row ->> 'id',
          coalesce(v_row ->> 'name', v_row ->> 'title', v_row ->> 'label',
                   v_row ->> 'city', v_row ->> 'key'),
          v_prev, case when tg_op = 'DELETE' then null else v_row end,
          case when tg_op = 'DELETE' then 'warning' else 'info' end);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_promotions after insert or update or delete on promotions
  for each row execute function audit_row_change();
create trigger audit_featured after insert or update or delete on featured_placements
  for each row execute function audit_row_change();
create trigger audit_content after insert or update or delete on content_blocks
  for each row execute function audit_row_change();
create trigger audit_campaigns after insert or update or delete on notification_campaigns
  for each row execute function audit_row_change();
create trigger audit_commissions after insert or update or delete on commission_rules
  for each row execute function audit_row_change();
create trigger audit_destinations after insert or update or delete on destinations
  for each row execute function audit_row_change();;
