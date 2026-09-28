-- The previous revoke was a no-op, for the mirror image of the reason the
-- column revoke was.
--
-- `proacl` on all five reads `{=X/postgres, postgres=X/postgres,
-- authenticated=X/postgres, service_role=X/postgres}`. The leading `=X` is the
-- grant to PUBLIC, and `anon` was executing them by inheriting it, not by a
-- grant of its own — so `revoke ... from anon` removed a privilege that was
-- never there and changed nothing.
--
-- Revoking from PUBLIC is what actually closes it. `authenticated=X` is a
-- separate, explicit grant and survives untouched, which is what the partner
-- console needs.
--
-- Two revokes in one audit, both silent, both for the same underlying reason:
-- a revoke has to name the grant that exists. Worth remembering.

revoke execute on function public.mark_food_order_paid(uuid, text)       from public;
revoke execute on function public.advance_food_order(uuid, text, text)   from public;
revoke execute on function public.reassign_reservation_table(uuid, uuid) from public;
revoke execute on function public.restaurant_finance(uuid, date, date)   from public;
revoke execute on function public.restaurant_food_stats(uuid, integer)   from public;
;
