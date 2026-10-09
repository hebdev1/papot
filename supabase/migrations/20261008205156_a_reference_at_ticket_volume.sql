-- A booking reference with room in it.
--
-- `PPT-<year>-<4 digits>` has nine thousand values a year and a retry loop on
-- collision. For hotel bookings that is survivable; at ticket volume the loop
-- starts dominating after a couple of thousand sales and becomes an infinite
-- loop at nine thousand — the function would hang, not fail, which is the worse
-- outcome.
--
-- Six characters of the readable base32 alphabet is a billion values, and the
-- `PPT-<year>-` prefix is kept so every reference already printed, emailed or
-- written on a receipt stays valid and still looks like the same thing.
--
-- It is still not a secret: get_booking asks for the reference *and* the email,
-- and a bus ticket's own secrets are its qr_code and access_token.
create or replace function public.next_booking_reference()
returns text
language plpgsql set search_path = public, pg_temp as $$
declare ref text;
begin
  loop
    ref := 'PPT-' || to_char(now(), 'YYYY') || '-' || public.bus_ticket_code(6, true);
    exit when not exists (select 1 from public.bookings where reference = ref);
  end loop;
  return ref;
end;
$$;;
