/**
 * `create_booking` stops believing the payload about money.
 *
 * The paquet branch already re-read its price and ignored whatever `amount`
 * arrived. The other branch took the number as given, so any line that was not
 * a paquet could be bought at a price the buyer chose.
 */
do $do$
declare
  src text := pg_get_functiondef('public.create_booking(jsonb)'::regprocedure);
  before text;
begin
  before := src;
  src := replace(src,
$old$      v_amount := coalesce((v_item->>'amount')::numeric, 0);$old$,
$new$      -- The tariff is rebuilt from the catalogue. What the browser sent is
      -- read only for the options it names - a driver, a pickup point - never
      -- for what they cost.
      v_amount := public.quote_booking_item(
        v_kind, v_listing, v_unit, v_date, v_end,
        jsonb_build_object(
          'with_driver', v_item->'with_driver',
          'pickup',      v_item->>'pickup'));$new$);
  if src = before then raise exception 'la prise du montant est introuvable'; end if;

  execute src;
end
$do$;

comment on function public.create_booking(jsonb) is
  'Writes a booking. Prices every line from the catalogue, and takes the inventory lock so the last one cannot be sold twice.';;
