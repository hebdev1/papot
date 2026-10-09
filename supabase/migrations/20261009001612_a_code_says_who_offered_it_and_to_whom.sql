-- Reading a code, from whichever table it lives in.
--
-- A company's own code is looked up FIRST. It is the narrower offer and the
-- one a company will expect honoured on its own listings; a platform campaign
-- that happened to pick the same string must not quietly take precedence over
-- it.
--
-- The bearer is decided here and nowhere else, so the sale and the payout
-- cannot disagree about who paid for the discount.
create or replace function public.resolve_discount_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_code  text := upper(btrim(coalesce(p_code, '')));
  p       public.promotions;
  d       public.partner_discounts;
  v_today date := public.haiti_today();
begin
  if v_code = '' then
    return null;
  end if;

  select * into d from public.partner_discounts
   where upper(btrim(coalesce(code, ''))) = v_code
   order by created_at
   limit 1;

  if d.id is not null then
    return jsonb_build_object(
      'source',            'partner_discount',
      'id',                d.id,
      'code',              d.code,
      'label',             d.name,
      'percent',           d.percent,
      'amount',            d.amount,
      'min_spend',         d.min_spend,
      'eligible_kinds',    null,
      'eligible_partners', jsonb_build_array(d.partner_id),
      'eligible_listings', to_jsonb(d.eligible_listings),
      'borne_by',          'partner',
      'usable',            (d.active
                            and (d.starts_on is null or v_today >= d.starts_on)
                            and (d.ends_on   is null or v_today <= d.ends_on)
                            and (d.usage_limit is null or d.used_count < d.usage_limit)),
      'reason', case
        when not d.active then 'Ce code n''est plus actif.'
        when d.starts_on is not null and v_today < d.starts_on
          then 'Ce code n''est pas encore valable.'
        when d.ends_on is not null and v_today > d.ends_on
          then 'Ce code a expiré.'
        when d.usage_limit is not null and d.used_count >= d.usage_limit
          then 'Ce code a atteint sa limite d''utilisation.'
        else null end);
  end if;

  select * into p from public.promotions
   where upper(btrim(coalesce(code, ''))) = v_code
   order by created_at
   limit 1;

  if p.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'source',            'promotion',
    'id',                p.id,
    'code',              p.code,
    'label',             p.name,
    -- The existing admin form labels this field "Remise (%)" only for
    -- `percentage`, and "Remise ($)" for every other kind. That contract is
    -- read here rather than reinvented.
    'percent',           case when p.kind = 'percentage' then p.discount_value end,
    'amount',            case when p.kind = 'percentage' then null else p.discount_value end,
    'min_spend',         p.min_spend,
    'eligible_kinds',    to_jsonb(p.eligible_kinds),
    'eligible_partners', to_jsonb(p.eligible_partners),
    'eligible_listings', null,
    -- Scoped to named partners, it is their offer and their cost. Open to
    -- everyone, it is the platform's campaign and the platform's cost.
    'borne_by',          case when coalesce(array_length(p.eligible_partners, 1), 0) > 0
                              then 'partner' else 'platform' end,
    'usable',            (p.status = 'active'
                          and (p.starts_on is null or v_today >= p.starts_on)
                          and (p.ends_on   is null or v_today <= p.ends_on)
                          and (p.usage_limit is null or p.used_count < p.usage_limit)),
    'reason', case
      when p.status <> 'active' then 'Ce code n''est pas actif.'
      when p.starts_on is not null and v_today < p.starts_on
        then 'Ce code n''est pas encore valable.'
      when p.ends_on is not null and v_today > p.ends_on
        then 'Ce code a expiré.'
      when p.usage_limit is not null and p.used_count >= p.usage_limit
        then 'Ce code a atteint sa limite d''utilisation.'
      else null end);
end;
$fn$;

revoke execute on function public.resolve_discount_code(text) from public;
revoke execute on function public.resolve_discount_code(text) from anon;
revoke execute on function public.resolve_discount_code(text) from authenticated;

-- What the checkout field asks as you type.
--
-- It answers whether the code exists and is live, and what it is worth in the
-- abstract — never what it is worth for your cart. The amount is computed by
-- `create_booking` from prices rebuilt out of the catalogue, and a figure
-- promised here from a browser-supplied subtotal would be a figure the sale
-- could contradict.
--
-- It also says nothing about WHO the code is restricted to: that would turn
-- the field into a way to enumerate which partners are in a campaign.
create or replace function public.check_promo_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare r jsonb;
begin
  r := public.resolve_discount_code(p_code);
  if r is null then
    return jsonb_build_object('valid', false, 'reason', 'Ce code n''existe pas.');
  end if;
  return jsonb_build_object(
    'valid',     (r ->> 'usable')::boolean,
    'reason',    r ->> 'reason',
    'label',     r ->> 'label',
    'percent',   r -> 'percent',
    'amount',    r -> 'amount',
    'min_spend', r -> 'min_spend');
end;
$fn$;

grant execute on function public.check_promo_code(text) to anon, authenticated;;