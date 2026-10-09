-- A bus company is a fifth partner_type, and a route is a fourth listing_kind.
--
-- These two statements are alone in this migration on purpose. `add value` and
-- the first use of the value cannot share a transaction, and every migration
-- applied through the MCP server is one transaction — so a table, function or
-- seed that mentions 'bus' goes in the next file, never this one.
-- Precedent: 20260912015324_papot_partner_type_hotel.sql, a one-line file for
-- exactly this reason.
alter type public.listing_kind add value if not exists 'bus';
alter type public.partner_type add value if not exists 'bus';;
