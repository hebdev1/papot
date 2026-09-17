-- "Transition invalide: new -> accepted" every time an admin approved a fresh
-- application: the review screen offers Approuver, Escalader, Demander des
-- changements and Refuser side by side on any file, but the trigger only let a
-- `new` row move to `reviewing` or `rejected`. The primary action on the screen
-- was the one path the database refused.
--
-- Two parts of one feature disagreed, and the trigger is the half nobody wired
-- the screen to: `new -> rejected` was already allowed, so refusing took one
-- click and approving took two. `admin_decide_application` *is* the act of
-- reviewing, and it already stamps reviewed_by and reviewed_at and writes an
-- audit row. `reviewing` stays for "I have claimed this and not decided yet".
create or replace function public.enforce_application_transition()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('accepted', 'rejected') then
    raise exception 'La demande est déjà % et ne peut plus changer d''état.', old.status;
  end if;
  if old.status = 'new' and new.status not in ('reviewing', 'accepted', 'rejected') then
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
$function$;
;
