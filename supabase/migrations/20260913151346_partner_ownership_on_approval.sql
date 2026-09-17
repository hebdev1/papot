-- Approving a dossier created a partner nobody could sign in to: owner_id was
-- copied from the application, which is null whenever the form was submitted
-- while signed out -- the common case. The partner existed and was unreachable.
create or replace function admin_decide_application(
  p_id uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a partner_applications%rowtype;
  v_partner uuid;
  v_owner   uuid;
  v_email   text;
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

  perform set_config('papot.admin_rpc', '1', true);

  if p_decision = 'accept' then
    if not admin_can('approve_partners') then
      raise exception 'Permission requise : approve_partners' using errcode = '42501';
    end if;

    v_email := lower(btrim(coalesce(a.business_email, a.email)));

    -- Fall back to matching the address on the dossier, so an applicant who
    -- filled the form signed out still owns the business they created.
    v_owner := a.user_id;
    if v_owner is null and v_email <> '' then
      select id into v_owner from auth.users where lower(email) = v_email;
    end if;

    insert into partners (application_id, owner_id, type, business_name, legal_name,
                          owner_name, email, phone, city, department, country,
                          status, verification, joined_at)
    values (a.id, v_owner, a.type, a.business_name, a.legal_name,
            nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
            coalesce(a.business_email, a.email), coalesce(a.business_phone, a.phone),
            a.city, a.department, coalesce(a.country, 'Haïti'),
            'active', 'verified', now())
    returning id into v_partner;

    -- The owner membership is what makes the partner dashboard reachable. It is
    -- created even when no account exists yet: the row is an invitation keyed by
    -- email, and claim_partner_invitations() attaches it at first sign-in.
    if v_email <> '' then
      insert into partner_members (partner_id, user_id, email, full_name, role, status, invited_by)
      values (v_partner, v_owner, v_email,
              nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
              'owner',
              case when v_owner is null then 'invited' else 'active' end,
              auth.uid())
      on conflict (partner_id, email) do nothing;
    end if;

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
    jsonb_build_object('decision', p_decision, 'partner_id', v_partner, 'owner_id', v_owner),
    p_note, case when p_decision = 'reject' then 'warning' else 'notice' end);

  return v_partner;
end;
$$;

/**
 * Attaches pending invitations to the signed-in account.
 *
 * An invitation is written against an email before that person has an account.
 * This runs when the partner dashboard loads, so signing up after being invited
 * is enough -- no token to lose, no second flow to maintain.
 */
create or replace function claim_partner_invitations()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text; v_count integer;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;

  update partner_members
     set user_id = auth.uid(),
         status  = case when status = 'invited' then 'active' else status end,
         last_active_at = now()
   where lower(email) = v_email and user_id is null;
  get diagnostics v_count = row_count;

  update partner_members set last_active_at = now() where user_id = auth.uid();

  -- A business with no owner_id but an active owner member now has one.
  update partners p set owner_id = m.user_id
    from partner_members m
   where m.partner_id = p.id and m.role = 'owner' and m.user_id = auth.uid()
     and p.owner_id is null;

  return v_count;
end;
$$;

/** Lets an admin attach or change a partner's team (spec section 51). */
create or replace function admin_set_partner_member(
  p_partner uuid, p_email text, p_full_name text,
  p_role partner_member_role default 'owner', p_status partner_member_status default 'invited')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid; v_id uuid; v_name text;
begin
  if not admin_can('approve_partners') then
    raise exception 'Permission requise : approve_partners' using errcode = '42501';
  end if;

  select business_name into v_name from partners where id = p_partner;
  if v_name is null then raise exception 'Partenaire introuvable' using errcode = 'P0002'; end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));

  insert into partner_members (partner_id, user_id, email, full_name, role, status, invited_by)
  values (p_partner, v_user, lower(btrim(p_email)), p_full_name, p_role,
          case when v_user is null then 'invited' else p_status end, auth.uid())
  on conflict (partner_id, email) do update
    set role = excluded.role, full_name = excluded.full_name,
        user_id = coalesce(partner_members.user_id, excluded.user_id),
        status = excluded.status
  returning id into v_id;

  if p_role = 'owner' and v_user is not null then
    update partners set owner_id = v_user where id = p_partner and owner_id is null;
  end if;

  perform admin_log('partner_member_set', 'partner', p_partner::text, v_name, null,
    jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role), null, 'warning');

  return v_id;
end;
$$;

grant execute on function claim_partner_invitations() to authenticated;
grant execute on function admin_set_partner_member(uuid, text, text, partner_member_role, partner_member_status) to authenticated;
revoke execute on function claim_partner_invitations() from anon;
revoke execute on function admin_set_partner_member(uuid, text, text, partner_member_role, partner_member_status) from anon;
grant insert, update, delete on partner_members to authenticated;

create policy members_manage on partner_members for all to authenticated
  using (partner_can(partner_id, 'manage_staff'))
  with check (partner_can(partner_id, 'manage_staff'));;
