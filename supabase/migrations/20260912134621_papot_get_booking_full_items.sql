-- get_booking backed only the confirmation screen, so it never returned the
-- structured dates or the listing photo. The customer panel's detail page
-- needs both, otherwise every fact renders as "—".
create or replace function public.get_booking(p_reference text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v json;
begin
  select json_build_object(
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
               where i.booking_id = b.id), '[]'::json))
    into v
    from public.bookings b
   where b.reference = upper(trim(p_reference));

  return v;  -- null when the reference is unknown
end;
$$;

revoke all on function public.get_booking(text) from public;
grant execute on function public.get_booking(text) to anon, authenticated;;
