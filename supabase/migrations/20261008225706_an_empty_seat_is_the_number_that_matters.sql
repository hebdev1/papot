-- What the platform needs to know about the bus vertical.
--
-- Load factor is the headline, not revenue. A coach that leaves half empty
-- costs the company the same as a full one, so it is the number that says
-- whether a route should exist — and it is invisible in the money tables,
-- which only ever record the seats that did sell.
--
-- The window is over DEPARTURE dates, not booking dates: "how did last month's
-- coaches run" is the question, and a seat sold in January for a March coach
-- belongs to March.
create or replace function public.admin_bus_stats(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_from date := current_date - greatest(coalesce(p_days, 30), 1);
  v_out  jsonb;
begin
  if not public.admin_can('view_analytics') then
    raise exception 'Permission requise : view_analytics' using errcode = '42501';
  end if;

  with deps as (
    select d.id, d.listing_id, d.status, d.seats_total, d.delayed_to, l.name as route,
           l.partner_id, p.business_name
      from public.bus_departures d
      join public.listings l on l.id = d.listing_id
      join public.partners p on p.id = l.partner_id
     where d.departs_on >= v_from and d.departs_on <= current_date
  ),
  seats as (
    select t.departure_id,
           count(*) filter (where t.status <> 'cancelled')                        as sold,
           count(*) filter (where t.status = 'checked_in')                        as boarded,
           coalesce(sum(t.amount) filter (where t.status <> 'cancelled'), 0)      as revenue
      from public.bus_tickets t
      group by t.departure_id
  )
  select jsonb_build_object(
    'days',             greatest(coalesce(p_days, 30), 1),
    'departures',       count(*),
    'cancelled',        count(*) filter (where d.status = 'cancelled'),
    'delayed',          count(*) filter (where d.delayed_to is not null),
    'seats_offered',    coalesce(sum(d.seats_total), 0),
    'seats_sold',       coalesce(sum(s.sold), 0),
    'load_factor',      case when coalesce(sum(d.seats_total), 0) = 0 then null
                             else round(100.0 * coalesce(sum(s.sold), 0)
                                        / sum(d.seats_total), 1) end,
    'boarded',          coalesce(sum(s.boarded), 0),
    -- Of the seats sold, how many actually turned up. A gap here is either
    -- no-shows or a crew not scanning, and the two look identical from a
    -- dashboard — so it is reported, not interpreted.
    'boarding_rate',    case when coalesce(sum(s.sold), 0) = 0 then null
                             else round(100.0 * coalesce(sum(s.boarded), 0)
                                        / sum(s.sold), 1) end,
    'revenue',          coalesce(sum(s.revenue), 0),
    'on_time_rate',     case when count(*) = 0 then null
                             else round(100.0 * count(*) filter (
                                    where d.delayed_to is null and d.status <> 'cancelled')
                                        / count(*), 1) end,
    'top_routes', coalesce((
      select jsonb_agg(x) from (
        select d2.route, d2.business_name as company,
               count(*)                                  as departures,
               coalesce(sum(s2.sold), 0)                 as seats_sold,
               coalesce(sum(s2.revenue), 0)              as revenue,
               case when coalesce(sum(d2.seats_total), 0) = 0 then null
                    else round(100.0 * coalesce(sum(s2.sold), 0)
                               / sum(d2.seats_total), 1) end as load_factor
          from deps d2 left join seats s2 on s2.departure_id = d2.id
         group by d2.route, d2.business_name
         order by coalesce(sum(s2.sold), 0) desc
         limit 10) x), '[]'::jsonb))
    into v_out
    from deps d left join seats s on s.departure_id = d.id;

  -- Refunds are counted against bus companies over the same window of
  -- REQUEST dates: a refund is an event in its own right, not a property of
  -- the departure it undoes.
  return v_out || (
    select jsonb_build_object(
             'refunds',       count(*),
             'refund_amount', coalesce(sum(coalesce(r.final_amount, r.eligible_amount)), 0),
             'refund_rate',   case when (v_out ->> 'revenue')::numeric = 0 then null
                                   else round(100.0 * coalesce(sum(
                                          coalesce(r.final_amount, r.eligible_amount)), 0)
                                          / (v_out ->> 'revenue')::numeric, 1) end)
      from public.refunds r
      join public.partners p on p.id = r.partner_id and p.type = 'bus'
     where r.created_at >= v_from);
end;
$fn$;

revoke execute on function public.admin_bus_stats(int) from public;
revoke execute on function public.admin_bus_stats(int) from anon;
grant execute on function public.admin_bus_stats(int) to authenticated;;