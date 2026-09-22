/**
 * A booking reference stops being a password.
 *
 * `get_booking` is SECURITY DEFINER, so it reads past RLS, and it asked for
 * nothing but a reference. It returned the traveller's first name, last name,
 * email address, telephone number, what they paid, and every line of the trip
 * with its dates and its destination.
 *
 * References are generated as PPT-<year>-<four digits>: nine thousand values a
 * year. Nine thousand requests therefore harvested the name, address, phone and
 * travel plans of every customer on the platform — automatable in minutes, from
 * anywhere, with no account. That is the whole customer list, and for a booking
 * site the travel dates are their own kind of harm: they say when a house is
 * empty.
 *
 * The reference stays short and human, because support reads it down a
 * telephone. It simply stops being sufficient on its own. A caller must now be
 * one of:
 *
 *   - the signed-in owner of the booking, by `user_id`;
 *   - a signed-in user whose own verified address is the booking's;
 *   - anyone who supplies the booking's email address alongside the reference.
 *
 * The third is what keeps a guest's confirmation page working without an
 * account. Guessing a reference is easy; guessing a reference and the matching
 * address is not.
 *
 * Nothing distinguishes "wrong reference" from "wrong address": both return
 * null. Telling them apart would turn this function into an oracle for which
 * references exist.
 */
create or replace function public.get_booking(
  p_reference text,
  p_email     text default null
)
returns json
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  b             public.bookings;
  v_caller_mail text;
  v_ok          boolean := false;
begin
  select * into b
    from public.bookings
   where reference = upper(btrim(coalesce(p_reference, '')));

  if not found then
    return null;
  end if;

  if auth.uid() is not null then
    if b.user_id = auth.uid() then
      v_ok := true;
    else
      select u.email into v_caller_mail from auth.users u where u.id = auth.uid();
      if v_caller_mail is not null and lower(v_caller_mail) = lower(b.email) then
        v_ok := true;
      end if;
    end if;
  end if;

  -- The guest path: the address is the second half of the key.
  if not v_ok and lower(btrim(coalesce(p_email, ''))) = lower(coalesce(b.email, '')) then
    v_ok := nullif(btrim(coalesce(p_email, '')), '') is not null;
  end if;

  if not v_ok then
    return null;
  end if;

  return json_build_object(
    'id', b.id,
    'reference', b.reference,
    'first_name', b.first_name,
    'last_name', b.last_name,
    'email', b.email,
    'phone', b.phone,
    'payment_method', b.payment_method,
    'total', b.total,
    'currency', b.currency,
    'status', b.status,
    'created_at', b.created_at,
    'items', coalesce(
      (select json_agg(json_build_object(
                'title', i.title, 'detail', i.detail,
                'amount', i.amount, 'kind', i.kind, 'status', i.status,
                'listing_id', i.listing_id,
                'starts_on', i.starts_on, 'ends_on', i.ends_on,
                'start_time', i.start_time, 'party', i.party,
                'img', l.img, 'city', l.city, 'location', l.location)
              order by i.position)
         from public.booking_items i
         left join public.listings l on l.id = i.listing_id
        where i.booking_id = b.id), '[]'::json));
end;
$fn$;

comment on function public.get_booking(text, text) is
  'One booking, for its owner or for whoever knows both its reference and its email. A reference alone proves nothing.';

-- The single-argument form is gone: left in place it would remain the open
-- door, since PostgREST would happily resolve a one-argument call to it.
drop function if exists public.get_booking(text);

revoke execute on function public.get_booking(text, text) from public;
grant  execute on function public.get_booking(text, text) to anon, authenticated;;
