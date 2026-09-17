-- Trigger functions must never be reachable through PostgREST.
revoke all on function public.handle_new_user()   from anon, authenticated, public;
revoke all on function public.touch_updated_at()  from anon, authenticated, public;

-- Pin search_path so these cannot be hijacked by a caller-controlled path.
alter function public.touch_updated_at()        set search_path = public, pg_temp;
alter function public.next_booking_reference()  set search_path = public, pg_temp;

-- next_booking_reference is an internal helper for create_booking only.
revoke all on function public.next_booking_reference() from anon, authenticated, public;;
