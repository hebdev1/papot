create type review_status as enum ('pending', 'published', 'hidden', 'flagged', 'removed');
create type review_flag as enum
  ('spam', 'harassment', 'fake', 'prohibited_content', 'conflict_of_interest', 'other');

create table reviews (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references listings(id) on delete cascade,
  partner_id    uuid references partners(id) on delete set null,
  booking_id    uuid references bookings(id) on delete set null,
  customer_id   uuid references auth.users(id) on delete set null,
  customer_label text,
  rating        smallint not null check (rating between 1 and 5),
  title         text,
  body          text,
  status        review_status not null default 'pending',
  flag          review_flag,
  flag_note     text,
  partner_reply text,
  moderated_by  uuid references auth.users(id) on delete set null,
  moderated_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index reviews_status_idx on reviews (status, created_at desc);
create index reviews_listing_idx on reviews (listing_id);

create type dispute_category as enum
  ('customer_vs_partner', 'payment', 'service_not_delivered', 'property_issue',
   'vehicle_issue', 'restaurant_issue', 'refund');
create type dispute_status as enum ('open', 'investigating', 'awaiting_evidence', 'resolved', 'closed');
create type dispute_resolution as enum
  ('for_customer', 'for_partner', 'partial', 'refund', 'credit', 'warning', 'partner_suspended');

create table disputes (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  booking_id         uuid references bookings(id) on delete set null,
  booking_ref        text,
  customer_id        uuid references auth.users(id) on delete set null,
  customer_label     text,
  partner_id         uuid references partners(id) on delete set null,
  category           dispute_category not null,
  amount             numeric(12,2),
  customer_statement text,
  partner_statement  text,
  status             dispute_status not null default 'open',
  resolution         dispute_resolution,
  resolution_note    text,
  resolved_by        uuid references auth.users(id) on delete set null,
  resolved_at        timestamptz,
  opened_at          timestamptz not null default now(),
  -- A resolved dispute must say how it was resolved.
  check (status <> 'resolved' or resolution is not null)
);

create type ticket_status as enum
  ('new', 'open', 'waiting_customer', 'waiting_partner', 'escalated', 'resolved', 'closed');
create type ticket_priority as enum ('low', 'normal', 'high', 'urgent');

create table support_tickets (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique,
  subject      text not null,
  category     text,
  customer_id  uuid references auth.users(id) on delete set null,
  partner_id   uuid references partners(id) on delete set null,
  requester_label text,
  booking_id   uuid references bookings(id) on delete set null,
  booking_ref  text,
  priority     ticket_priority not null default 'normal',
  status       ticket_status not null default 'new',
  assigned_to  uuid references auth.users(id) on delete set null,
  assigned_label text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index tickets_status_idx on support_tickets (status, updated_at desc);

create table ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references support_tickets(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  author_label text,
  author_kind text not null check (author_kind in ('customer', 'partner', 'agent', 'system')),
  body       text not null,
  -- Spec section 35: internal notes must never be visible to customers or
  -- partners. Enforced by the SELECT policy below, not by the UI.
  internal   boolean not null default false,
  created_at timestamptz not null default now()
);

create index ticket_messages_ticket_idx on ticket_messages (ticket_id, created_at);

-- Customer <-> partner threads. Admin access is deliberately a separate,
-- sensitive permission (spec section 36).
create table conversations (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in
              ('customer_partner', 'customer_support', 'partner_support', 'system')),
  customer_id uuid references auth.users(id) on delete set null,
  partner_id  uuid references partners(id) on delete set null,
  booking_id  uuid references bookings(id) on delete set null,
  subject     text,
  last_message_at timestamptz,
  message_count integer not null default 0,
  created_at  timestamptz not null default now()
);

create table conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  sender_label    text,
  body            text not null,
  created_at      timestamptz not null default now()
);

alter table reviews enable row level security;
alter table disputes enable row level security;
alter table support_tickets enable row level security;
alter table ticket_messages enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;

create policy reviews_public_read on reviews for select to anon, authenticated
  using (status = 'published');
create policy reviews_own_read on reviews for select to authenticated
  using (customer_id = auth.uid());
create policy reviews_staff_read on reviews for select to authenticated
  using (admin_can('view_reviews'));
create policy reviews_staff_write on reviews for update to authenticated
  using (admin_can('moderate_reviews')) with check (admin_can('moderate_reviews'));

create policy disputes_staff_read on disputes for select to authenticated
  using (admin_can('view_disputes'));
create policy disputes_own_read on disputes for select to authenticated
  using (customer_id = auth.uid());
create policy disputes_staff_write on disputes for update to authenticated
  using (admin_can('resolve_disputes')) with check (admin_can('resolve_disputes'));

create policy tickets_staff_read on support_tickets for select to authenticated
  using (admin_can('view_support'));
create policy tickets_own_read on support_tickets for select to authenticated
  using (customer_id = auth.uid());
create policy tickets_staff_write on support_tickets for update to authenticated
  using (admin_can('manage_support')) with check (admin_can('manage_support'));

-- The requester sees the public conversation; only staff see internal notes.
create policy ticket_messages_staff_read on ticket_messages for select to authenticated
  using (admin_can('view_support'));
create policy ticket_messages_requester_read on ticket_messages for select to authenticated
  using (
    internal = false
    and exists (select 1 from support_tickets t
                where t.id = ticket_id and t.customer_id = auth.uid())
  );
create policy ticket_messages_staff_insert on ticket_messages for insert to authenticated
  with check (admin_can('manage_support') and author_id = auth.uid());

create policy conversations_staff_read on conversations for select to authenticated
  using (admin_can('view_messages'));
create policy conversations_own_read on conversations for select to authenticated
  using (customer_id = auth.uid());
create policy conv_messages_staff_read on conversation_messages for select to authenticated
  using (admin_can('view_messages'));
create policy conv_messages_own_read on conversation_messages for select to authenticated
  using (exists (select 1 from conversations c
                 where c.id = conversation_id and c.customer_id = auth.uid()));;
