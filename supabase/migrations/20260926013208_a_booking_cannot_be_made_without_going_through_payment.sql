/**
 * Booking stops being free, and the calendar stops being open to anyone.
 *
 * `create_booking` was granted to `anon`. Called on its own it skipped payment
 * entirely: no card, no account, no `demo_checkout` — and it returned a booking
 * marked `confirmed`, with confirmed lines, zero rows in `payments`, and the
 * room taken.
 *
 * Two harms, and the second is the worse one:
 *
 *   - a reservation the partner sees and honours, for which nothing was paid;
 *   - and, because the line holds inventory, a loop over dates and listings
 *     fills every calendar on the platform. No account, no payment, no trace
 *     beyond the rows themselves. The business stops selling.
 *
 * The lock added for double-selling is what makes the second one bite: the
 * booking is real inventory now, so taking it denies it to everyone else. A
 * protection and an opening are the same mechanism seen from two sides.
 *
 * `create_booking` is a step of checkout, not an entry point. `demo_checkout`
 * validates the instrument, then books and records the payment in one
 * transaction — a refusal writes nothing. Both are owned by `postgres` and both
 * are SECURITY DEFINER, so the gateway keeps calling this as the owner while
 * the public loses the direct line. A real gateway later takes the same place.
 */
revoke execute on function public.create_booking(jsonb) from public, anon, authenticated;

comment on function public.create_booking(jsonb) is
  'Writes a booking. Internal to checkout: reachable only through a payment gateway function, never granted to the public.';;
