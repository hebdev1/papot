-- A trip remembers what happened to it.
--
-- A delay, a cancellation and a check-in are all facts a passenger will dispute
-- and a company will have to answer for, so they are recorded as events rather
-- than inferred from the current state of a row. `bus_departures.status` says
-- where a coach is now; this table says how it got there, who decided it, and
-- why.
--
-- Nothing writes here directly. The table has no write policy at all, and every
-- row is inserted by a SECURITY DEFINER lifecycle function in the same
-- transaction as the change it records. An audit trail a caller can forge, or
-- can forget to write, is not an audit trail.

create table public.bus_trip_events (
  id           uuid primary key default gen_random_uuid(),
  departure_id uuid not null references public.bus_departures (id) on delete cascade,
  ticket_id    uuid references public.bus_tickets (id) on delete set null,
  kind         text not null check (kind in (
                 'status_changed', 'delayed', 'cancelled', 'reinstated',
                 'ticket_cancelled', 'checked_in', 'checkin_undone',
                 'staff_assigned', 'staff_removed', 'note')),
  actor        uuid references auth.users (id) on delete set null,
  from_value   text,
  to_value     text,
  reason       text,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index bus_trip_events_departure_idx
  on public.bus_trip_events (departure_id, created_at desc);

create index bus_trip_events_ticket_idx
  on public.bus_trip_events (ticket_id) where ticket_id is not null;

alter table public.bus_trip_events enable row level security;

create policy bus_trip_events_partner_read on public.bus_trip_events
  for select using (
    exists (
      select 1 from public.bus_departures d
        join public.listings l on l.id = d.listing_id
       where d.id = bus_trip_events.departure_id
         and (l.partner_id in (select public.my_partner_ids())
              or public.admin_can('view_bookings'))));

-- A departure can name the people who run it.
--
-- This exists for one reason that is not convenience. A driver must see the
-- manifest of the coach they are driving and of no other, and without a row
-- saying which departure is theirs, "driver" could only be expressed as "sees
-- every passenger the company has ever sold to" — the opposite of what the
-- role is for.

create table public.bus_staff_assignments (
  id           uuid primary key default gen_random_uuid(),
  departure_id uuid not null references public.bus_departures (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('driver', 'boarding_agent', 'hostess')),
  assigned_by  uuid references auth.users (id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (departure_id, user_id, role)
);

create index bus_staff_assignments_user_idx
  on public.bus_staff_assignments (user_id, departure_id);

alter table public.bus_staff_assignments enable row level security;

create policy bus_staff_assignments_read on public.bus_staff_assignments
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.bus_departures d
        join public.listings l on l.id = d.listing_id
       where d.id = bus_staff_assignments.departure_id
         and (l.partner_id in (select public.my_partner_ids())
              or public.admin_can('view_bookings'))));

create policy bus_staff_assignments_write on public.bus_staff_assignments
  for all using (
    exists (
      select 1 from public.bus_departures d
        join public.listings l on l.id = d.listing_id
       where d.id = bus_staff_assignments.departure_id
         and public.partner_can(l.partner_id, 'manage_departures')))
  with check (
    exists (
      select 1 from public.bus_departures d
        join public.listings l on l.id = d.listing_id
       where d.id = bus_staff_assignments.departure_id
         and public.partner_can(l.partner_id, 'manage_departures')));;