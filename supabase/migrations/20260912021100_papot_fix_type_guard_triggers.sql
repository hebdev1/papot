-- One shared function referencing NEW.amenity_code broke inserts on the rooms
-- and vehicles tables: PL/pgSQL hands the whole boolean to the SQL executor,
-- so a field from another table is resolved even when the guard is false.
-- Separate functions keep each branch to its own columns.
drop trigger if exists rooms_type_guard     on public.partner_application_rooms;
drop trigger if exists vehicles_type_guard  on public.partner_application_vehicles;
drop trigger if exists amenities_type_guard on public.partner_application_amenities;
drop function if exists public.assert_application_type();

create or replace function public.assert_lodging_application()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type public.partner_type;
begin
  select type into v_type from public.partner_applications where id = new.application_id;
  if v_type not in ('hotel', 'guesthouse') then
    raise exception 'Les chambres ne s''appliquent qu''aux hôtels et maisons d''hôtes (type: %).', v_type;
  end if;
  return new;
end;
$$;

create or replace function public.assert_car_application()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type public.partner_type;
begin
  select type into v_type from public.partner_applications where id = new.application_id;
  if v_type <> 'car' then
    raise exception 'Les véhicules ne s''appliquent qu''à la location de voiture (type: %).', v_type;
  end if;
  return new;
end;
$$;

create or replace function public.assert_amenity_applies()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type public.partner_type;
begin
  select type into v_type from public.partner_applications where id = new.application_id;
  if not exists (
    select 1 from public.partner_amenities a
     where a.code = new.amenity_code and v_type = any(a.applies_to)
  ) then
    raise exception 'Équipement "%" invalide pour le type %.', new.amenity_code, v_type;
  end if;
  return new;
end;
$$;

create trigger rooms_type_guard before insert or update on public.partner_application_rooms
  for each row execute function public.assert_lodging_application();
create trigger vehicles_type_guard before insert or update on public.partner_application_vehicles
  for each row execute function public.assert_car_application();
create trigger amenities_type_guard before insert or update on public.partner_application_amenities
  for each row execute function public.assert_amenity_applies();;
