-- Approving an application failed with:
--   column "status" is of type partner_member_status but expression is of type text
--
-- The owner-membership insert chose its status with a CASE whose branches were
-- both bare literals. With no typed branch, Postgres resolves the CASE to text,
-- and text has no implicit cast to an enum. admin_set_partner_member has the
-- same shape but one branch is already the enum, which types the expression --
-- which is why only this path broke.
--
-- Casting the result fixes it, and is clearer than relying on a sibling branch
-- to infer the type.
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
              (case when v_owner is null then 'invited' else 'active' end)::partner_member_status,
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
$$;;
