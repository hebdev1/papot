-- The public page was still printing a hard-coded "Table gardée 15 minutes"
-- beside slots the database builds on a 90-minute sitting. The rules travel
-- with the answer now, so the page can only state what is actually configured.
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
    s.accept_online_reservations := true; s.grace_period_minutes := 15;
    s.deposit_required := false;
  end if;

  v_out := jsonb_build_object(
    'duration_minutes',            s.default_duration_minutes,
    'min_party',                   s.min_party,
    'max_party',                   s.max_party,
    'min_notice_minutes',          s.min_notice_minutes,
    'max_advance_days',            s.max_advance_days,
    'grace_period_minutes',        s.grace_period_minutes,
    'deposit_required',            s.deposit_required,
    'deposit_amount',              s.deposit_amount,
    'cancellation_deadline_hours', s.cancellation_deadline_hours);

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
;
