-- Which space an account belongs to, decided once, in the database.
--
-- Every guard asked its own question before: the admin console asked
-- `admin_me()`, the partner dashboard asked `partner_me()`, and the traveller
-- area asked nothing at all — so one person could stand in all three. One
-- answer means the three guards cannot disagree.
--
-- Precedence is admin > partner > customer: a staff account is back-office and
-- stays back-office, whatever else is attached to it.
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
    else 'customer'
  end;
$function$;

comment on function public.my_account_space() is
  'admin | partner | customer | anonymous. The one place that decides where a signed-in person belongs.';

grant execute on function public.my_account_space() to anon, authenticated;
;
