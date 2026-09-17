-- Audit log. Append-only by construction: there is no update or delete policy,
-- and rows are written only through admin_log(), so an admin cannot quietly
-- edit the record of what they did.
create table admin_audit_log (
  id           bigint generated always as identity primary key,
  admin_id     uuid references auth.users(id) on delete set null,
  admin_label  text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  entity_label text,
  previous     jsonb,
  next         jsonb,
  reason       text,
  severity     text not null default 'info'
               check (severity in ('info', 'notice', 'warning', 'critical')),
  ip           inet,
  at           timestamptz not null default now()
);

create index admin_audit_at_idx on admin_audit_log (at desc);
create index admin_audit_entity_idx on admin_audit_log (entity_type, entity_id);
create index admin_audit_admin_idx on admin_audit_log (admin_id, at desc);

create or replace function admin_log(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_entity_label text default null,
  p_previous jsonb default null,
  p_next jsonb default null,
  p_reason text default null,
  p_severity text default 'info'
) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
  v_label text;
begin
  if not is_staff() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  select full_name into v_label from staff where user_id = auth.uid();

  insert into admin_audit_log (admin_id, admin_label, action, entity_type, entity_id,
                               entity_label, previous, next, reason, severity)
  values (auth.uid(), v_label, p_action, p_entity_type, p_entity_id,
          p_entity_label, p_previous, p_next, p_reason, p_severity)
  returning id into v_id;

  return v_id;
end;
$$;

alter table admin_audit_log enable row level security;
create policy audit_read on admin_audit_log for select to authenticated
  using (admin_can('view_audit_logs'));

-- Internal notes. Spec section 63: never visible to customers or partners.
-- That is guaranteed here, not in the UI: the only SELECT policy requires staff.
create table internal_notes (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in
              ('customer','partner','booking','refund','dispute','ticket','listing','payout','application')),
  entity_id   text not null,
  author_id   uuid not null references auth.users(id) on delete cascade,
  author_label text,
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index internal_notes_entity_idx on internal_notes (entity_type, entity_id, created_at desc);

alter table internal_notes enable row level security;
create policy notes_read on internal_notes for select to authenticated using (is_staff());
create policy notes_insert on internal_notes for insert to authenticated
  with check (is_staff() and author_id = auth.uid());
-- Notes are history (spec section 63): they are never edited, only added.

-- Security events feed the Security Center (spec section 49).
create table security_events (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in
             ('failed_login','suspicious_session','account_locked','admin_login',
              'high_risk_transaction','mfa_challenge','password_reset')),
  severity   text not null default 'info'
             check (severity in ('info','notice','warning','critical')),
  user_id    uuid references auth.users(id) on delete set null,
  user_label text,
  ip         inet,
  user_agent text,
  detail     jsonb,
  resolved   boolean not null default false,
  at         timestamptz not null default now()
);

create index security_events_at_idx on security_events (at desc);

alter table security_events enable row level security;
create policy security_read on security_events for select to authenticated
  using (admin_can('view_security'));
create policy security_update on security_events for update to authenticated
  using (admin_can('manage_security')) with check (admin_can('manage_security'));

-- Saved views (spec section 60): per-admin filter presets, optionally shared.
create table admin_saved_views (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page     text not null,
  name     text not null,
  filters  jsonb not null default '{}'::jsonb,
  shared   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table admin_saved_views enable row level security;
create policy views_read on admin_saved_views for select to authenticated
  using (is_staff() and (owner_id = auth.uid() or shared));
create policy views_write on admin_saved_views for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and is_staff());

-- Platform settings (spec sections 51-55), grouped, one row per key.
create table platform_settings (
  key         text primary key,
  group_name  text not null,
  label_fr    text not null,
  value       jsonb not null,
  value_type  text not null check (value_type in ('text','number','boolean','select','percent','money')),
  options     jsonb,
  help_fr     text,
  position    smallint not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table platform_settings enable row level security;
create policy settings_read on platform_settings for select to authenticated using (is_staff());
create policy settings_write on platform_settings for update to authenticated
  using (admin_can('manage_platform_settings'))
  with check (admin_can('manage_platform_settings'));

-- Monitored dependencies for the System Status page (spec section 50).
create table system_services (
  key         text primary key,
  label_fr    text not null,
  status      text not null default 'operational'
              check (status in ('operational','degraded','outage','maintenance')),
  detail_fr   text,
  checked_at  timestamptz not null default now(),
  position    smallint not null default 0
);

alter table system_services enable row level security;
create policy services_read on system_services for select to authenticated using (is_staff());

grant execute on function admin_log(text, text, text, text, jsonb, jsonb, text, text) to authenticated;;
