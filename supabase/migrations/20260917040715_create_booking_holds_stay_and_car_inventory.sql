do $do$
declare
  src text := pg_get_functiondef('public.create_booking(jsonb)'::regprocedure);
  before text;
begin
  /* 1 — the main item. A restaurant already took its table here; a room and a
     vehicle walked straight past and wrote the line. */
  before := src;
  src := replace(src,
$old$        then 'confirmed' else 'pending' end;
    end if;
$old$,
$new$        then 'confirmed' else 'pending' end;
    elsif v_kind in ('stay', 'car') and v_listing is not null and v_date is not null then
      -- A room and a vehicle are finite too. Until this line existed, the same
      -- room could be sold twice for the same night and nothing anywhere said
      -- so; the guest found out at the front desk.
      perform public.assign_stay_inventory(v_listing, v_unit, v_date, coalesce(v_end, v_date + 1));
    end if;
$new$);
  if src = before then raise exception 'patch 1 (article principal) did not apply'; end if;

  /* 2 — the bound lines of a package need the kind in hand, not in a subquery,
     so the same check can run before the row is written. */
  before := src;
  src := replace(src,
$old$        select pl.label, pl.unit_id, coalesce(u.listing_id, pl.listing_id) as target
          from public.package_lines pl
          left join public.listing_units u on u.id = pl.unit_id
         where pl.package_id = v_pkg_id$old$,
$new$        select pl.label, pl.unit_id, coalesce(u.listing_id, pl.listing_id) as target,
               l2.kind as kind
          from public.package_lines pl
          left join public.listing_units u on u.id = pl.unit_id
          left join public.listings l2 on l2.id = coalesce(u.listing_id, pl.listing_id)
         where pl.package_id = v_pkg_id$new$);
  if src = before then raise exception 'patch 2 (lecture des lignes liées) did not apply'; end if;

  /* 3 — the vehicle inside a paquet is held in its own calendar, so it is held
     against the same inventory as one sold on its own. A free line is still a
     sale; only its price is zero. */
  before := src;
  src := replace(src,
$old$      loop
        insert into public.booking_items
          (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
           starts_on, ends_on, package_id)
        values (
          v_id, v_line.target, v_line.unit_id,
          (select l2.kind from public.listings l2 where l2.id = v_line.target),$old$,
$new$      loop
        if v_line.kind in ('stay', 'car') and v_date is not null then
          perform public.assign_stay_inventory(
            v_line.target, v_line.unit_id, v_date, coalesce(v_end, v_date + 1));
        end if;

        insert into public.booking_items
          (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
           starts_on, ends_on, package_id)
        values (
          v_id, v_line.target, v_line.unit_id,
          v_line.kind,$new$);
  if src = before then raise exception 'patch 3 (lignes liées du paquet) did not apply'; end if;

  execute src;
end
$do$;

comment on function public.create_booking(jsonb) is
  'Writes a booking. Takes the inventory lock for restaurants, stays and vehicles alike, so the last one cannot be sold twice.';;
