/**
 * A booking line cannot claim a service its annonce does not sell.
 *
 * The migration before this one made `create_booking` derive the kind from
 * `listings` instead of from the cart. This says the same thing where it cannot
 * be forgotten: at the table. `kind` is what `stay_availability` filters on, so
 * a row whose `kind` disagrees with its annonce is a room that is sold and not
 * counted -- and the only reason there is none today is that the one writer was
 * fixed a minute ago.
 *
 * It is a trigger and not a CHECK because a CHECK cannot hold a subquery. The
 * declarative alternative -- `unique (id, kind)` on `listings` plus a composite
 * foreign key `booking_items(listing_id, kind)` -- is better in every way
 * except that it does not work here, and only a live check catches why:
 * `booking_items_listing_id_fkey` is `ON DELETE SET NULL` (confirmed:
 * `confdeltype = 'n'`), so a composite key would try to null `kind` as well,
 * and `booking_items.kind` is NOT NULL. Every listing deletion would fail.
 *
 * Existing rows were checked, not assumed: zero of the four `booking_items`
 * rows disagree with their annonce.
 *
 * Deliberately left alone. A line with no `listing_id` passes: the foreign key
 * nulls it when an annonce is deleted, and a line that no longer points
 * anywhere has no annonce to contradict. `listings.kind` itself is not frozen
 * here -- a partner changing it is a different act with a different fix, and
 * refusing that change from this trigger would explain it with a message about
 * a booking.
 *
 * The grant is revoked explicitly rather than left to the schema default. The
 * default privileges for functions in `public` read
 * `{postgres=X,anon=X,authenticated=X,service_role=X}` -- no PUBLIC, because
 * 20260913020316 took that away, but `anon` and `authenticated` are granted
 * outright by the platform. A trigger function fires with the table's rights
 * and never consults a grant, so there is nothing for those two roles to do
 * with it but call it directly.
 */

create or replace function public.booking_item_kind_matches_listing()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_kind public.listing_kind;
begin
  if new.listing_id is null then
    return new;
  end if;

  select l.kind into v_kind from public.listings l where l.id = new.listing_id;
  if v_kind is null then
    raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
  end if;

  if new.kind is distinct from v_kind then
    raise exception 'Cette ligne annonce un service (%) que l''annonce ne vend pas (%).',
      new.kind, v_kind using errcode = '23514';
  end if;

  return new;
end;
$fn$;

comment on function public.booking_item_kind_matches_listing() is
  'Trigger. A booking line''s kind is the kind of the annonce it points at. A line with no annonce passes.';

create trigger booking_items_kind_matches_listing
  before insert or update of listing_id, kind on public.booking_items
  for each row execute function public.booking_item_kind_matches_listing();
;
