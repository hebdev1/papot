-- Three functions were reachable over the REST API that never should be.
--
-- admin_log is the one that matters: it only checks is_staff(), so any staff
-- member could have POSTed arbitrary rows into the audit log — inventing
-- actions, or burying real ones in noise. An audit log that its own subjects
-- can write freely is not an audit log. It is called only from inside other
-- SECURITY DEFINER functions, which execute as the owner and need no grant.
revoke execute on function admin_log(text, text, text, text, jsonb, jsonb, text, text)
  from anon, authenticated;

-- Trigger functions are not an API. They are invoked by the trigger, which
-- runs as the table owner.
revoke execute on function audit_row_change() from anon, authenticated;
revoke execute on function sync_profile_email() from anon, authenticated;
revoke execute on function handle_new_user() from anon, authenticated;

-- The permission gate itself has no reason to be callable by a signed-out
-- visitor; it can only ever answer false for them.
revoke execute on function admin_can(text) from anon;
revoke execute on function is_staff() from anon;;
