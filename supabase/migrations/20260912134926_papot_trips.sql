/**
 * Trips group the services a customer booked for the same journey (spec §6):
 * "the platform should organize services into a trip when dates and
 * destinations are related". Grouping is by date proximity rather than
 * destination, because a single trip legitimately spans cities — a car picked
 * up in Port-au-Prince for a stay in Cap-Haïtien is one trip, not two.
 */
create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  destination text,
  starts_on   date not null,
  ends_on     date not null,
  created_at  timestamptz not null default now(),
  constraint trip_dates_ordered check (ends_on >= starts_on)
);

create index trips_user_idx on public.trips (user_id, starts_on desc);

alter table public.booking_items
  add column trip_id uuid references public.trips(id) on delete set null;

create index booking_items_trip_idx on public.booking_items (trip_id);

alter table public.trips enable row level security;
revoke all on public.trips from anon, authenticated;

/** Days of slack on either side that still count as the same journey. */
create or replace function public.trip_slack_days()
returns integer language sql immutable as $$ select 2 $$;

/**
 * Attaches every dated item of a booking to a trip, creating or widening one
 * as needed. Idempotent: re-running on the same booking changes nothing.
 */
create or replace function public.attach_items_to_trips(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid;
  v_item  record;
  v_trip  uuid;
  v_from  date;
  v_to    date;
  v_slack integer := public.trip_slack_days();
begin
  select user_id into v_user from public.bookings where id = p_booking;
  -- Guest checkouts have no account to hang a trip on.
  if v_user is null then
    return;
  end if;

  for v_item in
    select i.id, i.starts_on, i.ends_on, i.kind, l.city
      from public.booking_items i
      left join public.listings l on l.id = i.listing_id
     where i.booking_id = p_booking
       and i.starts_on is not null
       and i.trip_id is null
     order by i.starts_on
  loop
    v_from := v_item.starts_on;
    v_to   := coalesce(v_item.ends_on, v_item.starts_on);

    -- An existing trip whose window touches this item's window, slack included.
    select t.id into v_trip
      from public.trips t
     where t.user_id = v_user
       and daterange(t.starts_on - v_slack, t.ends_on + v_slack, '[]')
           && daterange(v_from, v_to, '[]')
     order by t.starts_on
     limit 1;

    if v_trip is null then
      insert into public.trips (user_id, destination, title, starts_on, ends_on)
      values (
        v_user,
        v_item.city,
        case when v_item.city is not null then 'Voyage à ' || v_item.city else 'Voyage' end,
        v_from, v_to)
      returning id into v_trip;
    else
      update public.trips
         set starts_on = least(starts_on, v_from),
             ends_on   = greatest(ends_on, v_to),
             -- A stay names the trip better than a car pickup does.
             destination = coalesce(destination, v_item.city),
             title = coalesce(title, case when v_item.city is not null
                                          then 'Voyage à ' || v_item.city else 'Voyage' end)
       where id = v_trip;
    end if;

    update public.booking_items set trip_id = v_trip where id = v_item.id;
  end loop;
end;
$$;

revoke all on function public.attach_items_to_trips(uuid) from anon, authenticated, public;
revoke all on function public.trip_slack_days() from anon, authenticated, public;

/** Trips with their items, chronological — the timeline's source (§6, §7). */
create or replace function public.my_trips()
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

  select coalesce(json_agg(t order by t.starts_on desc), '[]'::json)
    into v
    from (
      select tr.id, tr.title, tr.destination, tr.starts_on, tr.ends_on,
             coalesce((
               select json_agg(json_build_object(
                        'title', i.title, 'detail', i.detail, 'kind', i.kind,
                        'amount', i.amount, 'status', i.status,
                        'starts_on', i.starts_on, 'ends_on', i.ends_on,
                        'start_time', i.start_time, 'party', i.party,
                        'reference', bk.reference,
                        'img', l.img, 'city', l.city, 'location', l.location)
                      order by i.starts_on, i.start_time nulls first)
                 from public.booking_items i
                 join public.bookings bk on bk.id = i.booking_id
                 left join public.listings l on l.id = i.listing_id
                where i.trip_id = tr.id), '[]'::json) as items,
             (select count(*) from public.booking_items i where i.trip_id = tr.id) as item_count
        from public.trips tr
       where tr.user_id = auth.uid()
    ) t;

  return v;
end;
$$;

revoke all on function public.my_trips() from public, anon;
grant execute on function public.my_trips() to authenticated;;
