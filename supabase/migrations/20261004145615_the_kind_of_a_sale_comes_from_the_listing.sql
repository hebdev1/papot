/**
 * The kind of a sale comes from the annonce, never from the cart.
 *
 * The package branch of `create_booking` has always read it correctly --
 * `select l.kind into v_kind from public.listings l where l.id = v_listing;` --
 * and the branch next to it did `v_kind := (v_item->>'kind')::public.listing_kind;`,
 * one line of attacker-supplied JSON. `v_kind` then decides three things: which
 * tariff `quote_booking_item` builds, which inventory lock `create_booking`
 * takes, and which rows `stay_availability` counts.
 *
 * So a suite sold as `kind='car'` is priced by the `car` branch --
 * `v_listing.price * v_units`, the annonce's base rate instead of the chosen
 * `listing_units.price`, with `cleaning_fee` and `service_fee` dropped
 * entirely. Measured on the live catalogue: Villa Kajou over three nights is
 * 470.25 as a `stay` and 407.25 as a `car`. And the hold goes wrong in the same
 * move -- the `booking_items` row is written `kind='car'`, while
 * `stay_availability` derives its own `v_kind` from `listings` and counts
 * `where bi.kind = v_kind`, so it counts `stay` rows and never sees this one.
 * The room is then sellable without limit, by the same loop over dates that
 * 20260926013208 was written to stop. A missing `kind` is a third variant: null
 * falls through `quote_booking_item`'s `else` to `price * units`, takes no lock
 * at all, and then dies on `booking_items.kind`'s NOT NULL -- a rollback, but
 * for the wrong reason.
 *
 * The fix is the one the package branch already uses, moved up two lines, plus
 * the same correction inside `quote_booking_item`: it selects the whole
 * `listings` row before it branches, so `p_kind` was never information it
 * lacked -- only an opportunity for a caller to disagree with the catalogue.
 * `p_kind` is now ignored and kept only so the six-argument signature, granted
 * to anon and authenticated and typed in `src/types/database.ts`, does not
 * move. Both halves matter: the first stops the attack through checkout, the
 * second stops it through any future caller, because a function handed a fact
 * it can derive will eventually be handed a wrong one.
 *
 * There is nothing left to raise on for a missing `kind`: the payload's field
 * is now read by nothing. What is raised on instead is an annonce that does not
 * exist, in French, before a price is computed.
 *
 * Deliberately left alone. **`kind` stays in `listings`' UPDATE grant here**
 * (20260928021119:26), so a partner can still change their own annonce's kind
 * -- which is a real hole of its own, since `kind='restaurant'` makes
 * `quote_booking_item` return 0 and every booking on that annonce free. It is a
 * different actor with a different fix, it needs the front end to stop sending
 * `kind` on update first, and it is the next migration. This one closes the
 * cross-tenant case completely on its own: RLS has never let anyone change
 * `listings.kind` on a business that is not theirs. **`stay_availability` keeps
 * counting by `bi.kind`**; once the kind of a line cannot contradict its
 * annonce the predicate is redundant rather than wrong, and rewriting the one
 * function that serialises every checkout is not a thing to do in the same
 * change as the fix it is standing in for.
 */

do $do$
declare
  src    text := pg_get_functiondef('public.create_booking(jsonb)'::regprocedure);
  before text;
begin
  before := src;
  src := replace(src,
$old$    if v_pkg_id is null then
      v_kind   := (v_item->>'kind')::public.listing_kind;
      v_title  := v_item->>'title';$old$,
$new$    if v_pkg_id is null then
      -- The kind of a sale is a fact about the annonce. The package branch
      -- below has always read it from `listings`; this one trusted the cart,
      -- and through it the cart chose the tariff and the inventory lock.
      select l.kind into v_kind from public.listings l where l.id = v_listing;
      if v_kind is null then
        raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
      end if;
      v_title  := v_item->>'title';$new$);
  if src = before then raise exception 'create_booking kind derivation hunk did not apply'; end if;

  execute src;
end
$do$;

comment on function public.create_booking(jsonb) is
  'Writes a booking. The payload sets neither the price nor the kind of a line: both are read from the catalogue. Internal to checkout -- reachable only through a payment gateway function, never granted to the public.';

do $do$
declare
  src    text := pg_get_functiondef('public.quote_booking_item(listing_kind,uuid,uuid,date,date,jsonb)'::regprocedure);
  before text;
begin
  -- Hunk 1 of 3: the restaurant short-circuit, and the note on p_kind.
  before := src;
  src := replace(src,
$old$  if p_kind = 'restaurant' then
    return 0;
  end if;$old$,
$new$  -- `p_kind` is ignored. The row it describes was just read into
  -- `v_listing`, so the argument was never information this function lacked --
  -- only an opportunity for a caller to disagree with the catalogue. It stays
  -- in the signature because that signature is granted to anon and
  -- authenticated and is typed in the generated client.
  if v_listing.kind = 'restaurant' then
    return 0;
  end if;$new$);
  if src = before then raise exception 'quote_booking_item restaurant hunk did not apply'; end if;

  -- Hunk 2 of 3.
  before := src;
  src := replace(src, $old$  if p_kind = 'stay' then$old$, $new$  if v_listing.kind = 'stay' then$new$);
  if src = before then raise exception 'quote_booking_item stay hunk did not apply'; end if;

  -- Hunk 3 of 3.
  before := src;
  src := replace(src, $old$  elsif p_kind = 'car' then$old$, $new$  elsif v_listing.kind = 'car' then$new$);
  if src = before then raise exception 'quote_booking_item car hunk did not apply'; end if;

  execute src;
end
$do$;

comment on function public.quote_booking_item(public.listing_kind, uuid, uuid, date, date, jsonb) is
  'The authoritative price of one booking line, rebuilt from the catalogue. The payload sets neither the price nor the kind: p_kind is accepted for signature stability and ignored.';
;
