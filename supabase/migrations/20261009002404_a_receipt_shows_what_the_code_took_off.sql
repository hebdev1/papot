-- `get_booking`, rewritten in full to carry the discount.
--
-- `total` is already net, so the amount charged was right either way — but a
-- receipt that shows only the net hides the thing the customer did. Someone
-- who typed a code wants to see that it worked, and someone chasing a missing
-- discount has nothing to point at. The subtotal, the code and the amount it
-- removed are all returned so the confirmation page can show the arithmetic.
--
-- Nothing else about the function changes: the reference is still not a
-- password, and the email is still the second half of the key.
create or replace function public.get_booking(p_reference text, p_email text default null::text)
returns json
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    'discount', b.discount,
    'discount_code', b.discount_code,
    -- Stated rather than left for the page to add up: the lines include the
    -- zero-priced parts of a package, so a browser summing them would not
    -- reliably arrive at this figure.
    'subtotal', b.total + coalesce(b.discount, 0),
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
                'discount', i.discount,
                'img', l.img, 'city', l.city, 'location', l.location)
              order by i.position)
         from public.booking_items i
         left join public.listings l on l.id = i.listing_id
        where i.booking_id = b.id), '[]'::json));
end;
$function$;;