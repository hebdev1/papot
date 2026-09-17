/**
 * Single entry point for the onboarding wizard.
 *
 * The wizard's form collects credentials and payment instruments that must
 * never reach this table, so the payload is filtered here rather than trusted
 * from the browser: secrets are dropped outright, and payout keeps only a
 * non-sensitive whitelist. Enforcing it server-side means a tampered client
 * cannot store them either.
 */
create or replace function public.submit_partner_application(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  v_details jsonb;
  v_payout  jsonb;
  -- Never persisted: auth credentials and raw payment instruments.
  v_secret_keys text[] := array[
    'password', 'confirmPassword', 'cvv', 'cvc',
    'cardNum', 'cardExp', 'cardName',
    'accountNum', 'routing'
  ];
  v_key text;
begin
  if coalesce(trim(p_payload->>'email'), '') = '' then
    raise exception 'Courriel requis.';
  end if;
  if (p_payload->>'agree')::boolean is not true then
    raise exception 'Les conditions doivent être acceptées.';
  end if;

  v_details := coalesce(p_payload->'details', '{}'::jsonb);
  foreach v_key in array v_secret_keys loop
    v_details := v_details - v_key;
  end loop;

  -- Payout: explicit allow-list, so new sensitive fields cannot leak in later.
  v_payout := jsonb_strip_nulls(jsonb_build_object(
    'accountHolder', p_payload#>>'{payout,accountHolder}',
    'bankName',      p_payload#>>'{payout,bankName}',
    'payCountry',    p_payload#>>'{payout,payCountry}',
    'currency',      p_payload#>>'{payout,currency}',
    'mobileService', p_payload#>>'{payout,mobileService}',
    'mobileHolder',  p_payload#>>'{payout,mobileHolder}',
    'accountLast4',  right(nullif(p_payload#>>'{payout,accountNum}', ''), 4)
  ));

  insert into public.partner_applications
    (type, user_id, first_name, last_name, email, phone, agree,
     business_name, city, details, amenities, inventory, hours, payout, photos)
  values (
    (p_payload->>'type')::public.partner_type,
    auth.uid(),
    trim(coalesce(p_payload->>'first_name', '')),
    trim(coalesce(p_payload->>'last_name', '')),
    trim(p_payload->>'email'),
    trim(coalesce(p_payload->>'phone', '')),
    true,
    nullif(trim(coalesce(p_payload->>'business_name', '')), ''),
    nullif(trim(coalesce(p_payload->>'city', '')), ''),
    v_details,
    coalesce(array(select jsonb_array_elements_text(p_payload->'amenities')), '{}'),
    coalesce(p_payload->'inventory', '[]'::jsonb),
    coalesce(p_payload->'hours', '{}'::jsonb),
    v_payout,
    coalesce(array(select jsonb_array_elements_text(p_payload->'photos')), '{}')
  )
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

revoke all on function public.submit_partner_application(jsonb) from public;
grant execute on function public.submit_partner_application(jsonb) to anon, authenticated;;
