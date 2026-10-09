-- A delivery the worker has picked up but not yet finished.
--
-- Without it two overlapping runs both read the same `pending` row and mail
-- the same cancellation notice twice. The worker claims a row by moving it
-- here with a conditional update, so exactly one run wins.
--
-- Alone in its own migration: `alter type ... add value` cannot share a
-- transaction with the first use of the value it adds.
alter type public.notification_delivery_status add value if not exists 'processing';;