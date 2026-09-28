-- The previous migration reported success and changed nothing.
--
-- PostgreSQL will not subtract a column from a table-wide grant: `revoke
-- update (col) on t from r` only removes a privilege that was granted per
-- column, and here `authenticated` holds plain table-level UPDATE
-- (relacl shows `authenticated=rwm/postgres`). The revoke was a no-op and the
-- columns stayed writable. Same family as the `anon` / `public` trap: a
-- revoke must name the grant that actually exists.
--
-- So: drop the table-wide UPDATE, then grant back exactly the columns the row's
-- own owner is entitled to change. The reasoning for each set, and the proof
-- that no SECURITY DEFINER path depends on the table grant, is in the previous
-- migration.

revoke update on public.profiles from authenticated;
grant update (full_name, phone, country, currency, locale)
  on public.profiles to authenticated;

revoke update on public.partners from authenticated;
grant update (business_name, legal_name, owner_name, email, phone, city, department, country)
  on public.partners to authenticated;

revoke update on public.listings from authenticated;
grant update (
  name, location, city, country, type, stars, price, original_price, img,
  amenities, free_cancellation, breakfast, currency, kind, vendor,
  rating_scale, attrs, status, submitted_at, updated_at
) on public.listings to authenticated;
;
