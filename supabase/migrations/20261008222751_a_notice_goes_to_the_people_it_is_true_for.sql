-- Three corrections to the lifecycle, found by running it.
--
-- 1. Cancelling a trip told the passengers who had ALREADY cancelled that
--    their trip was off and fully refunded. It was not true for them: they
--    had been quoted a tiered refund and paid a fee. The fan-out was keyed on
--    "not boarded", which includes a cancelled ticket.
--
--    The filter is now per kind — a trip-level notice reaches live tickets
--    only, a ticket-level notice reaches its own ticket whatever state it is
--    in — and `bus_cancel_departure` writes its event BEFORE cancelling the
--    tickets, so "live" still means something by the time the trigger reads it.
--
-- 2. `bus_set_departure_status` let an admin holding `view_bookings` — a READ
--    permission — move a departure through its day. Writes answer to
--    `modify_bookings`.

create or replace function public.bus_set_departure_status(
  p_departure uuid, p_status public.bus_departure_status, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  d         public.bus_departures;
  v_partner uuid;
begin
  select * into d from public.bus_departures where id = p_departure for update;
  if d.id is null then
    raise exception 'Départ introuvable.' using errcode = 'P0002';
  end if;
  select partner_id into v_partner from public.listings where id = d.listing_id;

  if not (public.partner_can(v_partner, 'manage_departures')
          or public.admin_can('modify_bookings')) then
    raise exception 'Permission requise : manage_departures' using errcode = '42501';
  end if;

  if p_status = 'cancelled' then
    raise exception 'Utilisez l''annulation de départ : elle rembourse les billets.'
      using errcode = '23514';
  end if;
  if p_status = 'delayed' then
    raise exception 'Utilisez le report de départ : il enregistre la nouvelle heure.'
      using errcode = '23514';
  end if;
  if d.status = 'cancelled' then
    raise exception 'Ce départ est annulé ; les billets ont été remboursés.'
      using errcode = '23514';
  end if;

  update public.bus_departures set status = p_status where id = d.id;

  insert into public.bus_trip_events (departure_id, kind, actor, from_value, to_value, reason)
  values (d.id, 'status_changed', auth.uid(), d.status::text, p_status::text,
          nullif(btrim(coalesce(p_note, '')), ''));

  return jsonb_build_object('departure_id', d.id, 'from', d.status, 'to', p_status);
end;
$fn$;

create or replace function public.bus_trip_event_notifies()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  d       public.bus_departures;
  l       public.listings;
  v_route text;
  v_when  text;
  v_title text;
  v_body  text;
  r       record;
begin
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
       and case
             -- A trip-level notice is only true for a ticket still standing.
             when new.ticket_id is null then t.status = 'issued'
             -- A ticket-level one is about that ticket, already marked by now.
             else t.id = new.ticket_id
           end
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

create or replace function public.bus_cancel_departure(
  p_departure uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  d         public.bus_departures;
  v_partner uuid;
  v_tid     uuid;
  v_event   uuid;
  v_count   int := 0;
  v_total   numeric := 0;
  v_res     jsonb;
  v_reason  text;
begin
  select * into d from public.bus_departures where id = p_departure for update;
  if d.id is null then
    raise exception 'Départ introuvable.' using errcode = 'P0002';
  end if;
  select partner_id into v_partner from public.listings where id = d.listing_id;

  if not public.partner_can(v_partner, 'manage_departures') then
    raise exception 'Permission requise : manage_departures' using errcode = '42501';
  end if;
  if d.status = 'cancelled' then
    raise exception 'Ce départ est déjà annulé.' using errcode = '23514';
  end if;

  v_reason := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Départ annulé par la compagnie');

  -- The status first: every quote below must see a cancelled departure, which
  -- is what makes the refund whole and fee-free.
  update public.bus_departures
     set status = 'cancelled', delay_reason = v_reason
   where id = d.id;

  -- Then the notice, while the tickets it is addressed to are still standing.
  insert into public.bus_trip_events (departure_id, kind, actor, from_value, to_value, reason)
  values (d.id, 'cancelled', auth.uid(), d.status::text, 'cancelled', v_reason)
  returning id into v_event;

  for v_tid in
    select id from public.bus_tickets
     where departure_id = d.id and status = 'issued'
     order by seat_no
  loop
    v_res   := public.bus_cancel_ticket_internal(v_tid, v_reason, 'departure_cancelled');
    v_count := v_count + 1;
    v_total := v_total + (v_res ->> 'refund')::numeric;
  end loop;

  update public.bus_trip_events
     set payload = payload || jsonb_build_object(
           'tickets_refunded', v_count, 'refund_total', v_total)
   where id = v_event;

  return jsonb_build_object(
    'departure_id', d.id, 'tickets_refunded', v_count, 'refund_total', v_total,
    'still_boarded', (select count(*) from public.bus_tickets
                       where departure_id = d.id and status = 'checked_in'));
end;
$fn$;;