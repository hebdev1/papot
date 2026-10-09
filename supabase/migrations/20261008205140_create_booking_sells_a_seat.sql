-- create_booking learns to sell a seat, and to be safe to retry.
--
-- Replaced in full from pg_get_functiondef() rather than patched textually: the
-- repository's copy of this function could not be reconstructed byte-exactly
-- after four `replace()` patches, which is the trap that made every further
-- change to it risky. The body below is what the database runs.
--
-- Three changes:
--
-- 1. The option object handed to quote_booking_item carries everything the
--    browser named, not just the two car fields. It still carries no prices.
-- 2. A bus line claims its seats. The booking_items row is written first
--    because a seat is stamped with the line that bought it, and
--    assign_bus_seats then takes them with `for update skip locked`. A kind
--    absent from this chain takes no lock at all and sells without limit.
-- 3. An idempotency key. A retried checkout, a double-tapped button or a
--    replayed gateway callback returns the first booking instead of selling the
--    same seat twice to the same person.
alter table public.bookings
  add column if not exists idempotency_key text;

create unique index if not exists bookings_idempotency_key
  on public.bookings (idempotency_key) where idempotency_key is not null;

create or replace function public.create_booking(p_payload jsonb)
returns json
language plpgsql security definer set search_path = public, pg_temp as $function$
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
  v_line    record;
  v_item_id uuid;
  v_idem    text;
  v_dep     uuid;
  v_pax     integer;
  v_seats   smallint[];
  v_seatsel smallint[];
  v_pass    jsonb;
  v_one     jsonb;
  v_i       integer;
  v_each    numeric(10,2);
  v_sum     numeric(10,2);
  v_code    text;
begin
  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Le panier est vide.';
  end if;

  -- A key makes this function safe to call twice. Without one it behaves as it
  -- always has.
  v_idem := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  if v_idem is not null then
    select b.id, b.reference, b.total into v_id, v_ref, v_total
      from public.bookings b where b.idempotency_key = v_idem;
    if v_id is not null then
      return json_build_object('id', v_id, 'reference', v_ref, 'total', v_total,
                               'replayed', true);
    end if;
  end if;

  v_ref := public.next_booking_reference();

  -- The total is no longer summed from the payload before the loop: a package
  -- is priced here, not in the browser, so the figure is only known once every
  -- item has been written. It is set at the end, which also means the total and
  -- the items can no longer disagree.
  insert into public.bookings
    (reference, user_id, first_name, last_name, email, phone, payment_method, total,
     idempotency_key)
  values (
    v_ref, auth.uid(),
    trim(p_payload->>'first_name'), trim(p_payload->>'last_name'),
    trim(p_payload->>'email'), trim(p_payload->>'phone'),
    coalesce(p_payload->>'payment_method', 'card'), 0, v_idem)
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
    v_dep     := nullif(v_item->>'departure_id', '')::uuid;
    v_seats   := null;

    if v_pkg_id is null then
      -- The kind of a sale is a fact about the annonce. The package branch
      -- below has always read it from `listings`; this one trusted the cart,
      -- and through it the cart chose the tariff and the inventory lock.
      select l.kind into v_kind from public.listings l where l.id = v_listing;
      if v_kind is null then
        raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
      end if;
      v_title  := v_item->>'title';
      v_detail := coalesce(v_item->>'detail', '');
      -- The tariff is rebuilt from the catalogue. What the browser sent is
      -- read only for the options it names - a driver, a pickup point, a
      -- departure, a fare class - never for what they cost.
      v_amount := public.quote_booking_item(
        v_kind, v_listing, v_unit, v_date, v_end,
        jsonb_build_object(
          'with_driver',  v_item->'with_driver',
          'pickup',       v_item->>'pickup',
          'departure_id', v_item->>'departure_id',
          'fare_class',   v_item->>'fare_class',
          'passengers',   greatest(coalesce(v_party, 1), 1),
          'extra_bags',   v_item->>'extra_bags'));
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
    elsif v_kind in ('stay', 'car') and v_listing is not null and v_date is not null then
      -- A room and a vehicle are finite too. Until this line existed, the same
      -- room could be sold twice for the same night and nothing anywhere said
      -- so; the guest found out at the front desk.
      perform public.assign_stay_inventory(v_listing, v_date, coalesce(v_end, v_date + 1), v_unit);
    end if;

    insert into public.booking_items
      (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
       starts_on, ends_on, start_time, party, table_id, package_id)
    values (
      v_id, v_listing, v_unit, v_kind, v_title, v_detail, v_amount, v_status, v_pos,
      v_date, v_end, v_time, v_party, v_table, v_pkg_id)
    returning id into v_item_id;

    -- A seat is claimed after the line exists, because the seat row carries the
    -- id of the line that bought it. Raising here rolls the line back with it.
    if v_kind = 'bus' then
      if v_dep is null then
        raise exception 'Ce billet ne précise pas son départ.';
      end if;
      v_pax := greatest(coalesce(v_party, 1), 1);

      v_pass := coalesce(v_item->'passengers', '[]'::jsonb);
      if jsonb_array_length(v_pass) <> v_pax then
        raise exception 'Indiquez le nom de chaque passager (% place(s)).', v_pax;
      end if;

      -- Chosen seats, when the coach has a plan and the passenger picked.
      select array_agg((value)::smallint) into v_seatsel
        from jsonb_array_elements_text(coalesce(v_item->'seat_nos', '[]'::jsonb));
      if coalesce(array_length(v_seatsel, 1), 0) = 0 then
        v_seatsel := null;
      elsif array_length(v_seatsel, 1) <> v_pax then
        raise exception 'Choisissez % place(s), ou laissez-nous les attribuer.', v_pax;
      end if;

      v_seats := public.assign_bus_seats(
        v_dep, v_item_id, v_pax, v_seatsel,
        case when auth.uid() is null then null else 'u:' || auth.uid()::text end);

      -- One ticket per passenger, each on the seat actually obtained. The
      -- per-ticket figure is the line divided evenly, with the remainder on the
      -- last one so the tickets sum to the line exactly — the money of record
      -- stays the booking_items row.
      v_each := round(v_amount / v_pax, 2);
      v_sum := 0;
      for v_i in 1 .. v_pax loop
        v_one := v_pass->(v_i - 1);
        if coalesce(btrim(v_one->>'first'), '') = ''
           or coalesce(btrim(v_one->>'last'), '') = '' then
          raise exception 'Le nom et le prénom de chaque passager sont obligatoires.';
        end if;

        loop
          v_code := public.bus_ticket_code(8, true);
          exit when not exists (select 1 from public.bus_tickets t where t.ticket_no = 'BUS-' || v_code);
        end loop;

        insert into public.bus_tickets
          (booking_item_id, departure_id, seat_no, seat_code,
           passenger_first, passenger_last, passenger_phone, passenger_email,
           fare_class, amount, ticket_no, qr_code, access_token)
        values (
          v_item_id, v_dep, v_seats[v_i],
          (select s.code from public.bus_departure_seats s
            where s.departure_id = v_dep and s.seat_no = v_seats[v_i]),
          btrim(v_one->>'first'), btrim(v_one->>'last'),
          nullif(btrim(coalesce(v_one->>'phone', '')), ''),
          -- Only the purchaser's address, and only on the first ticket: a
          -- companion's email is not needed to carry them.
          case when v_i = 1 then nullif(btrim(coalesce(p_payload->>'email', '')), '') end,
          coalesce(nullif(btrim(coalesce(v_item->>'fare_class', '')), ''), 'standard'),
          case when v_i = v_pax then v_amount - v_sum else v_each end,
          'BUS-' || v_code,
          public.bus_ticket_code(26, false),
          public.bus_ticket_code(26, false));
        v_sum := v_sum + v_each;
      end loop;
    end if;

    v_total := v_total + v_amount;
    v_pos := v_pos + 1;

    -- Every other bound line gets its own row at zero, so the vehicle is held
    -- in its own calendar and the money stays in one place. A dish is not a
    -- bookable thing and stays in the detail above.
    if v_pkg_id is not null then
      for v_line in
        select pl.label, pl.unit_id, coalesce(u.listing_id, pl.listing_id) as target,
               l2.kind as kind
          from public.package_lines pl
          left join public.listing_units u on u.id = pl.unit_id
          left join public.listings l2 on l2.id = coalesce(u.listing_id, pl.listing_id)
         where pl.package_id = v_pkg_id
           and coalesce(u.listing_id, pl.listing_id) is not null
           -- Everything except the line that already became the main article:
           -- the annonce itself, or the room type chosen from it.
           and not (coalesce(u.listing_id, pl.listing_id) = v_pkg.listing_id
                    and (pl.unit_id is null or pl.unit_id = v_unit))
         order by pl.position, pl.id
      loop
        if v_line.kind in ('stay', 'car') and v_date is not null then
          perform public.assign_stay_inventory(
            v_line.target, v_date, coalesce(v_end, v_date + 1), v_line.unit_id);
        end if;

        insert into public.booking_items
          (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position,
           starts_on, ends_on, package_id)
        values (
          v_id, v_line.target, v_line.unit_id,
          v_line.kind,
          v_line.label, 'Compris dans le paquet « ' || v_pkg.name || ' »',
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
