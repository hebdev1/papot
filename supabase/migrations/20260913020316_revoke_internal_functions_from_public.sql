-- Postgres grants EXECUTE on new functions to PUBLIC, so revoking from anon and
-- authenticated alone changed nothing: both roles inherit PUBLIC. The grant has
-- to be taken from PUBLIC itself.
revoke execute on function admin_log(text, text, text, text, jsonb, jsonb, text, text) from public;
revoke execute on function audit_row_change() from public;
revoke execute on function sync_profile_email() from public;
revoke execute on function handle_new_user() from public;

-- And future functions should not be handed out to PUBLIC by default either.
alter default privileges in schema public revoke execute on functions from public;;
