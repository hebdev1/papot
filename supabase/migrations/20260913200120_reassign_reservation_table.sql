-- Moving a guest to another table has to go through the same overlap check as
-- taking one in the first place. A plain UPDATE from the dashboard would let
-- staff put two parties on one table, which is the exact bug the assignment
-- was built to prevent.
create or replace function public.reassign_reservation_table(
  p_item  uuid,
  p_table uuid
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  bi         booking_items%rowtype;
  l          listings%rowtype;
  t          restaurant_tables%rowtype;
  v_duration interval;
  v_start    interval;
begin
  select * into bi from booking_items where id = p_item;
  if not found then
    raise exception 'Réservation introuvable.' using errcode = 'P0002';
  end if;
  if bi.kind <> 'restaurant' then
    raise exception 'Seule une réservation de table peut changer de table.';
  end if;

  select * into l from listings where id = bi.listing_id;
  if not found then
    raise exception 'Réservation introuvable.' using errcode = 'P0002';
  end if;

  if not (public.partner_can(l.partner_id, 'manage_reservations')
          or public.admin_can('modify_bookings')) then
    raise exception 'Permission requise : manage_reservations' using errcode = '42501';
  end if;

  if bi.status = 'cancelled' then
    raise exception 'Cette réservation est annulée.';
  end if;

  -- Lock the target first, so two staff members moving guests at the same time
  -- cannot both land on it.
  select * into t
    from restaurant_tables
   where id = p_table and listing_id = bi.listing_id
   for update;

  if not found then
    raise exception 'Cette table n''appartient pas à ce restaurant.';
  end if;
  if not t.active then
    raise exception 'Cette table n''est pas proposée à la réservation.';
  end if;
  if coalesce(bi.party, 1) < t.min_guests or coalesce(bi.party, 1) > t.max_guests then
    raise exception 'La table % accepte de % à % convives.', t.label, t.min_guests, t.max_guests;
  end if;

  v_duration := make_interval(mins => coalesce(
    (select rs.default_duration_minutes from restaurant_settings rs where rs.listing_id = bi.listing_id),
    90));
  v_start := bi.start_time - time '00:00';

  if exists (
    select 1
      from booking_items o
     where o.table_id = p_table
       and o.id <> bi.id
       and o.starts_on = bi.starts_on
       and o.status <> 'cancelled'
       and o.start_time is not null
       and v_start < (o.start_time - time '00:00') + v_duration
       and (o.start_time - time '00:00') < v_start + v_duration
  ) then
    raise exception 'La table % est déjà prise sur ce créneau.', t.label;
  end if;

  update booking_items set table_id = p_table where id = p_item;
  return p_table;
end;
$function$;

grant execute on function public.reassign_reservation_table(uuid, uuid) to authenticated;
;
