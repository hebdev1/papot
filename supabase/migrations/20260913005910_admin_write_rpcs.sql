-- Every sensitive write goes through one of these. Each checks the permission,
-- performs the change and writes the audit row in a single transaction, so an
-- action cannot happen without leaving a trace, and a trace cannot be written
-- for an action that failed.

create or replace function admin_set_customer_status(
  p_id uuid, p_status customer_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before customer_status; v_name text;
begin
  if not admin_can('suspend_customers') then
    raise exception 'Permission requise : suspend_customers' using errcode = '42501';
  end if;
  if p_status = 'suspended' and length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour suspendre un compte.' using errcode = '23514';
  end if;

  select status, full_name into v_before, v_name from profiles where id = p_id;
  if not found then raise exception 'Client introuvable' using errcode = 'P0002'; end if;

  update profiles
     set status = p_status,
         suspended_reason = case when p_status = 'suspended' then p_reason else null end,
         suspended_at = case when p_status = 'suspended' then now() else null end
   where id = p_id;

  perform admin_log('customer_status_changed', 'customer', p_id::text, v_name,
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status),
    p_reason, case when p_status = 'suspended' then 'warning' else 'notice' end);
end;
$$;

create or replace function admin_set_partner_status(
  p_id uuid, p_status partner_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before partner_status; v_name text;
begin
  if p_status = 'suspended' and not admin_can('suspend_partners') then
    raise exception 'Permission requise : suspend_partners' using errcode = '42501';
  end if;
  if p_status <> 'suspended' and not admin_can('approve_partners') then
    raise exception 'Permission requise : approve_partners' using errcode = '42501';
  end if;
  if p_status in ('suspended', 'rejected') and length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour cette action.' using errcode = '23514';
  end if;

  select status, business_name into v_before, v_name from partners where id = p_id;
  if not found then raise exception 'Partenaire introuvable' using errcode = 'P0002'; end if;

  update partners
     set status = p_status,
         suspended_reason = case when p_status = 'suspended' then p_reason else null end,
         joined_at = case when p_status = 'active' and joined_at is null then now() else joined_at end
   where id = p_id;

  -- Suspending a partner must take their listings off sale in the same
  -- transaction, or the platform keeps selling a business it just suspended.
  if p_status = 'suspended' then
    update listings set status = 'suspended'
     where partner_id = p_id and status in ('published', 'approved', 'paused');
  end if;

  perform admin_log('partner_status_changed', 'partner', p_id::text, v_name,
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status),
    p_reason, case when p_status in ('suspended', 'rejected') then 'warning' else 'notice' end);
end;
$$;

-- Approving an application is what creates the partner. Doing it in SQL keeps
-- the two from drifting apart.
create or replace function admin_decide_application(
  p_id uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a partner_applications%rowtype; v_partner uuid;
begin
  if not admin_can('manage_verification') then
    raise exception 'Permission requise : manage_verification' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'reject', 'request_changes', 'escalate') then
    raise exception 'Décision inconnue : %', p_decision using errcode = '22023';
  end if;
  if p_decision in ('reject', 'request_changes') and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour cette décision.' using errcode = '23514';
  end if;

  select * into a from partner_applications where id = p_id;
  if not found then raise exception 'Dossier introuvable' using errcode = 'P0002'; end if;

  if p_decision = 'accept' then
    if not admin_can('approve_partners') then
      raise exception 'Permission requise : approve_partners' using errcode = '42501';
    end if;

    insert into partners (application_id, owner_id, type, business_name, legal_name,
                          owner_name, email, phone, city, department, country,
                          status, verification, joined_at)
    values (a.id, a.user_id, a.type, a.business_name, a.legal_name,
            nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
            coalesce(a.business_email, a.email), coalesce(a.business_phone, a.phone),
            a.city, a.department, coalesce(a.country, 'Haïti'),
            'active', 'verified', now())
    returning id into v_partner;

    update partner_applications
       set status = 'accepted', reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_note
     where id = p_id;

  elsif p_decision = 'reject' then
    update partner_applications
       set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_note
     where id = p_id;
  else
    update partner_applications
       set status = 'reviewing', reviewed_by = auth.uid(), review_note = p_note
     where id = p_id;
  end if;

  perform admin_log('application_' || p_decision, 'application', p_id::text, a.business_name,
    jsonb_build_object('status', a.status),
    jsonb_build_object('decision', p_decision, 'partner_id', v_partner),
    p_note, case when p_decision = 'reject' then 'warning' else 'notice' end);

  return v_partner;
end;
$$;

create or replace function admin_set_document_status(
  p_application uuid, p_doc_type text, p_status partner_document_status, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not admin_can('manage_verification') then
    raise exception 'Permission requise : manage_verification' using errcode = '42501';
  end if;
  if p_status = 'rejected' and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour refuser un document.' using errcode = '23514';
  end if;

  update partner_application_documents
     set status = p_status, review_note = p_note
   where application_id = p_application and doc_type = p_doc_type;
  if not found then raise exception 'Document introuvable' using errcode = 'P0002'; end if;

  perform admin_log('document_' || p_status, 'application', p_application::text, p_doc_type,
    null, jsonb_build_object('doc_type', p_doc_type, 'status', p_status), p_note, 'info');
end;
$$;

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

create or replace function admin_decide_refund(
  p_id uuid, p_status refund_status, p_final numeric default null, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r refunds%rowtype;
begin
  if not admin_can('issue_refunds') then
    raise exception 'Permission requise : issue_refunds' using errcode = '42501';
  end if;

  select * into r from refunds where id = p_id;
  if not found then raise exception 'Remboursement introuvable' using errcode = 'P0002'; end if;

  if p_status = 'rejected' and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour refuser un remboursement.' using errcode = '23514';
  end if;
  if p_status in ('approved', 'completed') then
    if p_final is null then
      raise exception 'Le montant final est obligatoire.' using errcode = '23514';
    end if;
    if p_final > r.amount_paid then
      raise exception 'Le remboursement (%) dépasse le montant payé (%).', p_final, r.amount_paid
        using errcode = '23514';
    end if;
  end if;

  update refunds
     set status = p_status,
         final_amount = coalesce(p_final, final_amount),
         decision_note = p_note, decided_by = auth.uid(), decided_at = now()
   where id = p_id;

  -- Keep the payment in step with the money actually returned.
  if p_status = 'completed' and r.payment_id is not null then
    update payments
       set status = case when coalesce(p_final, 0) >= amount then 'refunded'
                         else 'partially_refunded' end
     where id = r.payment_id;
  end if;

  perform admin_log('refund_' || p_status, 'refund', p_id::text, r.reference,
    jsonb_build_object('status', r.status),
    jsonb_build_object('status', p_status, 'final_amount', p_final),
    p_note, 'warning');
end;
$$;

create or replace function admin_set_payout_status(
  p_id uuid, p_status payout_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before payout_status; v_ref text; v_net numeric;
begin
  if not admin_can('manage_payouts') then
    raise exception 'Permission requise : manage_payouts' using errcode = '42501';
  end if;
  if p_status = 'held' and length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour retenir un versement.' using errcode = '23514';
  end if;

  select status, reference, net into v_before, v_ref, v_net from payouts where id = p_id;
  if not found then raise exception 'Versement introuvable' using errcode = 'P0002'; end if;

  update payouts
     set status = p_status,
         hold_reason = case when p_status = 'held' then p_reason else null end,
         paid_at = case when p_status = 'paid' then now() else paid_at end
   where id = p_id;

  perform admin_log('payout_' || p_status, 'payout', p_id::text, v_ref,
    jsonb_build_object('status', v_before),
    jsonb_build_object('status', p_status, 'net', v_net), p_reason, 'warning');
end;
$$;

create or replace function admin_moderate_review(
  p_id uuid, p_status review_status, p_flag review_flag default null, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before review_status;
begin
  if not admin_can('moderate_reviews') then
    raise exception 'Permission requise : moderate_reviews' using errcode = '42501';
  end if;
  if p_status in ('removed', 'hidden') and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour masquer ou retirer un avis.' using errcode = '23514';
  end if;

  select status into v_before from reviews where id = p_id;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;

  update reviews
     set status = p_status, flag = p_flag, flag_note = p_note,
         moderated_by = auth.uid(), moderated_at = now()
   where id = p_id;

  perform admin_log('review_' || p_status, 'review', p_id::text, null,
    jsonb_build_object('status', v_before),
    jsonb_build_object('status', p_status, 'flag', p_flag), p_note,
    case when p_status = 'removed' then 'warning' else 'info' end);
end;
$$;

create or replace function admin_resolve_dispute(
  p_id uuid, p_resolution dispute_resolution, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare d disputes%rowtype;
begin
  if not admin_can('resolve_disputes') then
    raise exception 'Permission requise : resolve_disputes' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Une explication est obligatoire pour clore un litige.' using errcode = '23514';
  end if;

  select * into d from disputes where id = p_id;
  if not found then raise exception 'Litige introuvable' using errcode = 'P0002'; end if;

  update disputes
     set status = 'resolved', resolution = p_resolution, resolution_note = p_note,
         resolved_by = auth.uid(), resolved_at = now()
   where id = p_id;

  perform admin_log('dispute_resolved', 'dispute', p_id::text, d.reference,
    jsonb_build_object('status', d.status),
    jsonb_build_object('status', 'resolved', 'resolution', p_resolution), p_note, 'warning');
end;
$$;

create or replace function admin_update_ticket(
  p_id uuid, p_status ticket_status default null,
  p_priority ticket_priority default null, p_assignee uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t support_tickets%rowtype; v_assignee_label text;
begin
  if not admin_can('manage_support') then
    raise exception 'Permission requise : manage_support' using errcode = '42501';
  end if;

  select * into t from support_tickets where id = p_id;
  if not found then raise exception 'Ticket introuvable' using errcode = 'P0002'; end if;

  if p_assignee is not null then
    select full_name into v_assignee_label from staff where user_id = p_assignee;
    if v_assignee_label is null then
      raise exception 'Agent introuvable' using errcode = 'P0002';
    end if;
  end if;

  update support_tickets
     set status = coalesce(p_status, status),
         priority = coalesce(p_priority, priority),
         assigned_to = coalesce(p_assignee, assigned_to),
         assigned_label = coalesce(v_assignee_label, assigned_label),
         resolved_at = case when p_status in ('resolved', 'closed') then now() else resolved_at end,
         updated_at = now()
   where id = p_id;

  perform admin_log('ticket_updated', 'ticket', p_id::text, t.reference,
    jsonb_build_object('status', t.status, 'priority', t.priority),
    jsonb_build_object('status', coalesce(p_status, t.status),
                       'priority', coalesce(p_priority, t.priority),
                       'assigned_to', p_assignee), null, 'info');
end;
$$;

create or replace function admin_reply_ticket(
  p_id uuid, p_body text, p_internal boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_msg uuid; v_label text;
begin
  if not admin_can('manage_support') then
    raise exception 'Permission requise : manage_support' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Le message est vide.' using errcode = '23514';
  end if;

  select full_name into v_label from staff where user_id = auth.uid();

  insert into ticket_messages (ticket_id, author_id, author_label, author_kind, body, internal)
  values (p_id, auth.uid(), v_label, 'agent', p_body, p_internal)
  returning id into v_msg;

  update support_tickets
     set updated_at = now(),
         status = case when status = 'new' then 'open' else status end
   where id = p_id;

  return v_msg;
end;
$$;

create or replace function admin_add_note(p_entity_type text, p_entity_id text, p_body text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_label text;
begin
  if not is_staff() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  select full_name into v_label from staff where user_id = auth.uid();

  insert into internal_notes (entity_type, entity_id, author_id, author_label, body)
  values (p_entity_type, p_entity_id, auth.uid(), v_label, p_body)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_label text;
begin
  if not admin_can('manage_platform_settings') then
    raise exception 'Permission requise : manage_platform_settings' using errcode = '42501';
  end if;

  select value, label_fr into v_before, v_label from platform_settings where key = p_key;
  if not found then raise exception 'Réglage inconnu : %', p_key using errcode = 'P0002'; end if;

  update platform_settings
     set value = p_value, updated_at = now(), updated_by = auth.uid()
   where key = p_key;

  perform admin_log('setting_changed', 'setting', p_key, v_label,
    jsonb_build_object('value', v_before), jsonb_build_object('value', p_value),
    null, 'notice');
end;
$$;

create or replace function admin_set_role_permissions(p_role admin_role, p_permissions text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before text[];
begin
  if not admin_can('manage_staff') then
    raise exception 'Permission requise : manage_staff' using errcode = '42501';
  end if;
  -- The super admin role is the recovery path; narrowing it could lock everyone
  -- out of the permission editor itself.
  if p_role = 'super_admin' then
    raise exception 'Les permissions du super administrateur ne peuvent pas être modifiées.'
      using errcode = '42501';
  end if;

  select array_agg(permission order by permission) into v_before
    from role_permissions where role = p_role;

  delete from role_permissions where role = p_role;
  insert into role_permissions (role, permission)
    select p_role, unnest(p_permissions)
    on conflict do nothing;

  perform admin_log('role_permissions_changed', 'role', p_role::text, p_role::text,
    to_jsonb(v_before), to_jsonb(p_permissions), null, 'critical');
end;
$$;

create or replace function admin_upsert_staff(
  p_email text, p_full_name text, p_role admin_role, p_status staff_status default 'active')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid; v_before admin_role;
begin
  if not admin_can('manage_staff') then
    raise exception 'Permission requise : manage_staff' using errcode = '42501';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Aucun compte PAPOT pour %. La personne doit d''abord créer un compte.', p_email
      using errcode = 'P0002';
  end if;

  -- Never let an admin demote or deactivate themselves out of the console.
  if v_user = auth.uid() and (p_role <> 'super_admin' or p_status <> 'active') then
    select role into v_before from staff where user_id = v_user;
    if v_before = 'super_admin' then
      raise exception 'Vous ne pouvez pas retirer vos propres accès.' using errcode = '42501';
    end if;
  end if;

  select role into v_before from staff where user_id = v_user;

  insert into staff (user_id, full_name, email, role, status, invited_by)
  values (v_user, p_full_name, lower(btrim(p_email)), p_role, p_status, auth.uid())
  on conflict (user_id) do update
    set full_name = excluded.full_name, role = excluded.role, status = excluded.status;

  perform admin_log(case when v_before is null then 'staff_invited' else 'staff_role_changed' end,
    'staff', v_user::text, p_full_name,
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role, 'status', p_status),
    null, 'critical');

  return v_user;
end;
$$;

create or replace function admin_cancel_booking(p_reference text, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare b bookings%rowtype;
begin
  if not admin_can('cancel_bookings') then
    raise exception 'Permission requise : cancel_bookings' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Un motif est obligatoire pour annuler une réservation.' using errcode = '23514';
  end if;

  select * into b from bookings where reference = p_reference;
  if not found then raise exception 'Réservation introuvable' using errcode = 'P0002'; end if;
  if b.status = 'cancelled' then
    raise exception 'Cette réservation est déjà annulée.' using errcode = '23514';
  end if;

  update bookings set status = 'cancelled' where id = b.id;
  update booking_items set status = 'cancelled' where booking_id = b.id;

  perform admin_log('booking_cancelled', 'booking', b.reference, b.reference,
    jsonb_build_object('status', b.status), jsonb_build_object('status', 'cancelled'),
    p_reason, 'warning');
end;
$$;

grant execute on function admin_set_customer_status(uuid, customer_status, text) to authenticated;
grant execute on function admin_set_partner_status(uuid, partner_status, text) to authenticated;
grant execute on function admin_decide_application(uuid, text, text) to authenticated;
grant execute on function admin_set_document_status(uuid, text, partner_document_status, text) to authenticated;
grant execute on function admin_set_listing_status(uuid, listing_status, text) to authenticated;
grant execute on function admin_decide_refund(uuid, refund_status, numeric, text) to authenticated;
grant execute on function admin_set_payout_status(uuid, payout_status, text) to authenticated;
grant execute on function admin_moderate_review(uuid, review_status, review_flag, text) to authenticated;
grant execute on function admin_resolve_dispute(uuid, dispute_resolution, text) to authenticated;
grant execute on function admin_update_ticket(uuid, ticket_status, ticket_priority, uuid) to authenticated;
grant execute on function admin_reply_ticket(uuid, text, boolean) to authenticated;
grant execute on function admin_add_note(text, text, text) to authenticated;
grant execute on function admin_set_setting(text, jsonb) to authenticated;
grant execute on function admin_set_role_permissions(admin_role, text[]) to authenticated;
grant execute on function admin_upsert_staff(text, text, admin_role, staff_status) to authenticated;
grant execute on function admin_cancel_booking(text, text) to authenticated;;
