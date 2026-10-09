-- "Your trip is cancelled" is only half a message.
--
-- A passenger told their coach is off still has to get there. The notice now
-- names the next departure on the same route that still has a free seat, and
-- carries it in the payload so a screen can link straight to it.
--
-- It is offered, not booked. Moving someone onto another coach without asking
-- would spend their refund for them and could put them on a trip they cannot
-- make — so the refund stands and the alternative is a suggestion.

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
  v_alt   record;
  v_altj  jsonb := null;
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

    -- The next coach on this route that somebody could actually board.
    select d2.id, d2.departs_on, d2.departs_at
      into v_alt
      from public.bus_departures d2
     where d2.listing_id = d.listing_id
       and d2.id <> d.id
       and d2.status in ('scheduled', 'boarding', 'delayed')
       and public.bus_departure_instant(d2.departs_on, d2.departs_at, d2.delayed_to) > now()
       and exists (
             select 1 from public.bus_departure_seats s
              where s.departure_id = d2.id
                and s.booking_item_id is null
                and not s.blocked
                and (s.held_until is null or s.held_until < now()))
     order by d2.departs_on, d2.departs_at
     limit 1;

    if v_alt.id is not null then
      v_altj := jsonb_build_object(
        'departure_id', v_alt.id,
        'departs_on',   v_alt.departs_on,
        'departs_at',   v_alt.departs_at);
      v_body := v_body || ' Prochain départ disponible : le '
                || to_char(v_alt.departs_on, 'DD/MM') || ' à '
                || to_char(v_alt.departs_at, 'HH24:MI') || '.';
    end if;
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
             when new.ticket_id is null then t.status = 'issued'
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
        'reason',       new.reason,
        'alternative',  v_altj));
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

revoke execute on function public.bus_trip_event_notifies() from public;
revoke execute on function public.bus_trip_event_notifies() from anon;
revoke execute on function public.bus_trip_event_notifies() from authenticated;;