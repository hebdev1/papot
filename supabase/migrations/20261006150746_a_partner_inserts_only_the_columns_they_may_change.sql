/**
 * A partner creating an annonce writes exactly the columns they are allowed to
 * change afterwards, plus the one that says whose it is.
 *
 * 20260928021119 took the table-wide UPDATE off `listings` and granted back
 * twenty named columns. The INSERT next to it was never touched:
 * 20260913151307:100 says `grant insert, update, delete on listings to
 * authenticated`, and live `relacl` reads `authenticated=ardm/postgres` -- the
 * `a` is table-level INSERT, so `has_column_privilege` answers true for all
 * 31 columns. Everything the UPDATE grant denies could be set at birth instead.
 *
 * Concretely: an annonce could be created with `rating = 5.0`,
 * `reviews = 412` and `badge = 'Coup de coeur'` -- invented social proof, on a
 * card a traveller reads as fact, in the three columns PAPOT reserves for
 * measurement. With `reviewed_at`, `reviewed_by` and `review_note` filled in,
 * so the admin review workspace shows a dossier someone already approved. With
 * `position` set, to sit above everyone on the home page. With a chosen `id`
 * and a backdated `created_at`. `published` is the exception and worth naming:
 * `listings_sync_published` is a BEFORE INSERT trigger that overwrites it from
 * `status`, so that one column was surface rather than a hole -- but it was
 * surface only because a trigger happened to be there.
 *
 * The treatment is the one from 20260928021119, for the reason stated there:
 * PostgreSQL will not subtract a column from a table-wide grant, so the table
 * grant goes first and the columns come back by name. The list is that
 * migration's UPDATE list plus `partner_id` -- a partner may insert what they
 * may edit, and `partner_id` because `listings_partner_insert`'s
 * `with check (partner_can(partner_id, 'manage_listings'))` has to read it and
 * the editor has to set it. Ten columns are denied: `id`, `rating`, `reviews`,
 * `badge`, `published`, `position`, `created_at`, `reviewed_at`, `reviewed_by`,
 * `review_note`. Each has a default or is written only by a SECURITY DEFINER
 * path, which does not consult these grants.
 *
 * This waited for the front end, and the wait was the point. `duplicate()` in
 * the partner console used to `select("*")` and re-insert the lot, which is how
 * a well-reviewed fiche cloned itself into a brand-new one carrying the same
 * reputation -- a menu item, no forged request. Applied before that shipped,
 * this migration would have turned that bug into a `42501` on a button partners
 * use. The deployed bundle was checked for the fix before this ran.
 *
 * Deliberately left alone. **DELETE stays table-wide**, because a privilege
 * over rows is not a privilege over columns and `listings_partner_delete`
 * already scopes it. **`status` stays insertable**, because `ListingForm.save()`
 * is what decides `draft` versus `pending_review` and the review machine in
 * 20260913005349 is what refuses `published`. **The admin paths are
 * untouched**: `admin_create_listing` and `build_partner_listings` are SECURITY
 * DEFINER owned by postgres and insert as the owner, so none of them loses a
 * column.
 */

revoke insert on public.listings from authenticated;

grant insert (
  name, location, city, country, type, stars, price, original_price, img,
  amenities, free_cancellation, breakfast, currency, kind, vendor,
  rating_scale, attrs, status, submitted_at, updated_at, partner_id
) on public.listings to authenticated;
;
