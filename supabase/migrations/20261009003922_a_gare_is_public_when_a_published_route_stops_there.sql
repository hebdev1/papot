-- Found by re-auditing what an anonymous visitor can actually read.
--
-- The public policy on `bus_terminals` was written to mean "a gare belonging
-- to a published route". What it said was "a gare belonging to a company that
-- has A published route" — so a company with one live line also published
-- every other gare it had filed, including the ones for lines it had not
-- launched yet.
--
-- Nothing secret leaks: a bus station is a physical place with a public
-- address. What leaks is intent — which towns a company is preparing to serve
-- — and that is a competitor's business, not a passenger's.
--
-- Safe to tighten: the public screens read gares through `bus_search`,
-- `bus_departure_detail` and `bus_company_public`, which are SECURITY DEFINER
-- and do not consult this policy. Only the partner dashboard queries the table
-- directly, under `bus_terminals_partner_read`.
drop policy bus_terminals_public_read on public.bus_terminals;

create policy bus_terminals_public_read on public.bus_terminals
  for select using (
    active and exists (
      select 1
        from public.bus_route_stops s
        join public.listings l on l.id = s.listing_id
       where s.terminal_id = bus_terminals.id
         and l.kind = 'bus'
         and l.published));;