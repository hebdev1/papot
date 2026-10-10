-- Approving a dossier has been silent since the beginning.
--
-- The wizard promises the opposite, twice: "Vous recevrez un e-mail de
-- confirmation avec le statut de votre demande" and "Vous serez notifié par
-- e-mail dès que votre annonce sera approuvée". `admin_decide_application`
-- creates the business, the owner membership and the draft listings, then
-- writes an audit row and stops. Nothing has ever told the applicant.
--
-- This column is the single-shot flag for the mail that now does, in the same
-- role `confirmation_sent_at` plays for the receipt. It is deliberately a
-- SEPARATE column: the receipt and the approval are two different letters
-- sent days apart, and sharing one flag would make the second silently
-- impossible.
alter table public.partner_applications
  add column approval_sent_at timestamptz;

comment on column public.partner_applications.approval_sent_at is
  'When the approval email went out. Null means it has not been sent, so a failed send can be retried; set means never send it again.';;