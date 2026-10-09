-- When does this coach actually leave?
--
-- One definition, because three callers were about to answer it separately.
-- Two things make it less obvious than it looks:
--
--   * Haiti observes DST, so the instant comes from the IANA zone. A fixed
--     -05:00 was wrong for roughly eight months of the year.
--   * `delayed_to` is a bare `time`, so a 23:00 coach delayed to 01:00 reads
--     as twenty-two hours EARLIER on the same date. A delay only ever moves
--     forward, so a stored time before the scheduled one means the next day.
--     Read naively, every overnight delay would have put the departure in the
--     past and quietly refunded nobody.
create or replace function public.bus_departure_instant(
  p_on date, p_at time, p_delayed time default null)
returns timestamptz
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select ((p_on + coalesce(p_delayed, p_at))
          + case when p_delayed is not null and p_delayed < p_at
                 then interval '1 day' else interval '0 day' end)
         at time zone 'America/Port-au-Prince';
$fn$;

grant execute on function public.bus_departure_instant(date, time, time) to anon, authenticated;

-- Re-stated in full so the quote uses that one definition rather than its own
-- copy of the arithmetic.
create or replace function public.bus_refund_quote(p_ticket uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  t           public.bus_tickets;
  d           public.bus_departures;
  l           public.listings;
  v_policy    jsonb;
  v_tier      jsonb;
  v_depart_at timestamptz;
  v_hours     numeric;
  v_percent   numeric := 0;
  v_fee       numeric := 0;
  v_refund    numeric := 0;
  v_outcome   text;
  v_floored   boolean := false;
  v_protected numeric;
  v_min       numeric;
begin
  select * into t from public.bus_tickets where id = p_ticket;
  if t.id is null then
    return null;
  end if;
  select * into d from public.bus_departures where id = t.departure_id;
  select * into l from public.listings where id = d.listing_id;

  v_policy    := public.bus_refund_policy(l.id);
  v_protected := (v_policy ->> 'protected_hours')::numeric;
  v_min       := (v_policy ->> 'min_percent')::numeric;

  v_depart_at := public.bus_departure_instant(d.departs_on, d.departs_at, d.delayed_to);
  v_hours     := round(extract(epoch from (v_depart_at - now())) / 3600.0, 2);

  if t.status in ('cancelled', 'refunded') then
    v_outcome := 'ALREADY_CANCELLED';
  elsif t.status = 'checked_in' then
    v_outcome := 'ALREADY_BOARDED';
  elsif d.status = 'cancelled' then
    v_outcome := 'FULL_REFUND';
    v_percent := 100;
  else
    v_outcome := 'REFUNDABLE';
    select e.value into v_tier
      from jsonb_array_elements(v_policy -> 'tiers') as e
     where (e.value ->> 'hours_before')::numeric <= v_hours
     order by (e.value ->> 'hours_before')::numeric desc
     limit 1;

    if v_tier is not null then
      v_percent := (v_tier ->> 'refund_percent')::numeric;
      v_fee     := (v_tier ->> 'fee_flat')::numeric;
    end if;

    if v_hours >= v_protected and v_percent < v_min then
      v_percent := v_min;
      v_fee     := 0;
      v_floored := true;
    end if;
  end if;

  if v_outcome in ('REFUNDABLE', 'FULL_REFUND') then
    v_refund := greatest(0, least(t.amount, round(t.amount * v_percent / 100.0, 2) - v_fee));
  end if;

  return jsonb_build_object(
    'ticket_id',           t.id,
    'ticket_no',           t.ticket_no,
    'outcome',             v_outcome,
    'amount_paid',         t.amount,
    'currency',            'USD',
    'hours_before',        v_hours,
    'refund_percent',      v_percent,
    'fee',                 v_fee,
    'refund',              v_refund,
    'kept',                round(t.amount - v_refund, 2),
    'policy_source',       v_policy ->> 'source',
    'floored_by_platform', v_floored,
    'departs_at',          v_depart_at);
end;
$fn$;

revoke execute on function public.bus_refund_quote(uuid) from public;
revoke execute on function public.bus_refund_quote(uuid) from anon;
revoke execute on function public.bus_refund_quote(uuid) from authenticated;

-- Moving a coach through its day: boarding, departed, arrived, completed.
--
-- It deliberately refuses 'cancelled' and 'delayed'. Those two owe the
-- passenger something — a refund, or at least a new time — and letting them
-- through a generic status setter is how a company would come to cancel a
-- trip while every ticket stayed sold and unrefunded.
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

  if not (public.partner_can(v_partner, 'manage_departures') or public.admin_can('view_bookings')) then
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

grant execute on function public.bus_set_departure_status(uuid, public.bus_departure_status, text) to authenticated;

-- A delay: a new time, forward, on the same journey.
--
-- Capped at 24 hours because `delayed_to` is a time of day and cannot say
-- which day it means beyond the next one — and because a coach a day late is
-- a different trip, which the passenger should be refunded for rather than
-- told to wait for.
create or replace function public.bus_delay_departure(
  p_departure uuid, p_new_time time, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  d         public.bus_departures;
  v_partner uuid;
  v_was     timestamptz;
  v_now     timestamptz;
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
    raise exception 'Ce départ est annulé.' using errcode = '23514';
  end if;
  if d.status in ('departed', 'arrived', 'completed') then
    raise exception 'Ce départ est déjà parti ; il ne peut plus être reporté.'
      using errcode = '23514';
  end if;

  v_was := public.bus_departure_instant(d.departs_on, d.departs_at, d.delayed_to);
  v_now := public.bus_departure_instant(d.departs_on, d.departs_at, p_new_time);

  if v_now <= v_was then
    raise exception 'Une nouvelle heure doit être postérieure à l''heure actuelle du départ.'
      using errcode = '23514';
  end if;
  if v_now - public.bus_departure_instant(d.departs_on, d.departs_at, null) > interval '24 hours' then
    raise exception 'Un report de plus de 24 heures doit passer par une annulation.'
      using errcode = '23514';
  end if;

  update public.bus_departures
     set delayed_to = p_new_time,
         delay_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         status = 'delayed'
   where id = d.id;

  insert into public.bus_trip_events (departure_id, kind, actor, from_value, to_value, reason, payload)
  values (d.id, 'delayed', auth.uid(),
          to_char(coalesce(d.delayed_to, d.departs_at), 'HH24:MI'),
          to_char(p_new_time, 'HH24:MI'),
          nullif(btrim(coalesce(p_reason, '')), ''),
          jsonb_build_object('was', v_was, 'now', v_now,
                             'minutes', round(extract(epoch from (v_now - v_was)) / 60.0)));

  return jsonb_build_object(
    'departure_id', d.id, 'delayed_to', p_new_time, 'departs_at', v_now,
    'minutes', round(extract(epoch from (v_now - v_was)) / 60.0));
end;
$fn$;

grant execute on function public.bus_delay_departure(uuid, time, text) to authenticated;

-- Calling a trip off. Every ticket still live is cancelled and refunded in
-- full, in this transaction — the status is set first precisely so each quote
-- sees a cancelled departure and applies no fee. A passenger who has already
-- boarded is left alone; there is nothing to refund and nothing to free.
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

  update public.bus_departures
     set status = 'cancelled', delay_reason = v_reason
   where id = d.id;

  for v_tid in
    select id from public.bus_tickets
     where departure_id = d.id and status = 'issued'
     order by seat_no
  loop
    v_res   := public.bus_cancel_ticket_internal(v_tid, v_reason, 'departure_cancelled');
    v_count := v_count + 1;
    v_total := v_total + (v_res ->> 'refund')::numeric;
  end loop;

  insert into public.bus_trip_events (departure_id, kind, actor, from_value, to_value, reason, payload)
  values (d.id, 'cancelled', auth.uid(), d.status::text, 'cancelled', v_reason,
          jsonb_build_object('tickets_refunded', v_count, 'refund_total', v_total));

  return jsonb_build_object(
    'departure_id', d.id, 'tickets_refunded', v_count, 'refund_total', v_total,
    'still_boarded', (select count(*) from public.bus_tickets
                       where departure_id = d.id and status = 'checked_in'));
end;
$fn$;

grant execute on function public.bus_cancel_departure(uuid, text) to authenticated;;