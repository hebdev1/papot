-- Five operator functions were still reachable without an account.
--
-- The earlier sweep took `anon` off the 50 console actions, but these five
-- were written for the restaurant side and were not in that list:
--
--   mark_food_order_paid        — marks a food order settled
--   advance_food_order          — moves an order through the kitchen
--   reassign_reservation_table  — moves a party to another table
--   restaurant_finance          — a partner's takings
--   restaurant_food_stats       — a partner's dish-level sales
--
-- Each one refuses a stranger on its own: the first three check
-- `partner_can(..., 'manage_orders' | 'manage_reservations')` or
-- `admin_can(...)` before touching anything, and an anonymous caller satisfies
-- neither. So this closes no open door — it applies the rule the project set
-- itself after the last audit: a SECURITY DEFINER function needs both its own
-- check and no grant to `anon`, because a check is only as durable as the next
-- person who edits the function.
--
-- All five are called from the partner console alone (Orders, FoodMoney,
-- Reservations); no public page uses them, so nothing anonymous regresses.
-- The two reads keep `authenticated` for the same reason they always had it:
-- the partner reading their own figures is signed in.

revoke execute on function public.mark_food_order_paid(uuid, text)       from anon;
revoke execute on function public.advance_food_order(uuid, text, text)   from anon;
revoke execute on function public.reassign_reservation_table(uuid, uuid) from anon;
revoke execute on function public.restaurant_finance(uuid, date, date)   from anon;
revoke execute on function public.restaurant_food_stats(uuid, integer)   from anon;
;
