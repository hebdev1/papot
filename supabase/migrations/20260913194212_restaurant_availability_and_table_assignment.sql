-- Slots computed from the restaurant's own opening hours, meal duration and
-- tables, and a table actually held when the booking is made.
--
-- Times are reasoned about as intervals from midnight, never as `time`
-- arithmetic: `time '23:00' + interval '90 minutes'` wraps to 00:30 and would
-- silently make a late reservation look free.

------------------------------------------------------- availability lookup --
create or replace function public.restaurant_availability(
  p_listing uuid,
  p_date    date,
  p_party   integer default 2
) returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  l          listings%rowtype;
  s          restaurant_settings%rowtype;
  h          record;
  v_zone     constant text := 'America/Port-au-Prince';
  v_today    date;
  v_weekday  smallint;
  v_duration interval;
  v_step     constant interval := interval '30 minutes';
  v_slot     interval;
  v_free     integer;
  v_candidates integer;
  v_slots    jsonb := '[]'::jsonb;
  v_out      jsonb;
begin
  select * into l from listings where id = p_listing and kind = 'restaurant';
  if not found then
    return jsonb_build_object('open', false, 'reason', 'inconnu', 'slots', '[]'::jsonb);
  end if;

  select * into s from restaurant_settings where listing_id = p_listing;
  if not found then
    -- A restaurant whose owner has not opened the settings screen yet still
    -- answers, on the same defaults the table declares.
    s.min_party := 1; s.max_party := 12;
    s.default_duration_minutes := 90; s.min_notice_minutes := 120;
    s.max_advance_days := 60; s.same_day_allowed := true;
    s.accept_online_reservations := true;
  end if;

  v_out := jsonb_build_object(
    'duration_minutes', s.default_duration_minutes,
    'min_party', s.min_party,
    'max_party', s.max_party);

  if not s.accept_online_reservations then
    return v_out || jsonb_build_object('open', false, 'reason', 'reservations_fermees', 'slots', '[]'::jsonb);
  end if;
  if p_party < s.min_party or p_party > s.max_party then
    return v_out || jsonb_build_object('open', false, 'reason', 'groupe_hors_limites', 'slots', '[]'::jsonb);
  end if;

  v_today := (now() at time zone v_zone)::date;
  if p_date < v_today then
    return v_out || jsonb_build_object('open', false, 'reason', 'date_passee', 'slots', '[]'::jsonb);
  end if;
  if p_date = v_today and not s.same_day_allowed then
    return v_out || jsonb_build_object('open', false, 'reason', 'jour_meme_refuse', 'slots', '[]'::jsonb);
  end if;
  if p_date > v_today + s.max_advance_days then
    return v_out || jsonb_build_object('open', false, 'reason', 'trop_loin', 'slots', '[]'::jsonb);
  end if;

  -- Can this restaurant seat this party at all? Distinguishes "fully booked"
  -- from "no table here takes eight people", which are different answers.
  select count(*) into v_candidates
    from restaurant_tables t
   where t.listing_id = p_listing
     and t.active
     and p_party between t.min_guests and t.max_guests;

  if v_candidates = 0 then
    return v_out || jsonb_build_object(
      'open', false,
      'reason', case when exists (select 1 from restaurant_tables where listing_id = p_listing)
                     then 'aucune_table_pour_ce_groupe' else 'aucune_table' end,
      'slots', '[]'::jsonb);
  end if;

  if not exists (select 1 from restaurant_hours where listing_id = p_listing) then
    return v_out || jsonb_build_object('open', false, 'reason', 'horaires_absents', 'slots', '[]'::jsonb);
  end if;

  v_duration := make_interval(mins => s.default_duration_minutes);
  v_weekday  := extract(isodow from p_date)::smallint - 1;   -- Monday is 0

  for h in
    select opens_at, closes_at
      from restaurant_hours
     where listing_id = p_listing and weekday = v_weekday
     order by opens_at
  loop
    v_slot := h.opens_at - time '00:00';
    while v_slot + v_duration <= (h.closes_at - time '00:00') loop
      -- Far enough ahead to be worth offering?
      if ((p_date + v_slot) at time zone v_zone) >= now() + make_interval(mins => s.min_notice_minutes) then
        select count(*) into v_free
          from restaurant_tables t
         where t.listing_id = p_listing
           and t.active
           and p_party between t.min_guests and t.max_guests
           and not exists (
             select 1
               from booking_items bi
              where bi.table_id = t.id
                and bi.starts_on = p_date
                and bi.status <> 'cancelled'
                and bi.start_time is not null
                and v_slot < (bi.start_time - time '00:00') + v_duration
                and (bi.start_time - time '00:00') < v_slot + v_duration
           );

        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'time',  to_char(time '00:00' + v_slot, 'HH24:MI'),
          'free',  v_free,
          'available', v_free > 0));
      end if;
      v_slot := v_slot + v_step;
    end loop;
  end loop;

  return v_out || jsonb_build_object(
    'open', jsonb_array_length(v_slots) > 0,
    'reason', case when jsonb_array_length(v_slots) = 0 then 'ferme_ce_jour' end,
    'slots', v_slots);
end;
$function$;

comment on function public.restaurant_availability(uuid, date, integer) is
  'Bookable slots for one restaurant on one date, from its hours, meal duration and tables. Returns counts only — never another guest''s reservation.';

------------------------------------------------------------- the assignment --
-- Holds one table for one sitting. Every caller goes through here, so the row
-- locks below are what stop two guests taking the same table: the lock is taken
-- before the overlap is read and held until the transaction commits.
create or replace function public.assign_restaurant_table(
  p_listing uuid,
  p_date    date,
  p_time    time,
  p_party   integer
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  s          restaurant_settings%rowtype;
  v_zone     constant text := 'America/Port-au-Prince';
  v_today    date;
  v_duration interval;
  v_start    interval;
  v_weekday  smallint;
  v_table    uuid;
begin
  if p_date is null or p_time is null then
    raise exception 'Choisissez une date et une heure pour votre table.';
  end if;

  select * into s from restaurant_settings where listing_id = p_listing;
  if not found then
    s.min_party := 1; s.max_party := 12;
    s.default_duration_minutes := 90; s.min_notice_minutes := 120;
    s.max_advance_days := 60; s.same_day_allowed := true;
    s.accept_online_reservations := true;
  end if;

  if not s.accept_online_reservations then
    raise exception 'Ce restaurant ne prend pas de réservation en ligne.';
  end if;
  if p_party < s.min_party or p_party > s.max_party then
    raise exception 'Ce restaurant accepte de % à % convives.', s.min_party, s.max_party;
  end if;

  v_today := (now() at time zone v_zone)::date;
  if p_date < v_today then
    raise exception 'Cette date est déjà passée.';
  end if;
  if p_date = v_today and not s.same_day_allowed then
    raise exception 'Ce restaurant ne prend pas de réservation pour le jour même.';
  end if;
  if p_date > v_today + s.max_advance_days then
    raise exception 'Ce restaurant accepte les réservations jusqu''à % jours à l''avance.', s.max_advance_days;
  end if;

  v_duration := make_interval(mins => s.default_duration_minutes);
  v_start    := p_time - time '00:00';
  v_weekday  := extract(isodow from p_date)::smallint - 1;

  if ((p_date + v_start) at time zone v_zone) < now() + make_interval(mins => s.min_notice_minutes) then
    raise exception 'Il faut réserver au moins % minutes à l''avance.', s.min_notice_minutes;
  end if;

  -- The whole sitting has to fit inside one service, not merely start in it.
  if not exists (
    select 1 from restaurant_hours h
     where h.listing_id = p_listing
       and h.weekday = v_weekday
       and v_start >= (h.opens_at - time '00:00')
       and v_start + v_duration <= (h.closes_at - time '00:00')
  ) then
    raise exception 'Le restaurant n''est pas ouvert à cette heure-là.';
  end if;

  -- Lock every table that could take this party, then look for a free one.
  -- Smallest suitable table first, so a party of two does not consume the
  -- only eight-top.
  select t.id into v_table
    from restaurant_tables t
   where t.listing_id = p_listing
     and t.active
     and p_party between t.min_guests and t.max_guests
     and not exists (
       select 1
         from booking_items bi
        where bi.table_id = t.id
          and bi.starts_on = p_date
          and bi.status <> 'cancelled'
          and bi.start_time is not null
          and v_start < (bi.start_time - time '00:00') + v_duration
          and (bi.start_time - time '00:00') < v_start + v_duration
     )
   order by t.max_guests, t.position, t.id
   for update
   limit 1;

  if v_table is null then
    raise exception 'Plus aucune table libre à cette heure-là. Choisissez un autre créneau.';
  end if;

  return v_table;
end;
$function$;

--------------------------------------------------------------- the checkout --
create or replace function public.create_booking(p_payload jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id     uuid;
  v_ref    text;
  v_total  numeric(10,2);
  v_item   jsonb;
  v_pos    integer := 0;
  v_kind   public.listing_kind;
  v_table  uuid;
  v_status public.booking_status;
  v_listing uuid;
  v_date   date;
  v_time   time;
  v_party  smallint;
begin
  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Le panier est vide.';
  end if;

  select coalesce(sum((i->>'amount')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_payload->'items') i;

  v_ref := public.next_booking_reference();

  insert into public.bookings
    (reference, user_id, first_name, last_name, email, phone, payment_method, total)
  values (
    v_ref, auth.uid(),
    trim(p_payload->>'first_name'), trim(p_payload->>'last_name'),
    trim(p_payload->>'email'), trim(p_payload->>'phone'),
    coalesce(p_payload->>'payment_method', 'card'), v_total)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_kind    := (v_item->>'kind')::public.listing_kind;
    v_listing := nullif(v_item->>'listing_id', '')::uuid;
    v_date    := nullif(v_item->>'starts_on', '')::date;
    v_time    := nullif(v_item->>'start_time', '')::time;
    v_party   := nullif(v_item->>'party', '')::smallint;
    v_table   := null;
    v_status  := 'confirmed';

    -- A table is a finite thing: the seat is taken here, inside the same
    -- transaction as the booking, or the checkout fails with a reason the
    -- guest can act on.
    if v_kind = 'restaurant' then
      v_table := public.assign_restaurant_table(v_listing, v_date, v_time, coalesce(v_party, 2));
      v_status := case
        when coalesce((select rs.auto_confirm from public.restaurant_settings rs
                        where rs.listing_id = v_listing), true)
        then 'confirmed' else 'pending' end;
    end if;

    insert into public.booking_items
      (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
       starts_on, ends_on, start_time, party, table_id)
    values (
      v_id, v_listing,
      nullif(v_item->>'unit_id', '')::uuid,
      v_kind,
      v_item->>'title',
      coalesce(v_item->>'detail', ''),
      coalesce((v_item->>'amount')::numeric, 0),
      v_status,
      v_pos,
      v_date,
      nullif(v_item->>'ends_on', '')::date,
      v_time,
      v_party,
      v_table);
    v_pos := v_pos + 1;
  end loop;

  update public.bookings set status = 'confirmed' where id = v_id;

  perform public.attach_items_to_trips(v_id);

  return json_build_object('id', v_id, 'reference', v_ref, 'total', v_total);
end;
$function$;

revoke all on function public.assign_restaurant_table(uuid, date, time, integer) from public, anon, authenticated;
grant execute on function public.restaurant_availability(uuid, date, integer) to anon, authenticated;
;
