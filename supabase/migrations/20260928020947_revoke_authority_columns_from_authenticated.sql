-- Three tables let the row's own owner rewrite the platform's verdict on them.
--
-- RLS said the right thing in each case — you may update your own row — and
-- the grant said every column of it. So the columns PAPOT writes *about* a
-- user, a business or an annonce were writable by that user, that business and
-- that annonce, from the browser, with the publishable key:
--
--   update profiles set status = 'active', risk_flags = '{}'   -- undo a suspension
--   update profiles set email = 'someone.else@…'               -- spoof the console
--   update partners set status = 'active', verification = 'verified'
--   update partners set commission_override = 0                -- rewrite the deal
--   update listings set rating = 5, reviews = 900, badge = '…' -- invent a reputation
--   update listings set published = true                       -- re-show a rejected annonce
--
-- The last one deserves the detail: `listings_public_read` gates on
-- `published`, not on `status`, and the `listings_sync_published` trigger only
-- fires on an update that names `status`. An update naming `published` alone
-- therefore went straight past the lifecycle.
--
-- The fix is column-level, not policy-level, because the policies are correct:
-- a partner *should* be able to edit their annonce, a customer *should* be able
-- to edit their profile. What neither should be able to edit is the platform's
-- own columns. Everything PAPOT writes there goes through a SECURITY DEFINER
-- function owned by postgres — admin_set_customer_status,
-- admin_set_partner_status, admin_set_partner_commission,
-- admin_set_listing_status, sync_profile_email, claim_partner_invitations —
-- so none of them is affected by a grant on `authenticated`.
--
-- `sync_listing_published` is a plain BEFORE trigger and is also unaffected:
-- PostgreSQL checks column privileges against the columns the *statement*
-- names, not the ones a trigger assigns to NEW.
--
-- INSERT is left alone throughout: a row is created by code that legitimately
-- supplies these columns (the listings duplicate, for one), and creation is
-- already gated by the policies' WITH CHECK.

revoke update (
  id, email, status, risk_flags, suspended_at, suspended_reason,
  created_at, updated_at, last_seen_at
) on public.profiles from authenticated;

revoke update (
  id, application_id, owner_id, type, status, verification,
  commission_override, rating, suspended_reason, joined_at, created_at
) on public.partners from authenticated;

revoke update (
  published, rating, reviews, badge, position,
  reviewed_at, reviewed_by, review_note, partner_id, created_at
) on public.listings from authenticated;

-- What is deliberately still writable, and why:
--   profiles : full_name, phone, country, currency, locale — the customer's own
--              details, which is the whole point of a profile screen.
--   partners : business_name, legal_name, owner_name, email, phone, city,
--              department, country — exactly the eight fields
--              /partenaire/entreprise saves.
--   listings : everything the partner's own editor writes, including `status`,
--              because a partner publishing and pausing their own annonce is
--              the intended lifecycle; `published` follows it through the
--              trigger rather than by hand.
;
