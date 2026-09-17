-- A combo's always-included dishes were being written with `f.item_id is null`
-- in the component_id column — a boolean into a uuid. plpgsql only parses a
-- body when it runs, so the function was created happily and failed on the
-- first combo. They are dishes, not components: the column stays null.
do $fix$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_food_order';

  v_new := replace(
    v_def,
    '        (order_item_id, component_id, kind, label, price_delta, quantity, position)' || E'\n' ||
    '      select v_line, f.item_id is null, ''option'', mi.name, 0, f.quantity,',
    '        (order_item_id, kind, label, price_delta, quantity, position)' || E'\n' ||
    '      select v_line, ''option'', mi.name, 0, f.quantity,'
  );

  v_new := replace(
    v_new,
    E'\n' || '      update order_item_customizations set component_id = null where order_item_id = v_line;' || E'\n',
    E'\n'
  );

  if v_new = v_def then
    raise exception 'Le correctif ne s''applique pas : la fonction a changé.';
  end if;

  execute v_new;
end
$fix$;
;
