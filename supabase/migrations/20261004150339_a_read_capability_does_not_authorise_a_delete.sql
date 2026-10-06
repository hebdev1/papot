/**
 * A capability that is named for reading does not authorise a delete.
 *
 * Four policies are written `for all` with a USING that admits staff and a
 * WITH CHECK that does not:
 *
 *   using (partner_can(partner_id, 'manage_promotions') or admin_can('view_listings'))
 *   with check (partner_can(partner_id, 'manage_promotions'))
 *
 * The asymmetry reads as "staff may look, partners may write", and it is that
 * for INSERT and UPDATE. It is not that for DELETE: PostgreSQL evaluates only
 * USING on a DELETE -- there is no new row to check -- so the read capability
 * is the whole test. Any staff member holding `view_listings` can delete any
 * partner's promotional offers and any line inside them, and any staff member
 * holding `view_payments` can delete any partner's discounts and fees. Not
 * their own tenant's: everyone's. `partner_discounts` and `partner_fees` are
 * what the pricing screens and `effective_commission` read, so the row that
 * disappears is a commercial term the partner agreed to and can no longer
 * prove.
 *
 * `view_listings` is held by analyst, content_manager, operations_manager,
 * partner_manager and super_admin; `view_payments` by analyst, finance_manager,
 * operations_manager, risk_manager and super_admin. Both are marked
 * `sensitive = false` in `admin_permissions`, which is the schema's own word for
 * "this one only looks".
 *
 * The fix is a split, not a revoke. The partner dashboard deletes these rows
 * directly from the browser -- `Packages.tsx:254`, `Pricing.tsx:388` and
 * `Pricing.tsx:619` all call `table(...).delete().eq("id", ...)` -- so taking
 * DELETE out of the grant would break three working screens. What is wrong is
 * the policy, so the policy is what changes: one `for all to authenticated`
 * keyed to the tenant's own write capability, and one `for select to
 * authenticated` for staff. Exactly the shape `listings` has carried since
 * 20260913151307, where the DELETE policy and the staff read policy are
 * separate objects. **The new policies are created before the old ones are
 * dropped**, so there is no instant in which the dashboard cannot write.
 *
 * The missing `TO authenticated` is added in the same pass.
 * `packages_partner_all` and `package_lines_partner_all` are two of the only
 * four policies out of 185 that apply to `{public}`, which means `anon`
 * evaluates them -- calling `partner_can` and `admin_can` for a caller who is
 * nobody -- on reads it should never have been weighed against. The other two
 * `{public}` policies are `packages_public_read` and `package_lines_public_read`
 * and they **stay** that way: those exist precisely so a signed-out visitor can
 * see an offer.
 *
 * Deliberately left alone. **Staff get SELECT and nothing else**, which is what
 * `view_listings` and `view_payments` are named for, and the admin console never
 * writes these four tables -- there is no reference to any of them anywhere
 * under `src/admin/`. If an admin ever needs to remove a partner's offer, that
 * is a SECURITY DEFINER RPC with its own capability and its own audit row, the
 * way `admin_set_listing_status` is, not a policy that lets a read capability
 * destroy a row without a trace. **The grants are untouched**: the three tables
 * keep their DML grant to `authenticated`, and `partner_packages` keeps the
 * column-scoped UPDATE from 20260915143208:61-65, which is what protects
 * `used_count`. **`partner_discounts` and `partner_fees` keep `manage_pricing`**
 * as the tenant capability; it is what they were written with, and promotions
 * are a different permission from tariffs on purpose.
 */

create policy packages_partner_write on public.partner_packages
  for all to authenticated
  using (partner_can(partner_id, 'manage_promotions'))
  with check (partner_can(partner_id, 'manage_promotions'));

create policy packages_staff_read on public.partner_packages
  for select to authenticated
  using (admin_can('view_listings'));

drop policy packages_partner_all on public.partner_packages;

create policy package_lines_partner_write on public.package_lines
  for all to authenticated
  using (exists (
    select 1 from public.partner_packages p
     where p.id = package_lines.package_id
       and partner_can(p.partner_id, 'manage_promotions')))
  with check (exists (
    select 1 from public.partner_packages p
     where p.id = package_lines.package_id
       and partner_can(p.partner_id, 'manage_promotions')));

create policy package_lines_staff_read on public.package_lines
  for select to authenticated
  using (admin_can('view_listings'));

drop policy package_lines_partner_all on public.package_lines;

create policy discounts_partner_write on public.partner_discounts
  for all to authenticated
  using (partner_can(partner_id, 'manage_pricing'))
  with check (partner_can(partner_id, 'manage_pricing'));

create policy discounts_staff_read on public.partner_discounts
  for select to authenticated
  using (admin_can('view_payments'));

drop policy discounts_partner_all on public.partner_discounts;

create policy fees_partner_write on public.partner_fees
  for all to authenticated
  using (partner_can(partner_id, 'manage_pricing'))
  with check (partner_can(partner_id, 'manage_pricing'));

create policy fees_staff_read on public.partner_fees
  for select to authenticated
  using (admin_can('view_payments'));

drop policy fees_partner_all on public.partner_fees;
;
