-- New bookings join a trip automatically, so the customer never has to
-- assemble an itinerary by hand.
create or replace function public.create_booking(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_ref   text;
  v_total numeric(10,2);
  v_item  jsonb;
  v_pos   integer := 0;
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
    insert into public.booking_items
      (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
       starts_on, ends_on, start_time, party)
    values (
      v_id,
      nullif(v_item->>'listing_id', '')::uuid,
      nullif(v_item->>'unit_id', '')::uuid,
      (v_item->>'kind')::public.listing_kind,
      v_item->>'title',
      coalesce(v_item->>'detail', ''),
      coalesce((v_item->>'amount')::numeric, 0),
      case when (v_item->>'kind') = 'restaurant' then 'pending' else 'confirmed' end::public.booking_status,
      v_pos,
      nullif(v_item->>'starts_on', '')::date,
      nullif(v_item->>'ends_on', '')::date,
      nullif(v_item->>'start_time', '')::time,
      nullif(v_item->>'party', '')::smallint);
    v_pos := v_pos + 1;
  end loop;

  update public.bookings set status = 'confirmed' where id = v_id;

  perform public.attach_items_to_trips(v_id);

  return json_build_object('id', v_id, 'reference', v_ref, 'total', v_total);
end;
$$;

revoke all on function public.create_booking(jsonb) from public;
grant execute on function public.create_booking(jsonb) to anon, authenticated;;
