/**
 * What an annonce sells is decided when it is created, not edited afterwards.
 *
 * 20260928021119:26 kept `kind` among the twenty columns an owner may update,
 * grouped with `type` and `vendor` as though it were descriptive. It is not:
 * `kind` chooses which branch of `quote_booking_item` prices the sale, which
 * lock `create_booking` takes, and which rows `stay_availability` counts.
 *
 * So a partner who set `kind = 'restaurant'` on their hebergement made
 * `quote_booking_item` return 0 for it -- every booking on that annonce free,
 * a `payments` row of 0, and a 0 commission for PAPOT. One dropdown, and the
 * platform's cut is gone while the guest still arrives and still pays, off
 * platform. `stay -> car` is quieter and as bad: capacity moves from
 * `listing_units.units` to one, and the rows already sold stop being counted,
 * so the partner's own calendar reopens under them.
 *
 * 20261004145615 made `create_booking` read `kind` from `listings` instead of
 * from the cart, which closed the case of a *buyer* forging it. This closes the
 * case of the *owner* changing it. The two are the same column read by the same
 * pricing function, approached from the two sides that can reach it.
 *
 * Changing a business's metier is an admin act -- the dossier decided it and
 * `build_partner_listings` wrote it -- and `admin_set_listing_status` and
 * `admin_create_listing` are SECURITY DEFINER, so they are unaffected by this
 * grant.
 *
 * Like the migration before it, this waited for the front end:
 * `ListingForm.save()` sent `kind` in the patch on *every* edit, stripping only
 * `partner_id`, so applying this first would have answered `42501` on a form
 * that worked yesterday -- and that one surfaces its error, so every partner
 * editing any annonce would have seen it. The deployed bundle now strips `kind`
 * and disables the Service select after creation, with a line saying who to ask.
 *
 * Deliberately left alone. **`kind` stays in the INSERT grant**
 * (20261006150112): the partner's own editor chooses it for a new annonce, and
 * `listings_partner_insert` already pins the row to their business. **No
 * trigger freezes the column**, because a grant is the mechanism this project
 * already uses for "you may not write this" on `listings` -- see `rating` and
 * `published` -- and a second mechanism saying the same thing in a different
 * error message is a worse explanation, not a better lock.
 */

revoke update on public.listings from authenticated;

grant update (
  name, location, city, country, type, stars, price, original_price, img,
  amenities, free_cancellation, breakfast, currency, vendor,
  rating_scale, attrs, status, submitted_at, updated_at
) on public.listings to authenticated;
;
