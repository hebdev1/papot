-- Four bus functions were left executable by anon.
--
-- AGENTS.md's rule is that a new SECURITY DEFINER function needs **both** its
-- own capability check and no grant to anon, because one without the other is
-- half a lock. These four had neither: they are internals that acquired the
-- default EXECUTE grant to PUBLIC on creation, exactly as the console helpers
-- did before `20260922221157_internal_helpers_are_not_part_of_the_public_api`.
--
-- The three trigger functions cannot be invoked as RPCs — Postgres refuses to
-- call a trigger function directly, and firing a trigger does not re-check
-- EXECUTE on the caller — so revoking them changes no behaviour and closes the
-- surface anyway.
--
-- `bus_materialize_departure_seats` is the one that mattered: an ordinary
-- SECURITY DEFINER function returning integer, which writes seat rows and was
-- callable by any visitor. It is idempotent and refuses a departure that does
-- not exist, so the worst a caller could do was a no-op — but a definer write
-- reachable by anon is not something to leave standing on the strength of its
-- current body.
revoke all on function public.bus_materialize_departure_seats(uuid)
  from public, anon, authenticated;

revoke all on function public.bus_departure_gets_its_seats()
  from public, anon, authenticated;

revoke all on function public.bus_departure_is_self_consistent()
  from public, anon, authenticated;

revoke all on function public.bus_route_stop_belongs_to_the_company()
  from public, anon, authenticated;

revoke all on function public.assert_bus_application()
  from public, anon, authenticated;;
