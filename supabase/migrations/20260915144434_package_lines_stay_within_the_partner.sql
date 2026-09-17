-- A package bundles what one business sells. Nothing in the schema said so:
-- unit_id, listing_id and menu_item_id each referenced their table without
-- asking whose it was, so a partner could have bundled a competitor's vehicle
-- and, at checkout, written a booking against a stranger's calendar.
--
-- The invariant spans three tables, which is what a trigger is for; the
-- package-to-annonce pairing next door stays declarative because both columns
-- sit on the same row.
create or replace function public.package_line_same_partner()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_owner  uuid;
  v_target uuid;
begin
  select p.partner_id into v_owner
    from public.partner_packages p where p.id = new.package_id;

  if new.unit_id is not null then
    select l.partner_id into v_target
      from public.listing_units u join public.listings l on l.id = u.listing_id
     where u.id = new.unit_id;
  elsif new.listing_id is not null then
    select l.partner_id into v_target from public.listings l where l.id = new.listing_id;
  elsif new.menu_item_id is not null then
    select l.partner_id into v_target
      from public.menu_items m join public.listings l on l.id = m.listing_id
     where m.id = new.menu_item_id;
  else
    -- A described line points at nothing and belongs to no one.
    return new;
  end if;

  if v_target is distinct from v_owner then
    raise exception 'Une ligne de paquet ne peut désigner que ce que la même entreprise vend.';
  end if;

  return new;
end;
$fn$;

create trigger package_lines_same_partner
before insert or update on public.package_lines
for each row execute function public.package_line_same_partner();;
