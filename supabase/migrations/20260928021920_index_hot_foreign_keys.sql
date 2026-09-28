-- Eighty-five foreign keys have no index on the referencing side. At today's
-- volumes — four bookings, twenty-seven annonces — that costs nothing, and
-- eighty-five indexes would cost something on every write, so this adds three
-- and leaves the rest.
--
-- These three because they carry the queries that run most, and that grow
-- fastest:
--
--   bookings.user_id      — "mes réservations", on every visit to the account.
--   payments.booking_id   — the receipt, and every reconciliation join.
--   booking_items.unit_id — `stay_availability` and `assign_stay_inventory`,
--                           which run on every fiche and inside the lock that
--                           prevents a room being sold twice. That one is on
--                           the path where slow becomes contended.
--
-- The remaining eighty-two are listed in the audit rather than created: an
-- index that no query uses is a write tax, and most of those tables are
-- admin-side and small.

create index if not exists bookings_user_idx       on public.bookings (user_id);
create index if not exists payments_booking_idx    on public.payments (booking_id);
create index if not exists booking_items_unit_idx  on public.booking_items (unit_id);
;
