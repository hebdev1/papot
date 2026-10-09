-- `demo_checkout`, rewritten in full so a discount lands on whoever offered it.
--
-- Two shapes, decided by `booking_items.discount_borne_by`:
--
--   partner  — the company's own offer. Its `amount` drops by its share, and
--              commission is taken on the reduced figure. `sum(amount)` still
--              equals `bookings.total`.
--   platform — PAPOT's campaign. The company is paid in FULL and the discount
--              comes out of the commission, floored at zero. Gross therefore
--              exceeds what the customer paid, which is the truth: the
--              platform funded the difference, and `discount_borne_by` on the
--              row is what lets a report say so instead of reading it as a
--              hole.
--
-- Worked through, on a 20 $ sale at 10 % with a 2 $ code:
--   partner  -> amount 18.00, commission 1.80. Customer paid 18, PAPOT keeps 1.80.
--   platform -> amount 20.00, commission 0.00. Customer paid 18, PAPOT is 2 down.
create or replace function public.demo_checkout(p_payload jsonb, p_number text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_enabled    boolean;
  v_method     text := coalesce(p_payload->>'payment_method', 'card');
  v_reason     text;
  v_booking    json;
  v_id         uuid;
  v_ref        text;
  v_part       record;
  v_rate       numeric;
  v_amount     numeric(10,2);
  v_commission numeric(10,2);
begin
  select coalesce((value)::boolean, false) into v_enabled
    from public.platform_settings where key = 'demo_payments';

  if not coalesce(v_enabled, false) then
    raise exception 'Les paiements de démonstration sont désactivés.';
  end if;

  v_reason := public.demo_instrument_result(v_method, p_number);
  if v_reason is not null then
    -- Nothing has been written yet, and nothing will be.
    raise exception '%', v_reason;
  end if;

  v_booking := public.create_booking(p_payload);
  v_id  := (v_booking->>'id')::uuid;
  v_ref := v_booking->>'reference';

  -- A replayed call returns the first booking; its money was already taken.
  if exists (select 1 from public.payments where booking_id = v_id) then
    return v_booking;
  end if;

  for v_part in
    select l.partner_id,
           bi.kind                        as kind,
           sum(bi.amount)                 as gross,
           coalesce(sum(bi.discount), 0)  as discount,
           -- One code per booking, so one bearer; rows with no discount are
           -- null and `max` passes over them.
           max(bi.discount_borne_by)      as borne_by,
           count(*)                       as lines
      from public.booking_items bi
      join public.listings l on l.id = bi.listing_id
     where bi.booking_id = v_id and l.partner_id is not null
     group by l.partner_id, bi.kind
  loop
    v_rate := coalesce(
      public.effective_commission(v_part.partner_id, v_part.kind, null::public.revenue_kind), 0);

    if v_part.borne_by = 'platform' then
      v_amount     := v_part.gross;
      v_commission := greatest(round(v_part.gross * v_rate / 100, 2) - v_part.discount, 0);
    else
      v_amount     := v_part.gross - v_part.discount;
      v_commission := round(v_amount * v_rate / 100, 2);
    end if;

    insert into public.payments
      (reference, booking_id, booking_ref, customer_id, customer_label, partner_id,
       amount, currency, commission, method, processor, processor_ref, status,
       discount, discount_borne_by)
    values (
      'DEMO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      v_id, v_ref, auth.uid(),
      trim(coalesce(p_payload->>'first_name', '') || ' ' || coalesce(p_payload->>'last_name', '')),
      v_part.partner_id,
      v_amount, 'USD',
      v_commission,
      case when v_method = 'card' then 'card'::public.payment_method
           else 'mobile_money'::public.payment_method end,
      'demo',
      'demo_' || substr(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g'), 13, 4),
      'paid'::public.payment_status,
      v_part.discount, v_part.borne_by);
  end loop;

  return v_booking;
end;
$function$;;