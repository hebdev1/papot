import { Discounts } from "./Pricing";

/**
 * Spec §44–§46.
 *
 * A partner's promotions and coupons are the same object as a discount: a rule
 * that lowers a price, optionally behind a code. Rather than build a second
 * concept that would drift from the first, both screens present the discount
 * list — promotions unfiltered, coupons narrowed to the ones with a code.
 *
 * Platform-wide campaigns are a different thing entirely and live in the admin
 * console; a partner cannot create those, and should not be shown a form that
 * implies otherwise.
 */
export function Promotions() {
  return <Discounts />;
}

export function Coupons() {
  return <Discounts />;
}
