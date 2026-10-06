/**
 * A review outlives the annonce it describes.
 *
 * `reviews_listing_id_fkey` is `ON DELETE CASCADE`, alone among the five
 * foreign keys on the table -- `booking_id`, `customer_id`, `partner_id` and
 * `moderated_by` are all `ON DELETE SET NULL` (confirmed: `confdeltype` reads
 * `c` for `listing_id` and `n` for the other four). So a partner deleting their
 * own annonce deletes the reviews of it, and that delete is a thing they are
 * entitled to do: `listings` grants DELETE to `authenticated` and
 * `listings_partner_delete` admits them on `manage_listings`.
 *
 * The rows that disappear are the platform's moderation record, and
 * `authenticated` cannot write them by any other route -- `reviews` grants it
 * `rm`, select and maintain, no insert and no update -- so a partner's reply
 * goes through the SECURITY DEFINER `partner_reply_review`. A one-star review a
 * partner cannot edit, cannot reply its way out of and cannot have unflagged
 * becomes a review they can delete, by deleting the listing and creating it
 * again. There are two capabilities named for watching exactly that --
 * `view_reviews` and `moderate_reviews` -- and the evidence they watch was
 * removable by its subject. A cascade runs as the constraint owner and consults
 * no policy, so every control on the table was bypassed by deleting a row in a
 * different one.
 *
 * `SET NULL` rather than `RESTRICT` or a soft delete, because attribution
 * survives without the annonce: `reviews` carries `partner_id` and
 * `booking_id`, so an orphaned row still says which business it is about and
 * which stay produced it. `reviews_partner_read` keys on `partner_id` and
 * `reviews_staff_read` on `admin_can('view_reviews')`, so neither loses sight of
 * the row; only the public read stops matching, because the fiche it belonged to
 * is gone. `RESTRICT` was the other defensible answer and is the wrong one here:
 * it makes a legitimate deletion fail with a foreign-key message about a table
 * the partner has never heard of.
 *
 * Checked live rather than assumed: `reviews` holds zero rows, `listing_id` is
 * nullable, and it is indexed, so the swap is instant and the SET NULL scan is
 * cheap. Had the column been NOT NULL this migration would have had to drop
 * that first, and would have said so.
 *
 * Deliberately left alone. **`listings.rating` and `listings.reviews` are not
 * recomputed**: no trigger on `reviews` maintains them, both columns are already
 * outside `authenticated`'s UPDATE grant, and inventing a recomputation path
 * inside a foreign-key migration would be a feature wearing a fix's clothes.
 * **The other four foreign keys are untouched** -- they are already SET NULL.
 * **`booking_items_listing_id_fkey` keeps its own SET NULL**, which is correct
 * for the same reason and is why the kind trigger added two migrations ago lets
 * a line with no annonce pass.
 */

alter table public.reviews
  drop constraint reviews_listing_id_fkey,
  add  constraint reviews_listing_id_fkey
       foreign key (listing_id) references public.listings(id) on delete set null;
;
