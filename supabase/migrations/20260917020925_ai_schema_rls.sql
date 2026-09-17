alter table public.ai_conversations      enable row level security;
alter table public.ai_messages           enable row level security;
alter table public.ai_tool_calls         enable row level security;
alter table public.ai_trip_states        enable row level security;
alter table public.ai_trip_items         enable row level security;
alter table public.ai_preferences        enable row level security;
alter table public.ai_cost_usage         enable row level security;
alter table public.ai_feedback           enable row level security;
alter table public.ai_knowledge_sources  enable row level security;
alter table public.ai_documents          enable row level security;
alter table public.ai_document_chunks    enable row level security;
alter table public.ai_model_configs      enable row level security;

/**
 * A signed-in traveller reads and writes their own conversation directly, which
 * is what the account panel needs.
 *
 * A visitor who has not signed in gets no direct access at all. Their
 * conversation is identified only by a `session_id` the browser holds, and a
 * policy that trusted it would turn a request header into a bearer token — a
 * second authorization system, beside the one that already works. The Edge
 * Function owns those rows instead, and hands the history back in its reply.
 */
create policy ai_conversations_own on public.ai_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy ai_conversations_staff_read on public.ai_conversations
  for select to authenticated
  using (admin_can('view_analytics'));

create policy ai_messages_own on public.ai_messages
  for all to authenticated
  using (exists (select 1 from public.ai_conversations c
                 where c.id = ai_messages.conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_conversations c
                      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()));

create policy ai_messages_staff_read on public.ai_messages
  for select to authenticated
  using (admin_can('view_analytics'));

create policy ai_trip_states_own on public.ai_trip_states
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy ai_trip_items_own on public.ai_trip_items
  for all to authenticated
  using (exists (select 1 from public.ai_trip_states t
                 where t.id = ai_trip_items.trip_state_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_trip_states t
                      where t.id = ai_trip_items.trip_state_id and t.user_id = auth.uid()));

-- §52: the traveller can see, add and forget their own preferences.
create policy ai_preferences_own on public.ai_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy ai_feedback_own on public.ai_feedback
  for insert to authenticated
  with check (exists (select 1 from public.ai_conversations c
                      where c.id = ai_feedback.conversation_id and c.user_id = auth.uid()));

create policy ai_feedback_staff_read on public.ai_feedback
  for select to authenticated
  using (admin_can('view_analytics'));

/**
 * The audit trail and the bill are staff-only, and nobody writes them from a
 * browser. §76 and §93 exist to be read by the people answering for the system,
 * not by the people using it — and a client that could write them could hide
 * its own tool calls.
 */
create policy ai_tool_calls_staff_read on public.ai_tool_calls
  for select to authenticated
  using (admin_can('view_audit_logs') or admin_can('view_analytics'));

create policy ai_cost_usage_staff_read on public.ai_cost_usage
  for select to authenticated
  using (admin_can('view_analytics'));

-- §68: knowledge sources are an administration surface.
create policy ai_knowledge_sources_staff on public.ai_knowledge_sources
  for all to authenticated
  using (admin_can('manage_platform_settings'))
  with check (admin_can('manage_platform_settings'));

create policy ai_documents_staff on public.ai_documents
  for all to authenticated
  using (admin_can('manage_platform_settings'))
  with check (admin_can('manage_platform_settings'));

create policy ai_document_chunks_staff on public.ai_document_chunks
  for all to authenticated
  using (admin_can('manage_platform_settings'))
  with check (admin_can('manage_platform_settings'));

create policy ai_model_configs_staff_read on public.ai_model_configs
  for select to authenticated
  using (is_staff());

create policy ai_model_configs_staff_write on public.ai_model_configs
  for update to authenticated
  using (admin_can('manage_platform_settings'))
  with check (admin_can('manage_platform_settings'));;
