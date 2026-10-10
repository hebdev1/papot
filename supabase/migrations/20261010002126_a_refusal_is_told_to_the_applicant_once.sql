-- The refusal was silent too, and the admin screen says it is not.
--
-- The confirm dialog behind "Refuser" reads "Le motif est conservé et transmis
-- au demandeur", and the reason is indeed required — `admin_decide_application`
-- refuses a rejection with fewer than five characters of note. It was then
-- stored in `review_note` and shown to nobody.
--
-- Its own flag rather than a shared one. A dossier can in principle be
-- rejected after having been accepted, and then both letters are true things
-- that were sent; one column could not record that, and reusing
-- `approval_sent_at` would have made the second letter impossible.
alter table public.partner_applications
  add column rejection_sent_at timestamptz;

comment on column public.partner_applications.rejection_sent_at is
  'When the refusal email went out, carrying review_note. Null means not sent, so a failed send can be retried.';;