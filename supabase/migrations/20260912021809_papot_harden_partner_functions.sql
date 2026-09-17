-- Trigger functions must not be reachable through PostgREST.
revoke all on function public.assert_lodging_application()   from anon, authenticated, public;
revoke all on function public.assert_car_application()        from anon, authenticated, public;
revoke all on function public.assert_amenity_applies()        from anon, authenticated, public;
revoke all on function public.enforce_application_transition() from anon, authenticated, public;

-- Helpers are internal to submit_partner_application.
revoke all on function public.parse_int(jsonb, text) from anon, authenticated, public;
revoke all on function public.parse_num(jsonb, text) from anon, authenticated, public;

alter function public.parse_int(jsonb, text) set search_path = pg_catalog, pg_temp;
alter function public.parse_num(jsonb, text) set search_path = pg_catalog, pg_temp;;
