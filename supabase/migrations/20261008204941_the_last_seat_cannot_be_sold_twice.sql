-- Selling a seat, and the four ways of asking about one.
--
-- The allocation is the whole point of shaping capacity as rows. Two buyers of
-- the last seat contend for one row: `for update skip locked` hands it to the
-- first and makes it invisible to the second, which then finds fewer rows than
-- it asked for and is told. The second sale is not refused by a count coming
-- out right — there is simply no second row to sell.
--
-- `skip locked` rather than plain `for update` on purpose: a buyer must not
-- queue behind another buyer's payment. They take the next free seat instead,
-- and only a genuinely full coach refuses.
create or replace function public.assign_bus_seats(
  p_departure uuid,
  p_item      uuid,
  p_qty       integer,
  p_seats     smallint[] default null,
  p_hold_key  text default null
) returns smallint[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d       public.bus_departures;
  v_want  integer := greatest(coalesce(p_qty, 1), 1);
  v_taken smallint[];
begin
  -- Read the row before counting anything. `perform 1 … for update` on a row
  -- that does not exist takes no lock and carries on, which is the latent
  -- shape in assign_stay_inventory; here a missing departure raises.
  select * into d from public.bus_departures where id = p_departure;
  if d.id is null then
    raise exception 'Ce départ n''existe plus.' using errcode = 'P0002';
  end if;
  if d.status = 'cancelled' then
    raise exception 'Ce départ a été annulé.';
  end if;
  if d.status in ('departed', 'arrived', 'completed') then
    raise exception 'Ce départ est déjà parti.';
  end if;
  if d.departs_on < public.haiti_today() then
    raise exception 'Ce départ est passé.';
  end if;
  if v_want > d.seats_total then
    raise exception 'Ce départ n''a que % places.', d.seats_total;
  end if;

  with picked as (
    select s.seat_no
      from public.bus_departure_seats s
     where s.departure_id = p_departure
       and s.booking_item_id is null
       and not s.blocked
       -- A live hold belonging to someone else is as unavailable as a sale.
       -- The buyer's own hold is theirs to convert, which is what makes a hold
       -- worth taking.
       and (s.held_until is null
            or s.held_until < now()
            or (p_hold_key is not null and s.held_by = p_hold_key))
       and (p_seats is null or s.seat_no = any (p_seats))
     order by s.seat_no
     limit v_want
     for update skip locked
  ), claimed as (
    update public.bus_departure_seats t
       set booking_item_id = p_item,
           held_by = null,
           held_until = null
     where t.departure_id = p_departure
       and t.seat_no in (select seat_no from picked)
    returning t.seat_no
  )
  select array_agg(seat_no order by seat_no) into v_taken from claimed;

  if coalesce(array_length(v_taken, 1), 0) < v_want then
    -- The partial claim is undone with everything else: this runs inside
    -- create_booking's transaction, so raising is the rollback.
    if p_seats is not null then
      raise exception 'Une des places choisies vient d''être prise. Choisissez-en une autre.';
    end if;
    raise exception 'Il ne reste plus assez de places sur ce départ.';
  end if;

  return v_taken;
end;
$$;

-- Internal. Reachable only from create_booking, which is itself reachable only
-- from a payment function — the rule AGENTS.md states for the whole booking
-- path, and the reason a loop over departures cannot fill every coach.
revoke all on function public.assign_bus_seats(uuid, uuid, integer, smallint[], text)
  from public, anon, authenticated;

/**
 * How many seats are left on one departure.
 *
 * Counts only. A passenger may know that four seats are free; who holds the
 * other forty-eight is not their business, which is why the seats table has no
 * anon policy and this function exists instead.
 */
create or replace function public.bus_availability(p_departure uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.bus_departures;
  v_published boolean;
  v_sold integer; v_held integer; v_blocked integer; v_free integer;
begin
  select * into d from public.bus_departures where id = p_departure;
  if d.id is null then
    return jsonb_build_object('available', false, 'reason', 'Ce départ n''existe plus.');
  end if;

  select l.published into v_published from public.listings l where l.id = d.listing_id;
  if not coalesce(v_published, false) then
    return jsonb_build_object('available', false, 'reason', 'Ce trajet n''est pas publié.');
  end if;

  select count(*) filter (where booking_item_id is not null),
         count(*) filter (where booking_item_id is null and held_until > now()),
         count(*) filter (where blocked),
         count(*) filter (where booking_item_id is null and not blocked
                            and (held_until is null or held_until < now()))
    into v_sold, v_held, v_blocked, v_free
    from public.bus_departure_seats where departure_id = p_departure;

  return jsonb_build_object(
    'available',   d.status not in ('cancelled', 'departed', 'arrived', 'completed')
                   and d.departs_on >= public.haiti_today()
                   and v_free > 0,
    'reason', case
      when d.status = 'cancelled' then 'Ce départ a été annulé.'
      when d.status in ('departed', 'arrived', 'completed') then 'Ce départ est déjà parti.'
      when d.departs_on < public.haiti_today() then 'Ce départ est passé.'
      when v_free = 0 then 'Complet.'
      else null end,
    'status',      d.status,
    'departs_on',  d.departs_on,
    'departs_at',  d.departs_at,
    'seats_total', d.seats_total,
    'sold',        v_sold,
    'held',        v_held,
    'blocked',     v_blocked,
    'left',        v_free);
end;
$$;

grant execute on function public.bus_availability(uuid) to anon, authenticated;

/**
 * The seat map, as states.
 *
 * A seat is `sold`, `blocked`, `held` or `available`, and that is everything
 * this returns. No booking id, no name: the next buyer learns which seats are
 * free and nothing about who is in the others.
 */
create or replace function public.bus_seat_map(p_departure uuid)
returns table (seat_no smallint, code text, class text, state text)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.seat_no, s.code, s.class,
         case
           when s.booking_item_id is not null then 'sold'
           when s.blocked then 'blocked'
           when s.held_until > now() then 'held'
           else 'available'
         end as state
    from public.bus_departure_seats s
    join public.bus_departures d on d.id = s.departure_id
    join public.listings l on l.id = d.listing_id
   where s.departure_id = p_departure
     and l.published
   order by s.seat_no;
$$;

grant execute on function public.bus_seat_map(uuid) to anon, authenticated;

/**
 * Hold seats for ten minutes while someone pays.
 *
 * Signed-in callers only, and deliberately so. A hold is the power to make a
 * seat unsellable without paying for it; handed to `anon` it is the power to
 * freeze a whole coach from a loop, which is the same shape of hole AGENTS.md
 * records for create_booking being granted to anon. Requiring an account bounds
 * it to something with a verified mailbox behind it.
 *
 * Guest checkout therefore gets no hold — it claims its seats atomically at
 * payment instead, and is told plainly if one has gone. That is a worse moment
 * to find out, and still better than a vertical whose inventory any passer-by
 * can empty.
 *
 * One departure per person at a time: a new hold releases the previous one, so
 * browsing three departures does not quietly reserve twelve seats.
 */
create or replace function public.bus_hold_seats(
  p_departure uuid,
  p_qty       integer default 1,
  p_seats     smallint[] default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key   text;
  v_want  integer := greatest(coalesce(p_qty, 1), 1);
  v_taken smallint[];
  d       public.bus_departures;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour réserver une place le temps du paiement.'
      using errcode = '42501';
  end if;
  -- The key is the caller's own identity, never a value they send: a hold
  -- nobody else can claim, and nobody can impersonate.
  v_key := 'u:' || auth.uid()::text;

  if v_want > 6 then
    raise exception 'Vous ne pouvez retenir que 6 places à la fois.';
  end if;

  select * into d from public.bus_departures where id = p_departure;
  if d.id is null then
    raise exception 'Ce départ n''existe plus.' using errcode = 'P0002';
  end if;

  -- Release whatever this person was holding, here or elsewhere.
  update public.bus_departure_seats
     set held_by = null, held_until = null
   where held_by = v_key and booking_item_id is null;

  with picked as (
    select s.seat_no
      from public.bus_departure_seats s
     where s.departure_id = p_departure
       and s.booking_item_id is null
       and not s.blocked
       and (s.held_until is null or s.held_until < now())
       and (p_seats is null or s.seat_no = any (p_seats))
     order by s.seat_no
     limit v_want
     for update skip locked
  ), held as (
    update public.bus_departure_seats t
       set held_by = v_key, held_until = now() + interval '10 minutes'
     where t.departure_id = p_departure
       and t.seat_no in (select seat_no from picked)
    returning t.seat_no
  )
  select array_agg(seat_no order by seat_no) into v_taken from held;

  return jsonb_build_object(
    'seats',      coalesce(v_taken, '{}'::smallint[]),
    'held_until', now() + interval '10 minutes',
    'short',      coalesce(array_length(v_taken, 1), 0) < v_want);
end;
$$;

revoke all on function public.bus_hold_seats(uuid, integer, smallint[]) from public, anon;
grant execute on function public.bus_hold_seats(uuid, integer, smallint[]) to authenticated;

/** Give the seats back when someone abandons the checkout. */
create or replace function public.bus_release_seats()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if auth.uid() is null then
    return 0;
  end if;
  update public.bus_departure_seats
     set held_by = null, held_until = null
   where held_by = 'u:' || auth.uid()::text and booking_item_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.bus_release_seats() from public, anon;
grant execute on function public.bus_release_seats() to authenticated;

/**
 * stay_availability learns to refuse a bus.
 *
 * A transport annonce reaching this function fell through to "a vehicle is its
 * own annonce", reporting a capacity of one and counting booking_items rows —
 * so a 52-seat coach with one seat sold read as full. Nothing calls it with a
 * bus today; the arm is here so nothing can start to.
 */
create or replace function public.stay_availability(
  p_listing uuid, p_from date, p_to date, p_unit uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_kind      public.listing_kind;
  v_published boolean;
  v_nights    integer;
  v_capacity  integer;
  v_cap_day   integer;
  v_taken     integer;
  v_blocked   record;
  v_min_stay  smallint;
begin
  select l.kind, l.published into v_kind, v_published
    from public.listings l where l.id = p_listing;

  if v_kind is null then
    return jsonb_build_object('available', false, 'reason', 'Cette annonce n''existe plus.');
  end if;
  if not v_published then
    return jsonb_build_object('available', false, 'reason', 'Cette annonce n''est pas publiée.');
  end if;
  if v_kind = 'restaurant' then
    return jsonb_build_object('available', false,
      'reason', 'Une table se vérifie avec restaurant_availability.');
  end if;
  if v_kind = 'bus' then
    return jsonb_build_object('available', false,
      'reason', 'Une place de bus se vérifie avec bus_availability.');
  end if;

  p_to := coalesce(p_to, p_from + 1);
  v_nights := p_to - p_from;
  if v_nights < 1 then
    return jsonb_build_object('available', false, 'reason', 'Le départ doit suivre l''arrivée.');
  end if;

  -- A day the partner closed, whatever reason they gave it.
  select a.day, a.status into v_blocked
    from public.listing_availability a
   where a.listing_id = p_listing
     and a.day >= p_from and a.day < p_to
     and a.status <> 'available'
   order by a.day
   limit 1;

  if found then
    return jsonb_build_object(
      'available', false,
      'reason', case v_blocked.status
        when 'blocked'     then 'Ces dates ne sont pas ouvertes à la réservation.'
        when 'booked'      then 'Ces dates sont déjà prises.'
        when 'maintenance' then 'L''établissement est fermé pour entretien à ces dates.'
        else 'L''établissement est fermé à ces dates.' end,
      'first_blocked', v_blocked.day);
  end if;

  select max(a.min_stay) into v_min_stay
    from public.listing_availability a
   where a.listing_id = p_listing and a.day >= p_from and a.day < p_to;

  if v_min_stay is not null and v_nights < v_min_stay then
    return jsonb_build_object('available', false,
      'reason', format('Le séjour minimum est de %s nuits à ces dates.', v_min_stay),
      'min_stay', v_min_stay);
  end if;

  -- How many of this thing exist.
  if p_unit is not null then
    select greatest(coalesce(u.units, 1), 1) into v_capacity
      from public.listing_units u
     where u.id = p_unit and u.listing_id = p_listing and u.available;
    if v_capacity is null then
      return jsonb_build_object('available', false,
        'reason', 'Ce type de chambre n''est plus proposé.');
    end if;
  else
    -- A vehicle is its own annonce; a stay with no room type is counted against
    -- the annonce as a whole.
    v_capacity := 1;
  end if;

  -- A day may cap the whole annonce below what the units would allow.
  select min(a.quantity) into v_cap_day
    from public.listing_availability a
   where a.listing_id = p_listing and a.day >= p_from and a.day < p_to
     and a.quantity is not null;
  if v_cap_day is not null then
    v_capacity := least(v_capacity, v_cap_day);
  end if;

  select count(*) into v_taken
    from public.booking_items bi
   where bi.kind = v_kind
     and bi.status <> 'cancelled'
     and bi.starts_on is not null
     and coalesce(bi.ends_on, bi.starts_on + 1) > p_from
     and bi.starts_on < p_to
     and (
       (p_unit is not null and bi.unit_id = p_unit)
       or (p_unit is null and bi.listing_id = p_listing and bi.unit_id is null)
     );

  return jsonb_build_object(
    'available', v_taken < v_capacity,
    'reason', case when v_taken < v_capacity then null
              else 'Ces dates viennent d''être prises.' end,
    'nights', v_nights,
    'capacity', v_capacity,
    'taken', v_taken,
    'left', greatest(v_capacity - v_taken, 0));
end;
$$;;
