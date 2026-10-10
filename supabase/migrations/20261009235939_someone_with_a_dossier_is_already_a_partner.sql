-- Why a bus company kept landing in the traveller account.
--
-- This function answered 'partner' only when an ACTIVE `partner_members` row
-- existed — and that row is written by `admin_decide_application`, never by
-- signing up. So between submitting the wizard and being approved, an
-- applicant had an auth account and a `partner_applications` row but no
-- membership, the function correctly said 'customer', and every redirect in
-- the app obeyed it: `resolveSpaceHome()` sent them to /compte at login, and
-- `RequireAuth` was happy to keep them there.
--
-- Someone who has filed a dossier is not a traveller. They are a partner
-- whose file is being read, and the partner space is where their file lives.
--
-- A REJECTED applicant goes back to being a traveller, which is the one case
-- where /compte is the right answer: nothing in the partner space belongs to
-- them any more.
--
-- The precedence is unchanged — admin > partner > customer — and the new
-- branch sits last among the partner tests so an active membership still
-- answers first and cheapest.
create or replace function public.my_account_space()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when auth.uid() is null then 'anonymous'
    when exists (select 1 from staff s
                  where s.user_id = auth.uid() and s.status = 'active') then 'admin'
    when exists (select 1 from partner_members m
                  where m.user_id = auth.uid() and m.status = 'active') then 'partner'
    when exists (select 1 from partner_applications a
                  where a.user_id = auth.uid() and a.status <> 'rejected') then 'partner'
    else 'customer'
  end;
$function$;;