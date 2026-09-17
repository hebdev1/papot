-- The owner lookup only tried the business address. On a real dossier the
-- business address is often a shared mailbox with no PAPOT account, while the
-- applicant's personal address does have one -- so the person who filled the
-- form was left unlinked from the business they had just created.
--
-- Both addresses are tried, business first, then personal.
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

    v_owner := a.user_id;

    -- Try the business address, then the personal one. The membership is keyed
    -- to whichever actually has an account, so the invitation lands somewhere
    -- the applicant can reach.
    if v_owner is null then
      select id into v_owner from auth.users
       where lower(email) = lower(btrim(coalesce(a.business_email, '')))
         and btrim(coalesce(a.business_email, '')) <> '';
    end if;
    if v_owner is null then
      select id into v_owner from auth.users
       where lower(email) = lower(btrim(coalesce(a.email, '')))
         and btrim(coalesce(a.email, '')) <> '';
    end if;

    v_email := coalesce(
      (select lower(email) from auth.users where id = v_owner),
      lower(btrim(coalesce(a.business_email, a.email, ''))));

    insert into partners (application_id, owner_id, type, business_name, legal_name,
                          owner_name, email, phone, city, department, country,
                          status, verification, joined_at)
    values (a.id, v_owner, a.type, a.business_name, a.legal_name,
            nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
            coalesce(a.business_email, a.email), coalesce(a.business_phone, a.phone),
            a.city, a.department, coalesce(a.country, 'Haïti'),
            'active', 'verified', now())
    returning id into v_partner;

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
