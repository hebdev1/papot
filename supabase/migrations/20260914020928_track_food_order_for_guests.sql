-- A guest ordering without an account still has to be able to follow the
-- order. The reference alone would be guessable, so the phone number on the
-- order has to match it — and only what a customer already knows comes back.
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
  v_digits text;
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
    -- Deliberately one message for both cases: a wrong phone and a wrong
    -- reference must not be distinguishable.
    raise exception 'Aucune commande ne correspond à cette référence et à ce numéro.'
      using errcode = 'P0002';
  end if;

  select * into l from listings where id = o.listing_id;

  return jsonb_build_object(
    'reference',      o.reference,
    'restaurant',     l.name,
    'restaurant_id',  l.id,
    'status',         o.status,
    'fulfillment',    o.fulfillment,
    'scheduled_for',  o.scheduled_for,
    'created_at',     o.created_at,
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
               'customizations', (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'label', c.label)
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

grant execute on function public.track_food_order(text, text) to anon, authenticated;
;
