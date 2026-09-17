-- The resolver gains the revenue dimension. A rule that names the revenue kind
-- beats one that does not, at the same scope; the old two-argument form still
-- answers for callers that do not care.
create or replace function public.effective_commission(
  p_partner_id uuid,
  p_kind       public.listing_kind,
  p_revenue    public.revenue_kind default null
) returns numeric
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select r.percentage
  from commission_rules r
  left join partners p on p.id = p_partner_id
  where r.active
    and (r.starts_on is null or r.starts_on <= current_date)
    and (r.ends_on   is null or r.ends_on   >= current_date)
    and (r.revenue_kind is null or r.revenue_kind = p_revenue)
    and (
      (r.scope = 'partner'      and r.partner_id = p_partner_id) or
      (r.scope = 'service'      and r.service_kind = p_kind) or
      (r.scope = 'partner_type' and r.partner_type = p.type) or
      (r.scope = 'global')
    )
  order by
    (r.revenue_kind is not null and r.revenue_kind = p_revenue) desc,
    case r.scope
      when 'partner' then 1 when 'service' then 2
      when 'partner_type' then 3 else 4 end
  limit 1;
$function$;

-- Marking an order paid is what puts it in the ledger. Nothing is charged
-- online, so this is the moment a cashier confirms the money arrived.
create or replace function public.mark_food_order_paid(
  p_order  uuid,
  p_method text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o          restaurant_orders%rowtype;
  l          listings%rowtype;
  v_method   public.payment_method;
  v_food     numeric(10,2);
  v_delivery numeric(10,2);
  v_tip      numeric(10,2);
  v_total    numeric(10,2);
  v_ref      text;
begin
  select * into o from restaurant_orders where id = p_order;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0002';
  end if;
  select * into l from listings where id = o.listing_id;

  if not (public.partner_can(l.partner_id, 'manage_orders') or public.admin_can('view_payments')) then
    raise exception 'Permission requise : manage_orders' using errcode = '42501';
  end if;
  if o.payment_status = 'paid' then
    raise exception 'Cette commande est déjà réglée.';
  end if;
  if o.status in ('rejected', 'cancelled') then
    raise exception 'Une commande annulée ne se règle pas.';
  end if;

  -- The order's own vocabulary is the customer's; the ledger's is the bank's.
  v_method := case coalesce(p_method, o.payment_method, 'cash')
                when 'moncash' then 'mobile_money'
                when 'natcash' then 'mobile_money'
                when 'card'    then 'card'
                else 'cash' end::public.payment_method;

  -- Each bucket is commissioned at its own rate.
  v_food     := round((o.subtotal - o.discount + o.tax + o.service_fee)
                      * coalesce(public.effective_commission(l.partner_id, 'restaurant', 'food_order'), 0) / 100, 2);
  v_delivery := round(o.delivery_fee
                      * coalesce(public.effective_commission(l.partner_id, 'restaurant', 'delivery'), 0) / 100, 2);
  v_tip      := round(o.tip
                      * coalesce(public.effective_commission(l.partner_id, 'restaurant', 'tip'), 0) / 100, 2);
  v_total    := v_food + v_delivery + v_tip;

  v_ref := 'PAY-' || to_char(now(), 'YYYY') || '-' || substr(replace(p_order::text, '-', ''), 1, 6);

  insert into payments (reference, order_id, customer_id, customer_label, partner_id,
                        amount, currency, commission, method, status, revenue_kind)
  values (v_ref, o.id, o.user_id, o.customer_name, l.partner_id,
          o.total, o.currency, v_total, v_method, 'paid', 'food_order');

  update restaurant_orders
     set payment_status = 'paid',
         payment_method = coalesce(p_method, payment_method)
   where id = p_order;

  return jsonb_build_object(
    'reference', v_ref, 'montant', o.total,
    'commission', v_total,
    'detail', jsonb_build_object('nourriture', v_food, 'livraison', v_delivery, 'pourboire', v_tip),
    'net', o.total - v_total);
end;
$function$;

-- What a restaurant actually earned, split the way §4D asks. Reservations are
-- free today — a table costs the guest nothing — so their line is there and
-- reads zero rather than being hidden.
create or replace function public.restaurant_finance(
  p_partner uuid,
  p_from    date default null,
  p_to      date default null
) returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_from date := coalesce(p_from, (now() at time zone 'America/Port-au-Prince')::date - 29);
  v_to   date := coalesce(p_to,   (now() at time zone 'America/Port-au-Prince')::date);
  v_food jsonb;
  v_res  jsonb;
begin
  if not (public.partner_can(p_partner, 'view_finance') or public.admin_can('view_payments')) then
    raise exception 'Permission requise : view_finance' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'commandes',   count(*),
           'plats',       coalesce(sum(o.subtotal), 0),
           'remises',     coalesce(sum(o.discount), 0),
           'taxes',       coalesce(sum(o.tax), 0),
           'livraison',   coalesce(sum(o.delivery_fee), 0),
           'service',     coalesce(sum(o.service_fee), 0),
           'pourboires',  coalesce(sum(o.tip), 0),
           'encaisse',    coalesce(sum(o.total), 0),
           'rembourse',   coalesce(sum(o.total) filter (where o.status in ('refunded', 'partially_refunded')), 0),
           'panier_moyen', case when count(*) = 0 then 0 else round(coalesce(sum(o.total), 0) / count(*), 2) end,
           'a_emporter',  count(*) filter (where o.fulfillment = 'pickup'),
           'sur_place',   count(*) filter (where o.fulfillment = 'dine_in'),
           'livrees',     count(*) filter (where o.fulfillment = 'delivery'))
    into v_food
    from restaurant_orders o
    join listings l on l.id = o.listing_id
   where l.partner_id = p_partner
     and o.service_day between v_from and v_to
     and o.status not in ('rejected', 'cancelled');

  select jsonb_build_object(
           'reservations', count(*),
           'couverts',     coalesce(sum(bi.party), 0),
           'encaisse',     coalesce(sum(bi.amount), 0))
    into v_res
    from booking_items bi
    join listings l on l.id = bi.listing_id
   where l.partner_id = p_partner
     and bi.kind = 'restaurant'
     and bi.status <> 'cancelled'
     and bi.starts_on between v_from and v_to;

  return jsonb_build_object(
    'du', v_from, 'au', v_to,
    'nourriture', v_food,
    'tables', v_res,
    'commission', (
      select jsonb_build_object(
               'prelevee', coalesce(sum(p.commission), 0),
               'net',      coalesce(sum(p.amount - p.commission), 0),
               'regle',    count(*))
        from payments p
       where p.partner_id = p_partner
         and p.order_id is not null
         and p.status = 'paid'
         and p.created_at::date between v_from and v_to),
    'taux', jsonb_build_object(
      'nourriture', public.effective_commission(p_partner, 'restaurant', 'food_order'),
      'livraison',  public.effective_commission(p_partner, 'restaurant', 'delivery'),
      'pourboire',  public.effective_commission(p_partner, 'restaurant', 'tip')));
end;
$function$;

-- Which dishes actually sell. Views and adds-to-cart are not here: nothing
-- records them yet, and a conversion rate invented from orders alone would be
-- a number that looks like a measurement.
create or replace function public.restaurant_food_stats(
  p_partner uuid,
  p_days    integer default 30
) returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_from date := (now() at time zone 'America/Port-au-Prince')::date - greatest(p_days, 1) + 1;
begin
  if not (public.partner_can(p_partner, 'view_analytics') or public.admin_can('view_analytics')) then
    raise exception 'Permission requise : view_analytics' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'depuis', v_from,
    'plats', (
      select coalesce(jsonb_agg(x order by x->>'revenu' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nom', i.name,
                 'vendus', sum(i.quantity),
                 'revenu', sum(i.line_total),
                 'commandes', count(distinct i.order_id)) as x
          from restaurant_order_items i
          join restaurant_orders o on o.id = i.order_id
          join listings l on l.id = o.listing_id
         where l.partner_id = p_partner
           and o.service_day >= v_from
           and o.status not in ('rejected', 'cancelled')
         group by i.name
         order by sum(i.line_total) desc
         limit 15) t),
    'heures', (
      select coalesce(jsonb_agg(jsonb_build_object('heure', h, 'commandes', n) order by h), '[]'::jsonb) from (
        select extract(hour from o.created_at at time zone 'America/Port-au-Prince')::int as h,
               count(*) as n
          from restaurant_orders o
          join listings l on l.id = o.listing_id
         where l.partner_id = p_partner
           and o.service_day >= v_from
           and o.status not in ('rejected', 'cancelled')
         group by 1) t),
    'composants', (
      select coalesce(jsonb_agg(jsonb_build_object('nom', nom, 'choisi', n) order by n desc), '[]'::jsonb) from (
        select c.label as nom, sum(c.quantity) as n
          from order_item_customizations c
          join restaurant_order_items i on i.id = c.order_item_id
          join restaurant_orders o on o.id = i.order_id
          join listings l on l.id = o.listing_id
         where l.partner_id = p_partner
           and c.component_id is not null
           and o.service_day >= v_from
           and o.status not in ('rejected', 'cancelled')
         group by c.label
         order by sum(c.quantity) desc
         limit 10) t));
end;
$function$;

grant execute on function public.mark_food_order_paid(uuid, text)            to authenticated;
grant execute on function public.restaurant_finance(uuid, date, date)        to authenticated;
grant execute on function public.restaurant_food_stats(uuid, integer)        to authenticated;
;
