-- Guards the confirmation email: the Edge Function only sends when this is
-- null, so an application can never be emailed twice.
alter table public.partner_applications
  add column confirmation_sent_at timestamptz;;
