-- The capacity guard added in the previous migration broke schedule inserts.
--
-- bus_departure_is_self_consistent() is the trigger for BOTH bus_departures and
-- bus_schedules, and only the first has seats_total. Guarding the reference with
-- `to_jsonb(new) ? 'seats_total'` does not help: PL/pgSQL resolves
-- `new.seats_total` when it plans the expression, so the whole statement raises
-- `record "new" has no field "seats_total"` for a schedule regardless of the
-- condition in front of it. `and` does not protect a field that cannot be
-- compiled.
--
-- So the optional field is read through jsonb and never named directly. A
-- schedule yields null and skips the check; a departure yields its number. The
-- rule itself is unchanged: fewer seats on sale than the coach holds is
-- legitimate — a company keeps a row back for passengers paying at the gare —
-- and more is a typo that sells a seat which does not exist.
create or replace function public.bus_departure_is_self_consistent()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing_partner uuid;
  v_coach_partner   uuid;
  v_capacity        smallint;
  v_seats           smallint;
  v_kind public.listing_kind;
begin
  select l.partner_id, l.kind into v_listing_partner, v_kind
    from public.listings l where l.id = new.listing_id;

  if v_kind is distinct from 'bus' then
    raise exception 'Seule une annonce de transport peut avoir des départs.'
      using errcode = '23514';
  end if;

  select c.partner_id, c.seat_capacity into v_coach_partner, v_capacity
    from public.bus_coaches c where c.id = new.coach_id;

  if v_listing_partner is distinct from v_coach_partner then
    raise exception 'Ce véhicule appartient à une autre entreprise.'
      using errcode = '23514';
  end if;

  v_seats := (to_jsonb(new) ->> 'seats_total')::smallint;
  if v_seats is not null and v_seats > v_capacity then
    raise exception 'Ce véhicule n''a que % places.', v_capacity
      using errcode = '23514';
  end if;

  return new;
end;
$$;;
