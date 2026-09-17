-- One price, one place. Griot inside a family plate and griot inside a bowl are
-- not the same money, so the price lives on the option, never on the component.
alter table public.food_components drop column base_price;

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
  t           meal_templates%rowtype;
  inv         restaurant_inventory%rowtype;
  cinv        component_inventory%rowtype;
  g           record;
  m           record;
  fx          record;
  v_zone      constant text := 'America/Port-au-Prince';
  v_listing   uuid;
  v_mode      public.fulfillment_mode;
  v_when      timestamptz;
  v_local     timestamp;
  v_day       date;
  v_weekday   smallint;
  v_item      jsonb;
  v_cust      jsonb;
  v_mods      jsonb;
  v_sel       jsonb;
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
  v_name      text;
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
  v_day     := v_local::date;
  v_weekday := extract(isodow from v_local)::smallint - 1;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Votre panier est vide.';
  end if;

  v_ref := public.next_order_reference();

  insert into restaurant_orders (
    reference, listing_id, user_id, customer_name, customer_phone, customer_email,
    fulfillment, scheduled_for, service_day, address, address_notes,
    subtotal, total, currency, payment_method, note)
  values (
    v_ref, v_listing, auth.uid(),
    btrim(p_payload->>'customer_name'),
    btrim(p_payload->>'customer_phone'),
    nullif(lower(btrim(coalesce(p_payload->>'customer_email', ''))), ''),
    v_mode,
    nullif(p_payload->>'scheduled_for', '')::timestamptz,
    v_day,
    nullif(btrim(coalesce(p_payload->>'address', '')), ''),
    nullif(btrim(coalesce(p_payload->>'address_notes', '')), ''),
    0, 0, coalesce(l.currency, 'USD'),
    nullif(p_payload->>'payment_method', ''),
    nullif(btrim(coalesce(p_payload->>'note', '')), ''))
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_qty := greatest(least(coalesce((v_item->>'quantity')::smallint, 1), 99), 1);

    ------------------------------------------------------------------------
    -- A combo or a built plate.
    ------------------------------------------------------------------------
    if nullif(v_item->>'template_id', '') is not null then
      select * into t
        from meal_templates
       where id = (v_item->>'template_id')::uuid
         and listing_id = v_listing
         and active;
      if not found then
        raise exception 'Cette formule n''est plus proposée.';
      end if;

      v_sel  := coalesce(v_item->'selections', '[]'::jsonb);
      v_base := t.base_price;

      -- Every choice must belong to this template.
      for m in select (x->>'option_id')::uuid as id from jsonb_array_elements(v_sel) x loop
        if not exists (
          select 1 from meal_group_options o
            join meal_groups mg on mg.id = o.group_id
           where o.id = m.id and mg.template_id = t.id
        ) then
          raise exception 'Un choix ne fait pas partie de « % ».', t.name;
        end if;
      end loop;

      -- And every group must be answered within its rules.
      for g in select * from meal_groups where template_id = t.id loop
        select coalesce(sum(greatest(coalesce((x->>'quantity')::smallint, 1), 1)), 0)
          into v_picked
          from jsonb_array_elements(v_sel) x
          join meal_group_options o on o.id = (x->>'option_id')::uuid
         where o.group_id = g.id;

        if v_picked < g.min_select then
          raise exception '« % » : choisissez au moins % élément(s).', g.name, g.min_select;
        end if;
        if v_picked > g.max_select then
          raise exception '« % » : % élément(s) au maximum.', g.name, g.max_select;
        end if;
      end loop;

      -- Per-option ceiling, where the restaurant set one.
      for m in
        select o.id,
               greatest(coalesce((x->>'quantity')::smallint, 1), 1) as qty,
               o.max_quantity,
               coalesce(c.name, mi.name) as label
          from jsonb_array_elements(v_sel) x
          join meal_group_options o on o.id = (x->>'option_id')::uuid
          left join food_components c on c.id = o.component_id
          left join menu_items mi on mi.id = o.item_id
      loop
        if m.max_quantity is not null and m.qty > m.max_quantity then
          raise exception '« % » : % au maximum.', m.label, m.max_quantity;
        end if;
      end loop;

      select v_base + coalesce(sum(o.price_delta * greatest(coalesce((x->>'quantity')::smallint, 1), 1)), 0)
        into v_unit
        from jsonb_array_elements(v_sel) x
        join meal_group_options o on o.id = (x->>'option_id')::uuid;
      v_unit := coalesce(v_unit, v_base);

      if v_unit < 0 then
        raise exception '« % » donne un prix négatif.', t.name;
      end if;

      ------------------------------------------------------------- stock --
      -- Components first, then whatever dishes the combo always includes.
      for m in
        select o.component_id,
               greatest(coalesce((x->>'quantity')::smallint, 1), 1) * v_qty as need,
               c.name
          from jsonb_array_elements(v_sel) x
          join meal_group_options o on o.id = (x->>'option_id')::uuid
          join food_components c on c.id = o.component_id
      loop
        select * into cinv from component_inventory
         where component_id = m.component_id and day = v_day for update;
        if found then
          if cinv.prepared - cinv.sold < m.need then
            if cinv.prepared - cinv.sold <= 0 then
              raise exception '« % » est épuisé pour ce service.', m.name;
            end if;
            raise exception 'Il ne reste que % portion(s) de « % ».', cinv.prepared - cinv.sold, m.name;
          end if;
          update component_inventory set sold = sold + m.need
           where component_id = m.component_id and day = v_day;
        end if;
      end loop;

      for fx in
        select f.item_id, f.quantity * v_qty as need, mi.name
          from meal_fixed_items f join menu_items mi on mi.id = f.item_id
         where f.template_id = t.id
      loop
        select * into inv from restaurant_inventory
         where item_id = fx.item_id and day = v_day for update;
        if found then
          if inv.prepared - inv.sold < fx.need then
            raise exception '« % » n''est plus disponible en quantité suffisante.', fx.name;
          end if;
          update restaurant_inventory set sold = sold + fx.need
           where item_id = fx.item_id and day = v_day;
        end if;
      end loop;

      insert into restaurant_order_items
        (order_id, template_id, template_kind, base_price, name, unit_price,
         quantity, line_total, note, position)
      values (v_order, t.id, t.kind, v_base, t.name, v_unit, v_qty, v_unit * v_qty,
              nullif(btrim(coalesce(v_item->>'note', '')), ''), v_pos)
      returning id into v_line;

      v_subtotal := v_subtotal + (v_unit * v_qty);
      v_pos := v_pos + 1;

      -- What is on the plate, so the kitchen reads it as a plate and not as a
      -- name. Fixed contents are listed too: the pass needs the whole picture.
      insert into order_item_customizations
        (order_item_id, component_id, kind, label, price_delta, quantity, position)
      select v_line, f.item_id is null, 'option', mi.name, 0, f.quantity,
             (row_number() over (order by f.position) - 1)::smallint
        from meal_fixed_items f join menu_items mi on mi.id = f.item_id
       where f.template_id = t.id;

      update order_item_customizations set component_id = null where order_item_id = v_line;

      select count(*) into v_cpos from order_item_customizations where order_item_id = v_line;

      insert into order_item_customizations
        (order_item_id, component_id, kind, label, price_delta, quantity, position)
      select v_line, o.component_id,
             case when o.price_delta > 0 then 'extra' else 'option' end,
             coalesce(c.name, mi.name),
             o.price_delta * greatest(coalesce((x->>'quantity')::smallint, 1), 1),
             greatest(coalesce((x->>'quantity')::smallint, 1), 1),
             (v_cpos + row_number() over (order by mg.position, o.position) - 1)::smallint
        from jsonb_array_elements(v_sel) x
        join meal_group_options o on o.id = (x->>'option_id')::uuid
        join meal_groups mg on mg.id = o.group_id
        left join food_components c on c.id = o.component_id
        left join menu_items mi on mi.id = o.item_id;

      select count(*) into v_cpos from order_item_customizations where order_item_id = v_line;

    ------------------------------------------------------------------------
    -- A dish.
    ------------------------------------------------------------------------
    else
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

      select exists (select 1 from dish_variations where item_id = d.id and active)
        into v_has_sizes;

      v.id := null; v.name := null;
      if v_has_sizes then
        select * into v
          from dish_variations
         where id = nullif(v_item->>'variation_id', '')::uuid and item_id = d.id and active;
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

      v_mods := coalesce(v_item->'modifiers', '[]'::jsonb);

      for m in select (x->>'id')::uuid as id from jsonb_array_elements(v_mods) x loop
        if not exists (
          select 1 from modifiers mo
            join modifier_groups mg on mg.id = mo.group_id
            join menu_item_modifier_groups link on link.group_id = mg.id
           where mo.id = m.id and mo.active and mg.active and link.item_id = d.id
        ) then
          raise exception 'Une option choisie ne s''applique pas à « % ».', d.name;
        end if;
      end loop;

      for g in
        select mg.* from modifier_groups mg
          join menu_item_modifier_groups link on link.group_id = mg.id
         where link.item_id = d.id and mg.active
      loop
        select coalesce(sum(greatest(coalesce((x->>'quantity')::smallint, 1), 1)), 0)
          into v_picked
          from jsonb_array_elements(v_mods) x
          join modifiers mo on mo.id = (x->>'id')::uuid
         where mo.group_id = g.id;

        if v_picked < g.min_select then
          raise exception '« % » : choisissez au moins % option(s) pour « % ».', g.name, g.min_select, d.name;
        end if;
        if v_picked > g.max_select then
          raise exception '« % » : % option(s) au maximum pour « % ».', g.name, g.max_select, d.name;
        end if;
      end loop;

      select * into inv from restaurant_inventory
       where item_id = d.id and day = v_day for update;

      if found then
        if inv.prepared - inv.sold < v_qty then
          if inv.prepared - inv.sold <= 0 then
            raise exception '« % » est épuisé pour ce service.', d.name;
          end if;
          raise exception 'Il ne reste que % portion(s) de « % ».', inv.prepared - inv.sold, d.name;
        end if;
        update restaurant_inventory set sold = sold + v_qty where item_id = d.id and day = v_day;
      end if;

      select v_base + coalesce(sum(mo.price_delta * greatest(coalesce((x->>'quantity')::smallint, 1), 1)), 0)
        into v_unit
        from jsonb_array_elements(v_mods) x
        join modifiers mo on mo.id = (x->>'id')::uuid;
      v_unit := coalesce(v_unit, v_base);

      if v_unit < 0 then
        raise exception 'La configuration de « % » donne un prix négatif.', d.name;
      end if;

      v_name := d.name || coalesce(' (' || v.name || ')', '');

      insert into restaurant_order_items
        (order_id, item_id, variation_id, variation_name, base_price,
         name, unit_price, quantity, line_total, note, position)
      values (v_order, d.id, v.id, v.name, v_base, v_name, v_unit, v_qty, v_unit * v_qty,
              nullif(btrim(coalesce(v_item->>'note', '')), ''), v_pos)
      returning id into v_line;

      v_subtotal := v_subtotal + (v_unit * v_qty);
      v_pos := v_pos + 1;

      insert into order_item_customizations
        (order_item_id, modifier_id, kind, label, price_delta, quantity, position)
      select v_line, mo.id, mo.kind, mo.name,
             mo.price_delta * greatest(coalesce((x->>'quantity')::smallint, 1), 1),
             greatest(coalesce((x->>'quantity')::smallint, 1), 1),
             (row_number() over (order by mg.position, mo.position) - 1)::smallint
        from jsonb_array_elements(v_mods) x
        join modifiers mo on mo.id = (x->>'id')::uuid
        join modifier_groups mg on mg.id = mo.group_id;

      select count(*) into v_cpos from order_item_customizations where order_item_id = v_line;
    end if;

    -- Free text is free text, whatever kind of line it sits on.
    for v_cust in select * from jsonb_array_elements(coalesce(v_item->'customizations', '[]'::jsonb)) loop
      if length(btrim(coalesce(v_cust->>'label', ''))) > 0 then
        insert into order_item_customizations (order_item_id, kind, label, price_delta, position)
        values (v_line,
                case when v_cust->>'kind' = 'allergy' then 'allergy' else 'note' end,
                btrim(v_cust->>'label'), 0, v_cpos);
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
