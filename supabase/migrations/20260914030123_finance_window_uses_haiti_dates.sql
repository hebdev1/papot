-- The window is built from the Port-au-Prince date, but the payments were
-- filtered on `created_at::date`, which casts in the session's zone — UTC. A
-- payment taken at 22 h 50 in Haiti landed on the next UTC day and fell out of
-- "today". Both ends of the comparison have to speak the same clock.
do $fix$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restaurant_finance';

  v_new := replace(v_def,
    '         and p.created_at::date between v_from and v_to',
    '         and (p.created_at at time zone ''America/Port-au-Prince'')::date between v_from and v_to');

  if v_new = v_def then
    raise exception 'Le correctif ne s''applique pas : la fonction a changé.';
  end if;

  execute v_new;
end
$fix$;
;
