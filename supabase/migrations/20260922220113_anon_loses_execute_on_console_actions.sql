/**
 * A visitor who never signed in loses the right to *call* the console.
 *
 * Every one of these functions already refuses an outsider: each opens with
 * `admin_can(...)` or `partner_can(...)` and raises. That check is the control,
 * and it held — an audit of all 92 `SECURITY DEFINER` functions found only
 * `admin_me` and `partner_me` without one, and both answer "who am I" from
 * `auth.uid()`, which is empty for a stranger.
 *
 * But the model rested on nobody ever forgetting that first line. A function
 * added in a hurry, without it, would have been reachable by the whole internet
 * the moment it was created. This is the second lock: the door is now also shut
 * to anyone who has not signed in, so a forgotten check is a bug rather than a
 * breach.
 *
 * Six predicates keep their grant, and that is not an oversight. `admin_can`,
 * `partner_can`, `is_staff`, `is_partner_member`, `my_partner_ids` and
 * `partner_me` are called from inside RLS policies and views. A policy runs as
 * the querying role, so revoking these would not make a policy return false —
 * it would make it raise, and every anonymous read of the public catalogue
 * would fail. They reveal nothing: each answers about the caller, and the
 * caller is nobody.
 */
do $do$
declare
  fn record;
  n integer := 0;
  garde constant text[] := array[
    'admin_can', 'partner_can', 'is_staff', 'is_partner_member',
    'my_partner_ids', 'partner_me'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and (p.proname like 'admin\_%' or p.proname like 'partner\_%')
       and not (p.proname = any(garde))
     order by p.proname
  loop
    -- PUBLIC as well as anon: a grant to PUBLIC covers anon, so revoking anon
    -- alone would change nothing at all.
    execute format('revoke execute on function %s from public, anon', fn.sig);
    execute format('grant  execute on function %s to authenticated', fn.sig);
    n := n + 1;
  end loop;

  raise notice 'execute revoked from anon on % console functions', n;
end
$do$;;
