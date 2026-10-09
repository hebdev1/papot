-- Telling people what happened.
--
-- Two tables and no delivery: `notify_event` writes rows, and an edge function
-- drains them. Adding WhatsApp later then touches the worker and nothing in
-- the business logic — the mistake to avoid is a `send_sms()` call buried
-- inside a cancellation, where a provider outage would roll back the refund.
--
-- The fan-out hangs off `bus_trip_events` rather than off the three lifecycle
-- functions. Every one of them already records what it did, with the reason
-- and the actor; a trigger there means the notice and the audit row cannot
-- drift apart, and a future lifecycle function gets its notifications by
-- writing its event, without remembering to.

create type public.notification_channel as enum ('inapp', 'email', 'sms', 'whatsapp', 'push');
create type public.notification_delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  user_id    uuid references auth.users (id) on delete cascade,
  partner_id uuid references public.partners (id) on delete cascade,
  email      text,
  phone      text,
  title      text not null,
  body       text,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  -- A notice nobody can be reached at is not a notice.
  constraint notifications_has_a_recipient
    check (user_id is not null or email is not null or phone is not null
           or partner_id is not null)
);

create index notifications_user_idx    on public.notifications (user_id, created_at desc)
  where user_id is not null;
create index notifications_partner_idx on public.notifications (partner_id, created_at desc)
  where partner_id is not null;

create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel         public.notification_channel not null,
  status          public.notification_delivery_status not null default 'pending',
  provider        text,
  provider_ref    text,
  error           text,
  attempts        smallint not null default 0,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (notification_id, channel)
);

create index notification_deliveries_pending_idx
  on public.notification_deliveries (created_at)
  where status = 'pending';

alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;

-- A person reads their own; a company reads the ones addressed to it. The
-- worker runs with the service role and is not subject to either.
create policy notifications_own_read on public.notifications
  for select using (
    (user_id is not null and user_id = auth.uid())
    or (partner_id is not null and partner_id in (select public.my_partner_ids()))
    or public.admin_can('view_bookings'));

create policy notifications_own_mark_read on public.notifications
  for update using (user_id is not null and user_id = auth.uid())
  with check (user_id is not null and user_id = auth.uid());

create policy notification_deliveries_read on public.notification_deliveries
  for select using (public.admin_can('view_bookings'));

create or replace function public.notify_event(
  p_kind     text,
  p_title    text,
  p_body     text              default null,
  p_user     uuid              default null,
  p_partner  uuid              default null,
  p_email    text              default null,
  p_phone    text              default null,
  p_payload  jsonb             default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_id uuid;
begin
  if p_user is null and p_partner is null
     and nullif(btrim(coalesce(p_email, '')), '') is null
     and nullif(btrim(coalesce(p_phone, '')), '') is null then
    return null;
  end if;

  insert into public.notifications (kind, title, body, user_id, partner_id, email, phone, payload)
  values (p_kind, p_title, p_body, p_user, p_partner,
          nullif(btrim(coalesce(p_email, '')), ''),
          nullif(btrim(coalesce(p_phone, '')), ''),
          coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  -- In-app is immediate: the row above is the delivery.
  insert into public.notification_deliveries (notification_id, channel, status, sent_at)
  values (v_id, 'inapp', 'sent', now());

  if nullif(btrim(coalesce(p_email, '')), '') is not null then
    insert into public.notification_deliveries (notification_id, channel)
    values (v_id, 'email');
  end if;

  return v_id;
end;
$fn$;

revoke execute on function public.notify_event(text, text, text, uuid, uuid, text, text, jsonb) from public;
revoke execute on function public.notify_event(text, text, text, uuid, uuid, text, text, jsonb) from anon;
revoke execute on function public.notify_event(text, text, text, uuid, uuid, text, text, jsonb) from authenticated;

-- The fan-out itself.
create or replace function public.bus_trip_event_notifies()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  d        public.bus_departures;
  l        public.listings;
  v_route  text;
  v_when   text;
  v_title  text;
  v_body   text;
  r        record;
begin
  -- A trip cancellation already cancels each ticket, so the per-ticket events
  -- it raises would notify the same passenger twice. The trip-level notice is
  -- the one that explains why.
  if new.kind = 'ticket_cancelled'
     and coalesce(new.payload ->> 'source', '') = 'departure_cancelled' then
    return new;
  end if;
  if new.kind not in ('delayed', 'cancelled', 'ticket_cancelled') then
    return new;
  end if;

  select * into d from public.bus_departures where id = new.departure_id;
  select * into l from public.listings where id = d.listing_id;
  v_route := coalesce(l.name, 'votre trajet');
  v_when  := to_char(d.departs_on, 'DD/MM') || ' à ' || to_char(d.departs_at, 'HH24:MI');

  if new.kind = 'delayed' then
    v_title := 'Départ reporté : ' || v_route;
    v_body  := 'Le départ du ' || v_when || ' partira à ' || coalesce(new.to_value, '') || '.'
               || coalesce(' Motif : ' || new.reason || '.', '');
  elsif new.kind = 'cancelled' then
    v_title := 'Départ annulé : ' || v_route;
    v_body  := 'Le départ du ' || v_when || ' est annulé. Votre billet est remboursé intégralement.'
               || coalesce(' Motif : ' || new.reason || '.', '');
  else
    v_title := 'Billet annulé : ' || v_route;
    v_body  := 'Votre billet pour le départ du ' || v_when || ' a été annulé.';
  end if;

  for r in
    select t.id, t.ticket_no, t.passenger_email, t.access_token,
           b.user_id, b.email as booking_email
      from public.bus_tickets t
      join public.booking_items bi on bi.id = t.booking_item_id
      join public.bookings b on b.id = bi.booking_id
     where t.departure_id = new.departure_id
       and t.status <> 'checked_in'
       and (new.ticket_id is null or t.id = new.ticket_id)
  loop
    perform public.notify_event(
      'bus_' || new.kind,
      v_title,
      v_body,
      r.user_id,
      null,
      coalesce(r.passenger_email, r.booking_email),
      null,
      jsonb_build_object(
        'departure_id', new.departure_id,
        'ticket_id',    r.id,
        'ticket_no',    r.ticket_no,
        'access_token', r.access_token,
        'route',        v_route,
        'departs_on',   d.departs_on,
        'departs_at',   d.departs_at,
        'delayed_to',   d.delayed_to,
        'reason',       new.reason));
  end loop;

  -- The company is told too, so a cancellation raised by a passenger reaches
  -- the people who have to re-sell the seat.
  if new.kind = 'ticket_cancelled' then
    perform public.notify_event(
      'bus_ticket_cancelled_partner',
      'Billet annulé — ' || v_route,
      'Un passager a annulé son billet pour le départ du ' || v_when || '.',
      null, l.partner_id, null, null,
      jsonb_build_object('departure_id', new.departure_id, 'ticket_id', new.ticket_id));
  end if;

  return new;
end;
$fn$;

create trigger bus_trip_events_notify
  after insert on public.bus_trip_events
  for each row execute function public.bus_trip_event_notifies();;