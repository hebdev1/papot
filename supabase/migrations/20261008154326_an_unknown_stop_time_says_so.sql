-- An intermediate stop's timing is not something the application form asks for,
-- and `not null default 0` made every unstated stop claim it is reached at the
-- moment of departure. A traveller reading "Saint-Marc — 06:00" on a coach that
-- leaves Port-au-Prince at 06:00 is being told something false.
--
-- Null now means "not stated", which is what the generator has to write and
-- what the fiche must render as a stop with no time beside it. The origin is
-- still 0 and the terminus still carries the declared duration, because those
-- two the company did state.
alter table public.bus_route_stops
  alter column arrive_offset_minutes drop not null;;
