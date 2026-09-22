/**
 * The last functions that were reachable without being meant to be.
 *
 * `apply_maintenance_block`, `log_partner_change` and `package_line_same_partner`
 * are trigger functions. A trigger fires on its own, with the table's rights,
 * and never consults a grant — so EXECUTE on them buys the caller nothing and
 * exists only as surface.
 *
 * `assign_stay_inventory` is different and worth naming. It is the lock half of
 * the double-sale fix: it takes `for update` on the row carrying a room type's
 * capacity, and it is meant to be called by `create_booking`, inside that
 * transaction. Exposed on its own it let anyone take and hold those locks —
 * not a way to read or change anything, but a way to make other people's
 * checkouts wait. It belongs to `create_booking`, which is SECURITY DEFINER and
 * calls it as the owner regardless of who is granted what.
 */
revoke execute on function public.apply_maintenance_block()    from public, anon, authenticated;
revoke execute on function public.log_partner_change()         from public, anon, authenticated;
revoke execute on function public.package_line_same_partner()  from public, anon, authenticated;
revoke execute on function public.assign_stay_inventory(uuid, date, date, uuid) from public, anon, authenticated;;
