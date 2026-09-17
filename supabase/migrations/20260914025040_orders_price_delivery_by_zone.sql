do $fix$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_food_order';

  -- 1. Room for the zone and its fee.
  v_new := replace(v_def,
    '  v_has_sizes boolean;' || E'\n' || '  v_name      text;',
    '  v_has_sizes boolean;' || E'\n' ||
    '  v_name      text;' || E'\n' ||
    '  z           delivery_zones%rowtype;' || E'\n' ||
    '  v_fee       numeric(10,2) := 0;');

  -- 2. A pre-order cannot be placed beyond the window the restaurant set.
  v_new := replace(v_new,
    '  v_weekday := extract(isodow from v_local)::smallint - 1;',
    '  v_weekday := extract(isodow from v_local)::smallint - 1;' || E'\n\n' ||
    '  if v_day > (now() at time zone v_zone)::date + s.order_max_advance_days then' || E'\n' ||
    '    raise exception ''Ce restaurant accepte les commandes jusqu''''à % jour(s) à l''''avance.'',' || E'\n' ||
    '      s.order_max_advance_days;' || E'\n' ||
    '  end if;');

  -- 3. The zone decides the fee, and the fee is the restaurant's — never the
  --    payload's. A free-delivery threshold wins over it.
  v_new := replace(v_new,
    '  update restaurant_orders' || E'\n' ||
    '     set subtotal = v_subtotal, tip = v_tip, total = v_subtotal + v_tip' || E'\n' ||
    '   where id = v_order;',
    '  if v_mode = ''delivery'' then' || E'\n' ||
    '    if exists (select 1 from delivery_zones where listing_id = v_listing and active) then' || E'\n' ||
    '      select * into z' || E'\n' ||
    '        from delivery_zones' || E'\n' ||
    '       where id = nullif(p_payload->>''delivery_zone_id'', '''')::uuid' || E'\n' ||
    '         and listing_id = v_listing and active;' || E'\n' ||
    '      if not found then' || E'\n' ||
    '        raise exception ''Choisissez la zone de livraison.'';' || E'\n' ||
    '      end if;' || E'\n' ||
    '      if z.min_order is not null and v_subtotal < z.min_order then' || E'\n' ||
    '        raise exception ''La commande minimum pour % est de % %.'', z.name,' || E'\n' ||
    '          to_char(z.min_order, ''FM999999990.00''), coalesce(l.currency, ''USD'');' || E'\n' ||
    '      end if;' || E'\n' ||
    '      v_fee := z.fee;' || E'\n' ||
    '    end if;' || E'\n' ||
    '    if s.delivery_free_over is not null and v_subtotal >= s.delivery_free_over then' || E'\n' ||
    '      v_fee := 0;' || E'\n' ||
    '    end if;' || E'\n' ||
    '  end if;' || E'\n\n' ||
    '  update restaurant_orders' || E'\n' ||
    '     set subtotal = v_subtotal, tip = v_tip,' || E'\n' ||
    '         delivery_fee = v_fee, delivery_zone_id = z.id,' || E'\n' ||
    '         total = v_subtotal + v_fee + v_tip' || E'\n' ||
    '   where id = v_order;');

  -- 4. And the returned total has to agree with the row.
  v_new := replace(v_new,
    '  return json_build_object(''id'', v_order, ''reference'', v_ref,' || E'\n' ||
    '                           ''total'', v_subtotal + v_tip, ''items'', v_count);',
    '  return json_build_object(''id'', v_order, ''reference'', v_ref,' || E'\n' ||
    '                           ''total'', v_subtotal + v_fee + v_tip, ''items'', v_count);');

  if v_new = v_def then
    raise exception 'Le correctif ne s''applique pas : la fonction a changé.';
  end if;

  execute v_new;
end
$fix$;


-- Tracking now says where it is going and when it is expected.
create or replace function public.track_food_order(
  p_reference text,
  p_phone     text
) returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o        restaurant_orders%rowtype;
  l        listings%rowtype;
  s        restaurant_settings%rowtype;
  z        delivery_zones%rowtype;
  v_digits text;
  v_eta    integer;
begin
  v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_digits) < 6 then
    raise exception 'Indiquez le numéro de téléphone de la commande.';
  end if;

  select * into o
    from restaurant_orders
   where reference = btrim(upper(coalesce(p_reference, '')))
     and regexp_replace(customer_phone, '[^0-9]', '', 'g') = v_digits;

  if not found then
    raise exception 'Aucune commande ne correspond à cette référence et à ce numéro.'
      using errcode = 'P0002';
  end if;

  select * into l from listings where id = o.listing_id;
  select * into s from restaurant_settings where listing_id = o.listing_id;
  if o.delivery_zone_id is not null then
    select * into z from delivery_zones where id = o.delivery_zone_id;
  end if;

  -- Preparation, plus the road when there is one.
  v_eta := coalesce(s.order_prep_minutes, 25)
           + case when o.fulfillment = 'delivery'
                  then coalesce(z.eta_minutes, s.delivery_eta_minutes, 45) else 0 end;

  return jsonb_build_object(
    'reference',      o.reference,
    'restaurant',     l.name,
    'restaurant_id',  l.id,
    'status',         o.status,
    'fulfillment',    o.fulfillment,
    'scheduled_for',  o.scheduled_for,
    'created_at',     o.created_at,
    'expected_at',    coalesce(o.scheduled_for, o.created_at + make_interval(mins => v_eta)),
    'zone',           z.name,
    'subtotal',       o.subtotal,
    'delivery_fee',   o.delivery_fee,
    'tip',            o.tip,
    'total',          o.total,
    'currency',       o.currency,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'rejection_reason', o.rejection_reason,
    'address',        o.address,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', i.name, 'quantity', i.quantity, 'line_total', i.line_total,
               'note', i.note,
               'customizations', (select coalesce(jsonb_agg(jsonb_build_object(
                                            'kind', c.kind, 'label', c.label, 'quantity', c.quantity)
                                            order by c.position), '[]'::jsonb)
                                    from order_item_customizations c where c.order_item_id = i.id))
               order by i.position), '[]'::jsonb)
        from restaurant_order_items i where i.order_id = o.id),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'at', h.at) order by h.at), '[]'::jsonb)
        from order_status_history h where h.order_id = o.id)
  );
end;
$function$;
;
