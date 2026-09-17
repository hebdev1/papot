-- Status may only move forward: new -> reviewing -> accepted | rejected.
create or replace function public.enforce_application_transition()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('accepted', 'rejected') then
    raise exception 'La demande est déjà % et ne peut plus changer d''état.', old.status;
  end if;
  if old.status = 'new' and new.status not in ('reviewing', 'rejected') then
    raise exception 'Transition invalide: % -> %.', old.status, new.status;
  end if;
  if old.status = 'reviewing' and new.status not in ('accepted', 'rejected') then
    raise exception 'Transition invalide: % -> %.', old.status, new.status;
  end if;

  new.reviewed_at := now();
  new.reviewed_by := coalesce(new.reviewed_by, auth.uid());

  if new.status = 'rejected' and coalesce(trim(new.review_note), '') = '' then
    raise exception 'Un motif est requis pour rejeter une demande.';
  end if;
  return new;
end;
$$;

create trigger partner_application_transition
  before update of status on public.partner_applications
  for each row execute function public.enforce_application_transition();

-- Safe numeric parsing: a bad string fails loudly instead of becoming null.
create or replace function public.parse_int(p jsonb, p_field text)
returns integer language plpgsql immutable as $$
declare v text := nullif(trim(p #>> '{}'), '');
begin
  if v is null then return null; end if;
  if v !~ '^-?[0-9]+$' then
    raise exception '% doit être un nombre entier (reçu: "%").', p_field, v;
  end if;
  return v::integer;
end;
$$;

create or replace function public.parse_num(p jsonb, p_field text)
returns numeric language plpgsql immutable as $$
declare v text := nullif(trim(replace(p #>> '{}', ',', '.')), '');
begin
  if v is null then return null; end if;
  if v !~ '^-?[0-9]+(\.[0-9]+)?$' then
    raise exception '% doit être un montant valide (reçu: "%").', p_field, v;
  end if;
  return v::numeric;
end;
$$;;
