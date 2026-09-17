create or replace function public.package_quote(p_package uuid, p_units integer default 1)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_pkg   public.partner_packages;
  v_units integer := greatest(coalesce(p_units, 1), 1);
  v_lines jsonb := '[]'::jsonb;
  v_ref   numeric(12,2) := 0;
  v_known boolean := true;
  v_count integer := 0;
  v_price numeric(12,2);
  v_value numeric(10,2);
  v_total numeric(12,2);
  l       record;
begin
  select * into v_pkg from public.partner_packages where id = p_package;
  if not found then
    return null;
  end if;

  -- A package priced for the whole thing does not scale with the stay; one
  -- priced by night or by day does. The reference side scales either way,
  -- because the guest really is staying that many nights.
  v_price := case
    when v_pkg.basis = 'total'::public.package_basis then v_pkg.price
    else round(v_pkg.price * v_units, 2)
  end;

  for l in
    select pl.id, pl.label, pl.quantity, pl.recurring, pl.reference_value,
           coalesce(u.price, li.price, mi.price) as bound_price,
           num_nonnulls(pl.unit_id, pl.listing_id, pl.menu_item_id) = 1 as is_bound
    from public.package_lines pl
    left join public.listing_units u  on u.id  = pl.unit_id
    left join public.listings      li on li.id = pl.listing_id
    left join public.menu_items    mi on mi.id = pl.menu_item_id
    where pl.package_id = p_package
    order by pl.position, pl.id
  loop
    v_count := v_count + 1;

    -- A bound line reads the price of the thing it points at, every time. It
    -- never carries a copy, so a rate the partner changed this morning is the
    -- rate compared against this afternoon.
    v_value := case when l.is_bound then l.bound_price else l.reference_value end;

    if v_value is null then
      v_known := false;
      v_total := null;
    else
      v_total := round(v_value * l.quantity * (case when l.recurring then v_units else 1 end), 2);
      v_ref := v_ref + v_total;
    end if;

    v_lines := v_lines || jsonb_build_object(
      'id', l.id,
      'label', l.label,
      'quantity', l.quantity,
      'recurring', l.recurring,
      'bound', l.is_bound,
      'value', v_value,
      'total', v_total,
      'value_known', v_value is not null);
  end loop;

  -- No line, nothing to compare: a package that claims to save you money
  -- against nothing would be claiming its whole price as a saving.
  if v_count = 0 then
    v_known := false;
  end if;

  -- `savings` may come back negative, and that is on purpose: the partner
  -- screen has to be able to say "this costs more than the parts". The public
  -- page shows the line only when it is positive.
  return jsonb_build_object(
    'package_id',    v_pkg.id,
    'basis',         v_pkg.basis,
    'units',         v_units,
    'price',         v_price,
    'reference',     case when v_known then v_ref else null end,
    'savings',       case when v_known then round(v_ref - v_price, 2) else null end,
    'savings_known', v_known,
    'lines',         v_lines);
end;
$fn$;

comment on function public.package_quote(uuid, integer) is
  'What a package costs for a stay of p_units nights or days, what its contents would cost separately, and the difference. SECURITY INVOKER: RLS decides what the caller may quote, and create_booking sees everything because it runs as the owner.';

grant execute on function public.package_quote(uuid, integer) to anon, authenticated;;
