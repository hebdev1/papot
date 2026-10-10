-- An applicant could not see their own file.
--
-- `partner_applications` carries two policies, both for staff
-- (`applications_staff_read`, `applications_staff_write`). The person who
-- filled the form in had no way to read back a single field of it — so the
-- partner space could only tell them "Aucun établissement rattaché", which is
-- both true and useless to somebody waiting on a decision.
--
-- A policy would be the obvious fix, but it would expose the whole row:
-- payout details, documents, the internal review note. This returns the four
-- facts a waiting applicant actually needs, and nothing else.
--
-- Scoped to `auth.uid()` by construction — it takes no argument, so there is
-- no id to tamper with, and it cannot return somebody else's dossier. Granted
-- to `authenticated` only; `anon` has no dossier to ask about.
create or replace function public.my_partner_application()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select jsonb_build_object(
           'business_name', a.business_name,
           'type',          a.type,
           'status',        a.status,
           'submitted_at',  coalesce(a.submitted_at, a.created_at))
    from public.partner_applications a
   where a.user_id = auth.uid()
   order by a.created_at desc
   limit 1
$fn$;

revoke execute on function public.my_partner_application() from public;
revoke execute on function public.my_partner_application() from anon;
grant execute on function public.my_partner_application() to authenticated;;