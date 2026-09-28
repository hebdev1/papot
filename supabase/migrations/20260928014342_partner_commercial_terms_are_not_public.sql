/**
 * A business's file stops being readable by the whole internet.
 *
 * `partners_public_read` allowed anyone, signed in or not, to select every
 * column of every active partner. RLS filters rows, not columns, so that was
 * the whole row:
 *
 *   commission_override  the rate PAPOT negotiated with that business
 *   owner_name           the owner, by name
 *   legal_name           the registered entity
 *   email, phone         the business's contact details
 *   owner_id             the account behind it
 *
 * The commission is the damaging one. A competitor — or another partner —
 * could read that one hotel pays 5 % while another pays 12 %. No partner has a
 * negotiated rate today, so nothing has leaked yet; the column was simply
 * waiting for the first one. The rest is ordinary business PII that a
 * marketplace has no reason to hand out in bulk.
 *
 * Nothing needed it. No client code reads `partners` at all: the public site
 * never touches the table, the partner console goes through `partner_me()` and
 * its own membership policy, and the four admin views that join it are
 * `security_invoker` behind `admin_can()`, so they answer to the staff policy.
 *
 * The policy is removed rather than narrowed, because column privileges are
 * granted per role and `authenticated` covers travellers, partners and staff
 * alike — revoking columns there would blind the consoles too. If a public
 * "proposé par" ever needs the business name, it gets a view exposing that one
 * column, not the row.
 */
drop policy if exists partners_public_read on public.partners;;
