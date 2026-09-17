-- A test gateway, so the whole customer journey can be walked end to end
-- before a real processor exists. It is a switch in platform_settings rather
-- than a build flag: staff turn it off from /admin/parametres the day real
-- money arrives, with no deploy, and a browser cannot reach past it.
insert into public.platform_settings
  (key, group_name, label_fr, value, value_type, help_fr, position)
values (
  'demo_payments',
  'Paiements',
  'Cartes de démonstration',
  'true'::jsonb,
  'boolean',
  'Permet de payer avec des numéros de test pour parcourir le site comme un client. Aucun argent ne circule. À éteindre avant de brancher une vraie passerelle.',
  200)
on conflict (key) do nothing;

/**
 * What a demo instrument does.
 *
 * The numbers are the published test cards every payment processor documents:
 * they are instantly recognisable as tests, and nobody mistakes one for a real
 * card. Returning a reason rather than a boolean is the point — the refusal
 * path is the one that breaks first in real life, so it has to be walkable.
 */
create or replace function public.demo_instrument_result(p_method text, p_number text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select case regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g')
    when '4242424242424242' then null
    when '4000000000000002' then 'Carte refusée par la banque.'
    when '4000000000009995' then 'Provision insuffisante.'
    when '4000000000000069' then 'Carte expirée.'
    when '5090000000000000' then null
    when '5090000000000001' then 'Paiement mobile refusé.'
    else case when p_method = 'card'
      then 'Numéro de carte inconnu. Utilisez une carte de démonstration.'
      else 'Numéro inconnu. Utilisez un numéro de démonstration.' end
  end;
$fn$;

comment on function public.demo_instrument_result(text, text) is
  'Null when the demo instrument is accepted, otherwise the French reason it was refused.';

/**
 * Pay, then book — in one transaction.
 *
 * A refusal writes nothing at all: no booking, no payment row. That is the
 * whole reason this sits in the database rather than in the browser. A checkout
 * that creates the booking first and judges the card afterwards leaves confirmed
 * bookings behind every decline, and that is the bug this shape cannot have.
 *
 * One payment row per partner: a cart can hold a stay from one business and a
 * car from another, and each is owed its own settlement line.
 */
create or replace function public.demo_checkout(p_payload jsonb, p_number text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
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

  for v_part in
    select l.partner_id,
           sum(bi.amount)                             as amount,
           min(bi.kind::text)                         as kind,
           count(*)                                   as lines
      from public.booking_items bi
      join public.listings l on l.id = bi.listing_id
     where bi.booking_id = v_id and l.partner_id is not null
     group by l.partner_id
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
        public.effective_commission(v_part.partner_id, v_part.kind::public.listing_kind), 0) / 100, 2),
      case when v_method = 'card' then 'card'::public.payment_method
           else 'mobile_money'::public.payment_method end,
      'demo',
      'demo_' || substr(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g'), 13, 4),
      'paid'::public.payment_status);
  end loop;

  return v_booking;
end;
$fn$;

comment on function public.demo_checkout(jsonb, text) is
  'Demo gateway: validates a test instrument, then books and records payment in one transaction. A refusal leaves nothing behind.';

grant execute on function public.demo_instrument_result(text, text) to anon, authenticated;
grant execute on function public.demo_checkout(jsonb, text) to anon, authenticated;;
