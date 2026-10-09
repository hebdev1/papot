-- demo_checkout charges each kind at its own rate, and pays only once.
--
-- Two bugs, both invisible until a fourth kind existed.
--
-- The grouping took `min(bi.kind::text)` per partner and fed it to
-- effective_commission. With three kinds a partner sold one of them, so the
-- wrong-rate case never arose. **'bus' sorts before 'car', 'restaurant' and
-- 'stay'**, so the moment any partner sells a ticket alongside anything else,
-- every line they sold is charged the transport rate. Grouping by
-- (partner_id, kind) fixes it, at the cost of one payments row per partner per
-- kind rather than per partner — which is more honest anyway: two rates were
-- always two revenue lines.
--
-- And create_booking can now replay an idempotent call, returning the booking
-- it made the first time. Without the guard below, the second call would write
-- a second set of payments rows against it and double the partner's revenue.
create or replace function public.demo_checkout(p_payload jsonb, p_number text)
returns json
language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_enabled boolean;
  v_method  text := coalesce(p_payload->>'payment_method', 'card');
  v_reason  text;
  v_booking json;
  v_id      uuid;
  v_ref     text;
  v_part    record;
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
           bi.kind                                    as kind,
           sum(bi.amount)                             as amount,
           count(*)                                   as lines
      from public.booking_items bi
      join public.listings l on l.id = bi.listing_id
     where bi.booking_id = v_id and l.partner_id is not null
     group by l.partner_id, bi.kind
  loop
    insert into public.payments
      (reference, booking_id, booking_ref, customer_id, customer_label, partner_id,
       amount, currency, commission, method, processor, processor_ref, status)
    values (
      'DEMO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      v_id, v_ref, auth.uid(),
      trim(coalesce(p_payload->>'first_name', '') || ' ' || coalesce(p_payload->>'last_name', '')),
      v_part.partner_id,
      v_part.amount, 'USD',
      round(v_part.amount * coalesce(
        public.effective_commission(v_part.partner_id, v_part.kind, null::public.revenue_kind), 0) / 100, 2),
      case when v_method = 'card' then 'card'::public.payment_method
           else 'mobile_money'::public.payment_method end,
      'demo',
      'demo_' || substr(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g'), 13, 4),
      'paid'::public.payment_status);
  end loop;

  return v_booking;
end;
$function$;;
