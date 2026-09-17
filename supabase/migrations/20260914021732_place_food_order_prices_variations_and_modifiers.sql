-- What a modifier *is*, so the kitchen screen can shout the right thing. A sign
-- on a price is not a reliable signal: an extra can be free.
alter table public.modifiers
  add column kind text not null default 'option';

alter table public.modifiers
  add constraint modifier_kind_known check (kind in ('option', 'extra', 'remove'));

comment on column public.modifiers.kind is
  'option / extra / remove — drives how the line is displayed to the kitchen.';

-- Prices now come from three places, all of them the menu's: the dish, the
-- chosen size, and the chosen options. The payload still only carries ids.
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
  v           dish_variations%rowtype;
  g           record;
  m           record;
  v_zone      constant text := 'America/Port-au-Prince';
  v_listing   uuid;
  v_mode      public.fulfillment_mode;
  v_when      timestamptz;
  v_local     timestamp;
  v_weekday   smallint;
  v_item      jsonb;
  v_cust      jsonb;
  v_mods      jsonb;
  v_order     uuid;
  v_line      uuid;
  v_ref       text;
  v_qty       smallint;
  v_base      numeric(10,2);
  v_unit      numeric(10,2);
  v_subtotal  numeric(10,2) := 0;
  v_tip       numeric(10,2);
  v_pos       smallint := 0;
  v_cpos      smallint;
  v_picked    integer;
  v_count     integer;
  v_has_sizes boolean;
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

    ------------------------------------------------------------- the size --
    select exists (select 1 from dish_variations where item_id = d.id and active)
      into v_has_sizes;

    v.id := null; v.name := null;
    if v_has_sizes then
      select * into v
        from dish_variations
       where id = nullif(v_item->>'variation_id', '')::uuid
         and item_id = d.id
         and active;
      if not found then
        raise exception 'Choisissez une portion pour « % ».', d.name;
      end if;
      v_base := v.price;
    else
      if nullif(v_item->>'variation_id', '') is not null then
        raise exception '« % » ne se décline pas en portions.', d.name;
      end if;
      v_base := coalesce(d.discount_price, d.price);
      if v_base is null then
        raise exception '« % » se commande sur place : son prix varie.', d.name;
      end if;
    end if;

    ---------------------------------------------------------- the options --
    v_mods := coalesce(v_item->'modifiers', '[]'::jsonb);

    -- Every option must belong to a group this dish actually asks about.
    for m in
      select (x->>'id')::uuid as id,
             greatest(coalesce((x->>'quantity')::smallint, 1), 1) as qty
        from jsonb_array_elements(v_mods) x
    loop
      if not exists (
        select 1
          from modifiers mo
          join modifier_groups mg on mg.id = mo.group_id
          join menu_item_modifier_groups link on link.group_id = mg.id
         where mo.id = m.id and mo.active and mg.active and link.item_id = d.id
      ) then
        raise exception 'Une option choisie ne s''applique pas à « % ».', d.name;
      end if;
    end loop;

    -- And every question the dish asks must be answered within its rules.
    for g in
      select mg.*
        from modifier_groups mg
        join menu_item_modifier_groups link on link.group_id = mg.id
       where link.item_id = d.id and mg.active
    loop
      select coalesce(sum(greatest(coalesce((x->>'quantity')::smallint, 1), 1)), 0)
        into v_picked
        from jsonb_array_elements(v_mods) x
        join modifiers mo on mo.id = (x->>'id')::uuid
       where mo.group_id = g.id;

      if v_picked < g.min_select then
        raise exception '« % » : choisissez au moins % option(s) pour « % ».',
          g.name, g.min_select, d.name;
      end if;
      if v_picked > g.max_select then
        raise exception '« % » : % option(s) au maximum pour « % ».',
          g.name, g.max_select, d.name;
      end if;
    end loop;

    v_qty := greatest(least(coalesce((v_item->>'quantity')::smallint, 1), 99), 1);

    if d.quantity_available is not null and v_qty > d.quantity_available then
      raise exception 'Il ne reste que % portion(s) de « % ».', d.quantity_available, d.name;
    end if;

    -- The unit price is the size plus what was added to it.
    select v_base + coalesce(sum(mo.price_delta * greatest(coalesce((x->>'quantity')::smallint, 1), 1)), 0)
      into v_unit
      from jsonb_array_elements(v_mods) x
      join modifiers mo on mo.id = (x->>'id')::uuid;
    v_unit := coalesce(v_unit, v_base);

    if v_unit < 0 then
      raise exception 'La configuration de « % » donne un prix négatif.', d.name;
    end if;

    insert into restaurant_order_items
      (order_id, item_id, variation_id, variation_name, base_price,
       name, unit_price, quantity, line_total, note, position)
    values (v_order, d.id, v.id, v.name, v_base,
            d.name || coalesce(' (' || v.name || ')', ''),
            v_unit, v_qty, v_unit * v_qty,
            nullif(btrim(coalesce(v_item->>'note', '')), ''), v_pos)
    returning id into v_line;

    v_subtotal := v_subtotal + (v_unit * v_qty);
    v_pos := v_pos + 1;

    -- The chosen options, priced by the menu and labelled by their own kind.
    v_cpos := 0;
    insert into order_item_customizations (order_item_id, modifier_id, kind, label, price_delta, position)
    select v_line, mo.id, mo.kind, mo.name,
           mo.price_delta * greatest(coalesce((x->>'quantity')::smallint, 1), 1),
           (row_number() over (order by mg.position, mo.position) - 1)::smallint
      from jsonb_array_elements(v_mods) x
      join modifiers mo on mo.id = (x->>'id')::uuid
      join modifier_groups mg on mg.id = mo.group_id;

    select count(*) into v_cpos from order_item_customizations where order_item_id = v_line;

    -- Free text stays free text. Only a note or an allergy may come from the
    -- client now: anything that moves the price has to be a modifier.
    for v_cust in select * from jsonb_array_elements(coalesce(v_item->'customizations', '[]'::jsonb)) loop
      if length(btrim(coalesce(v_cust->>'label', ''))) > 0 then
        insert into order_item_customizations (order_item_id, kind, label, price_delta, position)
        values (v_line,
                case when v_cust->>'kind' = 'allergy' then 'allergy' else 'note' end,
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

  v_tip := greatest(coalesce(public.parse_num(p_payload->'tip', 'Pourboire'), 0), 0);

  update restaurant_orders
     set subtotal = v_subtotal, tip = v_tip, total = v_subtotal + v_tip
   where id = v_order;

  insert into order_status_history (order_id, status, actor)
  values (v_order, 'received', auth.uid());

  select count(*) into v_count from restaurant_order_items where order_id = v_order;

  return json_build_object('id', v_order, 'reference', v_ref,
                           'total', v_subtotal + v_tip, 'items', v_count);
end;
$function$;
;
