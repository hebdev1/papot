create or replace function public.next_order_reference()
 returns text
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare ref text;
begin
  loop
    ref := 'CMD-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    exit when not exists (select 1 from public.restaurant_orders where reference = ref);
  end loop;
  return ref;
end;
$function$;

-- Places one order. Prices are read from the menu, never from the payload: a
-- client that could send its own prices could set them to zero.
create or replace function public.place_food_order(p_payload jsonb)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  l           listings%rowtype;
  s           restaurant_settings%rowtype;
  d           menu_items%rowtype;
  v_zone      constant text := 'America/Port-au-Prince';
  v_listing   uuid;
  v_mode      public.fulfillment_mode;
  v_when      timestamptz;
  v_local     timestamp;
  v_weekday   smallint;
  v_item      jsonb;
  v_cust      jsonb;
  v_order     uuid;
  v_line      uuid;
  v_ref       text;
  v_qty       smallint;
  v_price     numeric(10,2);
  v_subtotal  numeric(10,2) := 0;
  v_tip       numeric(10,2);
  v_total     numeric(10,2);
  v_pos       smallint := 0;
  v_cpos      smallint;
  v_count     integer;
begin
  v_listing := nullif(p_payload->>'listing_id', '')::uuid;

  select * into l from listings where id = v_listing and kind = 'restaurant';
  if not found then
    raise exception 'Ce restaurant est introuvable.' using errcode = 'P0002';
  end if;
  if l.status <> 'published' then
    raise exception 'Ce restaurant ne prend pas encore de commande.';
  end if;

  select * into s from restaurant_settings where listing_id = v_listing;
  if not found or not s.accept_online_orders then
    raise exception 'Ce restaurant ne prend pas de commande en ligne.';
  end if;

  v_mode := (p_payload->>'fulfillment')::public.fulfillment_mode;
  if (v_mode = 'dine_in'  and not s.allow_dine_in_orders)
     or (v_mode = 'pickup'   and not s.allow_pickup)
     or (v_mode = 'delivery' and not s.allow_delivery) then
    raise exception 'Ce mode de retrait n''est pas proposé par ce restaurant.';
  end if;

  if length(btrim(coalesce(p_payload->>'customer_name', ''))) < 2 then
    raise exception 'Indiquez le nom de la personne qui vient chercher la commande.';
  end if;
  if length(btrim(coalesce(p_payload->>'customer_phone', ''))) < 6 then
    raise exception 'Un numéro de téléphone est nécessaire pour vous joindre.';
  end if;

  -- When the food is actually wanted, which is what decides whether a dish is
  -- on that day's menu.
  v_when  := coalesce(nullif(p_payload->>'scheduled_for', '')::timestamptz,
                      now() + make_interval(mins => s.order_prep_minutes));
  if v_when < now() then
    raise exception 'Cette heure est déjà passée.';
  end if;
  v_local   := v_when at time zone v_zone;
  v_weekday := extract(isodow from v_local)::smallint - 1;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Votre panier est vide.';
  end if;

  v_ref := public.next_order_reference();

  insert into restaurant_orders (
    reference, listing_id, user_id, customer_name, customer_phone, customer_email,
    fulfillment, scheduled_for, address, address_notes,
    subtotal, total, currency, payment_method, note)
  values (
    v_ref, v_listing, auth.uid(),
    btrim(p_payload->>'customer_name'),
    btrim(p_payload->>'customer_phone'),
    nullif(lower(btrim(coalesce(p_payload->>'customer_email', ''))), ''),
    v_mode,
    nullif(p_payload->>'scheduled_for', '')::timestamptz,
    nullif(btrim(coalesce(p_payload->>'address', '')), ''),
    nullif(btrim(coalesce(p_payload->>'address_notes', '')), ''),
    0, 0, coalesce(l.currency, 'USD'),
    nullif(p_payload->>'payment_method', ''),
    nullif(btrim(coalesce(p_payload->>'note', '')), ''))
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    select * into d
      from menu_items
     where id = nullif(v_item->>'item_id', '')::uuid
       and listing_id = v_listing;

    if not found then
      raise exception 'Un plat de votre panier n''existe plus.';
    end if;
    if not d.available then
      raise exception '« % » n''est plus au menu.', d.name;
    end if;
    if d.sold_out then
      raise exception '« % » est épuisé.', d.name;
    end if;
    if coalesce(array_length(d.available_weekdays, 1), 0) > 0
       and not (v_weekday = any(d.available_weekdays)) then
      raise exception '« % » n''est pas servi ce jour-là.', d.name;
    end if;
    if d.available_from is not null
       and (v_local::time < d.available_from or v_local::time > d.available_until) then
      raise exception '« % » est servi de % à %.', d.name,
        to_char(d.available_from, 'HH24:MI'), to_char(d.available_until, 'HH24:MI');
    end if;

    -- A dish with no price is a market-price dish: it cannot be ordered online.
    v_price := coalesce(d.discount_price, d.price);
    if v_price is null then
      raise exception '« % » se commande sur place : son prix varie.', d.name;
    end if;

    v_qty := greatest(least(coalesce((v_item->>'quantity')::smallint, 1), 99), 1);

    if d.quantity_available is not null and v_qty > d.quantity_available then
      raise exception 'Il ne reste que % portion(s) de « % ».', d.quantity_available, d.name;
    end if;

    insert into restaurant_order_items
      (order_id, item_id, name, unit_price, quantity, line_total, note, position)
    values (v_order, d.id, d.name, v_price, v_qty, v_price * v_qty,
            nullif(btrim(coalesce(v_item->>'note', '')), ''), v_pos)
    returning id into v_line;

    v_subtotal := v_subtotal + (v_price * v_qty);
    v_pos := v_pos + 1;

    -- Phase 3 carries removals, extras and allergy notes as labels only:
    -- nothing here may move the price until modifiers are priced in the menu.
    v_cpos := 0;
    for v_cust in select * from jsonb_array_elements(coalesce(v_item->'customizations', '[]'::jsonb)) loop
      if length(btrim(coalesce(v_cust->>'label', ''))) > 0 then
        insert into order_item_customizations (order_item_id, kind, label, price_delta, position)
        values (v_line,
                coalesce(nullif(v_cust->>'kind', ''), 'note'),
                btrim(v_cust->>'label'),
                0,
                v_cpos);
        v_cpos := v_cpos + 1;
      end if;
    end loop;
  end loop;

  if s.order_min_total is not null and v_subtotal < s.order_min_total then
    raise exception 'La commande minimum est de % %.',
      to_char(s.order_min_total, 'FM999999990.00'), coalesce(l.currency, 'USD');
  end if;

  -- The tip is the one amount the customer genuinely decides.
  v_tip   := greatest(coalesce(public.parse_num(p_payload->'tip', 'Pourboire'), 0), 0);
  v_total := v_subtotal + v_tip;

  update restaurant_orders
     set subtotal = v_subtotal, tip = v_tip, total = v_total
   where id = v_order;

  insert into order_status_history (order_id, status, actor)
  values (v_order, 'received', auth.uid());

  select count(*) into v_count from restaurant_order_items where order_id = v_order;

  return json_build_object('id', v_order, 'reference', v_ref,
                           'total', v_total, 'items', v_count);
end;
$function$;

-- Moves an order along. The trigger decides whether the move is legal; this
-- decides who may ask, and records why.
create or replace function public.advance_food_order(
  p_order  uuid,
  p_status text,
  p_reason text default null
) returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o        restaurant_orders%rowtype;
  l        listings%rowtype;
  v_next   public.food_order_status;
  v_staff  boolean;
begin
  select * into o from restaurant_orders where id = p_order;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0002';
  end if;
  select * into l from listings where id = o.listing_id;

  v_next := p_status::public.food_order_status;

  v_staff := public.partner_can(l.partner_id, 'manage_orders')
             or public.admin_can('modify_bookings');

  -- A customer may call off their own order, but only before the kitchen has
  -- accepted it.
  if not v_staff then
    if o.user_id is distinct from auth.uid() then
      raise exception 'Permission requise : manage_orders' using errcode = '42501';
    end if;
    if not (v_next = 'cancelled' and o.status = 'received') then
      raise exception 'Cette commande ne peut plus être annulée en ligne. Appelez le restaurant.';
    end if;
  end if;

  if v_next in ('rejected', 'cancelled') and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez un motif : le client le verra.';
  end if;

  update restaurant_orders
     set status = v_next,
         rejection_reason = case when v_next in ('rejected', 'cancelled')
                                 then btrim(p_reason) else rejection_reason end
   where id = p_order;

  insert into order_status_history (order_id, status, reason, actor)
  values (p_order, v_next, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());

  return v_next::text;
end;
$function$;

grant execute on function public.place_food_order(jsonb)             to anon, authenticated;
grant execute on function public.advance_food_order(uuid, text, text) to authenticated;
revoke all on function public.next_order_reference() from public, anon, authenticated;
;
