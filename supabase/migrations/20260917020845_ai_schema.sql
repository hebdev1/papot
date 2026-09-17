create extension if not exists vector;

create type public.ai_mode as enum ('explore', 'plan', 'assist');
create type public.ai_role as enum ('user', 'assistant', 'system', 'tool');
create type public.ai_trip_status as enum ('draft', 'planning', 'ready', 'held', 'booked', 'cancelled');
create type public.ai_availability as enum ('unknown', 'available', 'limited', 'unavailable');
create type public.ai_item_booking as enum ('planned', 'held', 'booked', 'cancelled');

/**
 * A planning conversation.
 *
 * `user_id` is null for a visitor who has not signed in — §101 lets anyone
 * plan, compare and simulate — and `session_id` is then the only thing that
 * identifies the conversation. It is a secret the browser holds, so it is long
 * and random, and the RLS policy below treats it as a bearer token.
 */
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text not null,
  language text not null default 'fr',
  mode public.ai_mode not null default 'plan',
  trip_state_id uuid,
  status text not null default 'open',
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_session_check check (length(session_id) >= 16)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role public.ai_role not null,
  content text not null default '',
  -- §79: a response carries prose and a UI payload, and the payload is what
  -- the page renders. Keeping it beside the text stops the front end from
  -- parsing prose to find out what to draw.
  structured_content jsonb,
  token_count integer,
  created_at timestamptz not null default now()
);

/**
 * §76. Every tool call, with its latency. Inputs are redacted before they land
 * here: an audit trail that stores what §88 forbids sending to a provider
 * would simply move the problem into the database.
 */
create table public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  message_id uuid references public.ai_messages(id) on delete set null,
  tool_name text not null,
  input_json jsonb,
  output_status text not null,
  error_reason text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

/**
 * §16. The trip lives on the server. Chat history is not a trip: a model asked
 * to remember twelve turns of edits will lose one, and the one it loses will be
 * the price.
 */
create table public.ai_trip_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text not null,
  request jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  budget jsonb not null default '{}'::jsonb,
  itinerary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  status public.ai_trip_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations
  add constraint ai_conversations_trip_fkey
  foreign key (trip_state_id) references public.ai_trip_states(id) on delete set null;

create table public.ai_trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_state_id uuid not null references public.ai_trip_states(id) on delete cascade,
  kind text not null,
  listing_id uuid references public.listings(id) on delete set null,
  unit_id uuid references public.listing_units(id) on delete set null,
  package_id uuid references public.partner_packages(id) on delete set null,
  title text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  quantity smallint not null default 1,
  guests smallint,
  pricing jsonb not null default '{}'::jsonb,
  -- Defaults to `unknown`, and that is the point: nothing may claim a thing is
  -- available until a tool has said so (§84.2).
  availability public.ai_availability not null default 'unknown',
  booking_status public.ai_item_booking not null default 'planned',
  alternative boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

-- §51. Explicit and few: §50 forbids storing every message as memory.
create table public.ai_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  key text not null,
  value jsonb not null,
  confidence numeric(3,2) not null default 1.00,
  source text not null default 'stated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, key),
  constraint ai_preferences_confidence_check check (confidence >= 0 and confidence <= 1)
);

create table public.ai_cost_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  tool_calls smallint not null default 0,
  estimated_cost numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);

create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  message_id uuid references public.ai_messages(id) on delete cascade,
  helpful boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

-- §32–§35. The RAG floor: created now, filled in Faz 2. Nothing indexes the
-- embedding column before then, and §34 forbids it ever holding price or
-- availability.
create table public.ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  label text not null,
  enabled boolean not null default true,
  priority smallint not null default 100,
  language text,
  visibility text not null default 'public',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ai_knowledge_sources(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  title text not null default '',
  body text not null default '',
  language text not null default 'fr',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.ai_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ai_documents(id) on delete cascade,
  position smallint not null default 0,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- Which model answers is configuration, not code: §11 routes per task, and
-- changing a model must not require a deploy.
create table public.ai_model_configs (
  id uuid primary key default gen_random_uuid(),
  task text not null unique,
  provider text not null default 'anthropic',
  model text not null,
  max_output_tokens integer not null default 2048,
  temperature numeric(3,2),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index ai_tool_calls_conversation_idx on public.ai_tool_calls (conversation_id, created_at);
create index ai_trip_items_state_idx on public.ai_trip_items (trip_state_id, position);
create index ai_conversations_session_idx on public.ai_conversations (session_id);
create index ai_conversations_user_idx on public.ai_conversations (user_id) where user_id is not null;
create index ai_trip_states_session_idx on public.ai_trip_states (session_id);
create index ai_cost_usage_created_idx on public.ai_cost_usage (created_at desc);
create index ai_documents_entity_idx on public.ai_documents (entity_type, entity_id);

insert into public.ai_model_configs (task, provider, model, max_output_tokens, temperature) values
  ('intent',   'anthropic', 'claude-haiku-4-5-20251001', 512,  0.00),
  ('planning', 'anthropic', 'claude-sonnet-5',           4096, 0.30),
  ('concierge','anthropic', 'claude-sonnet-5',           2048, 0.30);;
