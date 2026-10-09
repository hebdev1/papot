-- Four staff roles a transport company has and a hotel does not.
--
-- Alone in this migration for the same reason as 20261008151528: these values
-- are used by the partner_role_permissions seed in the next file, and
-- `add value` cannot share a transaction with its first use.
--
-- `driver` is deliberately the thinnest role on the platform: it holds
-- view_reservations and sees exactly one departure's manifest, through
-- bus_staff_assignments. A boarding agent scans; a dispatcher moves departures;
-- a ticket agent sells at the counter. None of them may touch money.
alter type public.partner_member_role add value if not exists 'dispatcher';
alter type public.partner_member_role add value if not exists 'ticket_agent';
alter type public.partner_member_role add value if not exists 'boarding_agent';
alter type public.partner_member_role add value if not exists 'driver';;
