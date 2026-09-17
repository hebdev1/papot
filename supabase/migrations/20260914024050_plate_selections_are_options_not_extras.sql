-- On a built plate everything chosen *is* the plate: labelling the protein
-- "EXTRA GRIOT" on the pass is wrong. The money is already carried by
-- price_delta; the kind says what the line is, and here it is a choice.
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
    '             case when o.price_delta > 0 then ''extra'' else ''option'' end,',
    '             ''option'','
  );

  if v_new = v_def then
    raise exception 'Le correctif ne s''applique pas : la fonction a changé.';
  end if;

  execute v_new;
end
$fix$;
;
