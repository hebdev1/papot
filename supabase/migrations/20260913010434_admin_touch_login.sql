-- Last login is shown in the staff table and the Security Center. Recorded on
-- the admin's own behalf, so it cannot be set for anyone else.
create or replace function admin_touch_login()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_staff() then return; end if;

  update staff set last_login_at = now() where user_id = auth.uid();

  insert into security_events (kind, severity, user_id, user_label, detail)
  select 'admin_login', 'info', auth.uid(), s.full_name,
         jsonb_build_object('role', s.role)
    from staff s where s.user_id = auth.uid();
end;
$$;

grant execute on function admin_touch_login() to authenticated;;
