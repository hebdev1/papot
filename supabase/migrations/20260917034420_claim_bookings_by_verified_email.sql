/**
 * Attaches to the caller anything they bought before they had an account.
 *
 * A purchase made without signing in records the buyer's email and nothing
 * else, so it never appears in their space — which is exactly the booking they
 * most want to follow. This closes the gap from the other end: the moment an
 * account exists for that address, what was bought with it becomes theirs.
 *
 * The address must be **confirmed**. Without that check, anyone could sign up
 * with someone else's email and inherit their bookings, their orders and their
 * trips — the whole point of the feature turned into a way to read a stranger's
 * travel. An unconfirmed account claims nothing and is told nothing.
 *
 * Idempotent: it only ever touches rows that have no owner, so calling it on
 * every visit to the traveller's space costs one cheap update of zero rows.
 */
create or replace function public.claim_my_purchases()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_bookings integer := 0;
  v_orders   integer := 0;
  v_trips    integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('claimed', false, 'reason', 'not_signed_in');
  end if;

  select u.email into v_email
    from auth.users u
   where u.id = v_uid
     and u.email_confirmed_at is not null;

  if v_email is null then
    return jsonb_build_object('claimed', false, 'reason', 'email_not_confirmed');
  end if;

  update public.bookings
     set user_id = v_uid
   where user_id is null
     and lower(email) = lower(v_email);
  get diagnostics v_bookings = row_count;

  update public.restaurant_orders
     set user_id = v_uid
   where user_id is null
     and lower(customer_email) = lower(v_email);
  get diagnostics v_orders = row_count;

  -- A trip is the thread a booking's items were hung on. It follows its
  -- booking rather than an address of its own.
  update public.trips t
     set user_id = v_uid
   where t.user_id is null
     and exists (
       select 1 from public.booking_items bi
        join public.bookings b on b.id = bi.booking_id
       where bi.trip_id = t.id and b.user_id = v_uid);
  get diagnostics v_trips = row_count;

  return jsonb_build_object(
    'claimed', true,
    'bookings', v_bookings,
    'orders', v_orders,
    'trips', v_trips);
end;
$fn$;

comment on function public.claim_my_purchases() is
  'Attaches bookings, restaurant orders and trips made before sign-up to the caller, matched on a confirmed email address only.';

grant execute on function public.claim_my_purchases() to authenticated;;
