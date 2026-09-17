/**
 * The customer panel needs "my bookings", which the reference-keyed
 * get_booking cannot answer. Scoped to auth.uid() so a signed-in customer
 * only ever sees their own, and the tables stay deny-all.
 */
create or replace function public.my_bookings()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v json;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;

  select coalesce(json_agg(b order by b.created_at desc), '[]'::json)
    into v
    from (
      select bk.id, bk.reference, bk.status, bk.total, bk.currency,
             bk.first_name, bk.last_name, bk.email, bk.phone,
             bk.payment_method, bk.created_at,
             coalesce((
               select json_agg(json_build_object(
                        'title', i.title, 'detail', i.detail, 'kind', i.kind,
                        'amount', i.amount, 'status', i.status,
                        'listing_id', i.listing_id,
                        'img', l.img, 'city', l.city, 'location', l.location)
                      order by i.position)
                 from public.booking_items i
                 left join public.listings l on l.id = i.listing_id
                where i.booking_id = bk.id), '[]'::json) as items
        from public.bookings bk
       where bk.user_id = auth.uid()
    ) b;

  return v;
end;
$$;

revoke all on function public.my_bookings() from public, anon;
grant execute on function public.my_bookings() to authenticated;;
