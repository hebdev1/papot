create or replace function public.create_booking(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id      uuid;
  v_ref     text;
  v_total   numeric(10,2) := 0;
  v_item    jsonb;
  v_pos     integer := 0;
  v_kind    public.listing_kind;
  v_table   uuid;
  v_status  public.booking_status;
  v_listing uuid;
  v_unit    uuid;
  v_date    date;
  v_end     date;
  v_time    time;
  v_party   smallint;
  v_title   text;
  v_detail  text;
  v_amount  numeric(10,2);
  v_pkg_id  uuid;
  v_pkg     public.partner_packages;
  v_units   integer;
  l         record;
begin
  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Le panier est vide.';
  end if;

  v_ref := public.next_booking_reference();

  -- The total is no longer summed from the payload before the loop: a package
  -- is priced here, not in the browser, so the figure is only known once every
  -- item has been written. It is set at the end, which also means the total and
  -- the items can no longer disagree.
  insert into public.bookings
    (reference, user_id, first_name, last_name, email, phone, payment_method, total)
  values (
    v_ref, auth.uid(),
    trim(p_payload->>'first_name'), trim(p_payload->>'last_name'),
    trim(p_payload->>'email'), trim(p_payload->>'phone'),
    coalesce(p_payload->>'payment_method', 'card'), 0)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_listing := nullif(v_item->>'listing_id', '')::uuid;
    v_unit    := nullif(v_item->>'unit_id', '')::uuid;
    v_date    := nullif(v_item->>'starts_on', '')::date;
    v_end     := nullif(v_item->>'ends_on', '')::date;
    v_time    := nullif(v_item->>'start_time', '')::time;
    v_party   := nullif(v_item->>'party', '')::smallint;
    v_pkg_id  := nullif(v_item->>'package_id', '')::uuid;
    v_table   := null;
    v_status  := 'confirmed';

    if v_pkg_id is null then
      v_kind   := (v_item->>'kind')::public.listing_kind;
      v_title  := v_item->>'title';
      v_detail := coalesce(v_item->>'detail', '');
      v_amount := coalesce((v_item->>'amount')::numeric, 0);
    else
      -- The lock is what stops the 20th and the 21st buyer from taking the last
      -- sale together: it is held until this transaction ends.
      select * into v_pkg from public.partner_packages where id = v_pkg_id for update;
      if not found then
        raise exception 'Cette offre n''existe plus.';
      end if;

      if not v_pkg.active
         or not exists (select 1 from public.listings l
                        where l.id = v_pkg.listing_id and l.published) then
        raise exception 'Cette offre n''est plus proposée.';
      end if;

      if (v_pkg.starts_on is not null and public.haiti_today() < v_pkg.starts_on)
         or (v_pkg.ends_on is not null and public.haiti_today() > v_pkg.ends_on) then
        raise exception 'Cette offre n''est plus valable aujourd''hui.';
      end if;

      v_units := greatest(coalesce(v_end - v_date, 1), 1);

      if v_pkg.min_units is not null and v_units < v_pkg.min_units then
        raise exception 'Cette offre demande au moins % %.', v_pkg.min_units,
          case when v_pkg.basis = 'per_day'::public.package_basis then 'jours' else 'nuits' end;
      end if;

      if v_pkg.usage_limit is not null and v_pkg.used_count >= v_pkg.usage_limit then
        raise exception 'Cette offre a atteint son nombre de ventes.';
      end if;

      -- The price is read here. Whatever the payload claimed is ignored, and so
      -- is the annonce it named: both come from the package.
      v_amount  := (public.package_quote(v_pkg.id, v_units)->>'price')::numeric;
      v_listing := v_pkg.listing_id;
      v_title   := v_pkg.name;
      select l.kind into v_kind from public.listings l where l.id = v_listing;

      -- A bound line pointing at the package's own annonce IS this item; it
      -- does not get one of its own.
      select u.id into v_unit
        from public.package_lines pl
        join public.listing_units u on u.id = pl.unit_id
       where pl.package_id = v_pkg.id and u.listing_id = v_pkg.listing_id
       order by pl.position, pl.id
       limit 1;

      select string_agg(
               pl.label || case when pl.quantity > 1 then ' ×' || pl.quantity else '' end,
               ', ' order by pl.position, pl.id)
        into v_detail
        from public.package_lines pl
       where pl.package_id = v_pkg.id;
      v_detail := 'Paquet « ' || v_pkg.name || ' »'
                  || case when v_detail is null then '' else ' : ' || v_detail end;

      update public.partner_packages
         set used_count = used_count + 1
       where id = v_pkg.id;
    end if;

    -- A table is a finite thing: the seat is taken here, inside the same
    -- transaction as the booking, or the checkout fails with a reason the
    -- guest can act on.
    if v_kind = 'restaurant' then
      v_table := public.assign_restaurant_table(v_listing, v_date, v_time, coalesce(v_party, 2));
      v_status := case
        when coalesce((select rs.auto_confirm from public.restaurant_settings rs
                        where rs.listing_id = v_listing), true)
        then 'confirmed' else 'pending' end;
    end if;

    insert into public.booking_items
      (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
       starts_on, ends_on, start_time, party, table_id, package_id)
    values (
      v_id, v_listing, v_unit, v_kind, v_title, v_detail, v_amount, v_status, v_pos,
      v_date, v_end, v_time, v_party, v_table, v_pkg_id);
    v_total := v_total + v_amount;
    v_pos := v_pos + 1;

    -- Every other bound line gets its own row at zero, so the vehicle is held
    -- in its own calendar and the money stays in one place. A dish is not a
    -- bookable thing and stays in the detail above.
    if v_pkg_id is not null then
      for l in
        select pl.label, pl.unit_id, coalesce(u.listing_id, pl.listing_id) as target
          from public.package_lines pl
          left join public.listing_units u on u.id = pl.unit_id
         where pl.package_id = v_pkg_id
           and coalesce(u.listing_id, pl.listing_id) is not null
           and coalesce(u.listing_id, pl.listing_id) <> v_pkg.listing_id
         order by pl.position, pl.id
      loop
        insert into public.booking_items
          (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
           starts_on, ends_on, package_id)
        values (
          v_id, l.target, l.unit_id,
          (select l2.kind from public.listings l2 where l2.id = l.target),
          l.label, 'Compris dans le paquet « ' || v_pkg.name || ' »',
          0, 'confirmed', v_pos, v_date, v_end, v_pkg.id);
        v_pos := v_pos + 1;
      end loop;
    end if;
  end loop;

  update public.bookings set total = v_total, status = 'confirmed' where id = v_id;

  perform public.attach_items_to_trips(v_id);

  return json_build_object('id', v_id, 'reference', v_ref, 'total', v_total);
end;
$function$;;
