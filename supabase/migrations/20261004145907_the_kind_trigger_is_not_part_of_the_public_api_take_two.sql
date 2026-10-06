-- The migration before this one described a revoke it did not perform.
--
-- Its header says "The grant is revoked explicitly rather than left to the
-- schema default", and then no `revoke` statement follows. A comment claiming a
-- control that is not there is worse than the missing control: the next reader
-- believes the door is shut. So this is the statement, and the reason it is a
-- separate file is that the first one is already recorded.
--
-- What the omission exposed is worth writing down, because it contradicts what
-- this repository believes about itself. `pg_default_acl` for schema `public`
-- carries no PUBLIC entry for functions -- 20260913020316 took that away and
-- the row proves it -- and yet the function created one statement ago came out
-- as:
--
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,
--    authenticated=X/postgres,service_role=X/postgres}
--
-- The leading `=X` is PUBLIC. So the default-privileges revoke is recorded and
-- is not in effect for the role that actually creates these functions, and on
-- top of that the platform's own default grants `anon` and `authenticated`
-- EXECUTE outright. **A new SECURITY DEFINER function in `public` is born
-- callable by PUBLIC, by anon and by authenticated.**
--
-- AGENTS.md states the house rule as "a new SECURITY DEFINER function needs
-- both: its own admin_can() / partner_can() check, and no grant to anon". That
-- rule is not a belt-and-braces precaution, as the wording suggests -- it is
-- load-bearing, and the second half of it is not the default. Every function
-- added from here needs this revoke written out, in the same migration, or it
-- ships world-callable.
--
-- Deliberately left alone: the schema-wide default itself. Making new functions
-- private by default is the right fix and it is one `alter default privileges`
-- away, but it changes the starting posture of every future object in the
-- schema, including ones the catalogue genuinely needs anon to reach, and that
-- is a decision to take deliberately rather than as a footnote to a trigger.

revoke execute on function public.booking_item_kind_matches_listing()
  from public, anon, authenticated;
;
