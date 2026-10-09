-- Reviewing from the ticket itself.
--
-- `submit_review` asks for a reference AND an email, because a reference is
-- short and guessable. A ticket token is neither: 128 bits of randomness that
-- already opens the ticket and already authorises cancelling it. Asking its
-- holder to also type the buyer's address adds a step and no security —
-- worse, on a ticket bought by somebody else the passenger may not know it.
--
-- So this resolves the booking from the ticket and hands `submit_review` the
-- address it has on file. The checks that matter — the annonce was in the
-- booking, the journey has happened, one review each — stay in one place
-- rather than being copied here and drifting.
create or replace function public.bus_review_by_token(
  p_token       text,
  p_rating      smallint,
  p_title       text     default null,
  p_body        text     default null,
  p_punctuality smallint default null,
  p_comfort     smallint default null,
  p_cleanliness smallint default null,
  p_service     smallint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_ref     text;
  v_email   text;
  v_listing uuid;
begin
  select b.reference, b.email, bi.listing_id
    into v_ref, v_email, v_listing
    from public.bus_tickets t
    join public.booking_items bi on bi.id = t.booking_item_id
    join public.bookings b on b.id = bi.booking_id
   where t.access_token = btrim(coalesce(p_token, ''));

  if v_ref is null then
    raise exception 'Billet introuvable.' using errcode = 'P0002';
  end if;

  return public.submit_review(
    v_ref, v_listing, p_rating, v_email, p_title, p_body,
    p_punctuality, p_comfort, p_cleanliness, p_service);
end;
$fn$;

grant execute on function public.bus_review_by_token(text, smallint, text, text, smallint, smallint, smallint, smallint) to anon, authenticated;

-- Can this ticket still leave a review, and has it already? Asked by the
-- ticket page so it can show the form, the thank-you, or nothing at all,
-- without guessing at the rules the write path enforces.
create or replace function public.bus_review_state(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_booking uuid;
  v_listing uuid;
  v_item    uuid;
  v_status  text;
  v_ended   timestamptz;
  v_done    boolean;
begin
  select b.id, bi.listing_id, bi.id, t.status
    into v_booking, v_listing, v_item, v_status
    from public.bus_tickets t
    join public.booking_items bi on bi.id = t.booking_item_id
    join public.bookings b on b.id = bi.booking_id
   where t.access_token = btrim(coalesce(p_token, ''));

  if v_booking is null then
    return null;
  end if;

  select max(public.bus_departure_instant(d.departs_on, d.departs_at, d.delayed_to)
             + make_interval(mins => d.duration_minutes))
    into v_ended
    from public.bus_tickets t
    join public.bus_departures d on d.id = t.departure_id
   where t.booking_item_id = v_item and t.status <> 'cancelled';

  select exists (select 1 from public.reviews
                  where booking_id = v_booking and listing_id = v_listing)
    into v_done;

  return jsonb_build_object(
    'listing_id',  v_listing,
    'already',     v_done,
    'travelled',   v_ended is not null and v_ended <= now(),
    'cancelled',   v_status in ('cancelled', 'refunded'),
    'can_review',  v_ended is not null and v_ended <= now()
                   and not v_done and v_status not in ('cancelled', 'refunded'));
end;
$fn$;

grant execute on function public.bus_review_state(text) to anon, authenticated;;