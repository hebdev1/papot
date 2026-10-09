-- Closing the default PUBLIC grant on the lifecycle writes.
--
-- `grant execute ... to authenticated` does not take anything away: Postgres
-- grants EXECUTE to PUBLIC when a function is created, and `anon` inherits
-- PUBLIC. So delaying a departure, cancelling one, cancelling someone else's
-- ticket and moving a status were all reachable by a visitor with the
-- publishable key.
--
-- Each of them does check `partner_can()` first and would have answered 42501,
-- so nothing was open — but AGENTS.md records the rule as **both**: the check
-- AND no grant to `anon`. One without the other rests on nobody ever shipping
-- a function whose first line is missing. This is the same audit that took
-- EXECUTE off all 50 console actions.
--
-- The revoke names `public`, which is the grant that actually exists; naming
-- only `anon` would be a silent no-op, and this project has lost two
-- migrations to exactly that.

revoke execute on function public.bus_set_departure_status(uuid, public.bus_departure_status, text) from public;
revoke execute on function public.bus_set_departure_status(uuid, public.bus_departure_status, text) from anon;

revoke execute on function public.bus_delay_departure(uuid, time, text) from public;
revoke execute on function public.bus_delay_departure(uuid, time, text) from anon;

revoke execute on function public.bus_cancel_departure(uuid, text) from public;
revoke execute on function public.bus_cancel_departure(uuid, text) from anon;

revoke execute on function public.bus_cancel_ticket_for(uuid, text) from public;
revoke execute on function public.bus_cancel_ticket_for(uuid, text) from anon;

-- A reference generator is a writer's helper, not an endpoint.
revoke execute on function public.next_refund_reference() from public;
revoke execute on function public.next_refund_reference() from anon;
revoke execute on function public.next_refund_reference() from authenticated;

-- Trigger functions. Calling one directly raises anyway, but a SECURITY
-- DEFINER routine that writes should not be in anyone's reach to try.
revoke execute on function public.bus_trip_event_notifies() from public;
revoke execute on function public.bus_trip_event_notifies() from anon;
revoke execute on function public.bus_trip_event_notifies() from authenticated;

revoke execute on function public.bus_rule_route_belongs_to_partner() from public;
revoke execute on function public.bus_rule_route_belongs_to_partner() from anon;
revoke execute on function public.bus_rule_route_belongs_to_partner() from authenticated;

-- A pure date helper no browser calls: it is reached only from inside the
-- definer functions, which run as the owner.
revoke execute on function public.bus_departure_instant(date, time, time) from public;
revoke execute on function public.bus_departure_instant(date, time, time) from anon;
revoke execute on function public.bus_departure_instant(date, time, time) from authenticated;

-- Deliberately still open to `anon`, and each for a stated reason:
--   bus_refund_policy        — the trip page shows the terms before a sale.
--   bus_ticket_refund_quote  — a guest must see what they get back.
--   bus_cancel_ticket        — a guest cancels with the token they were
--                              emailed, which is the same credential that
--                              displays the ticket. The printed QR carries
--                              `qr_code`, not this, so photographing a
--                              boarding pass does not let a stranger cancel.;