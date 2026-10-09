# The bus vertical

Independent bus companies join PAPOT, publish routes and timetables, and sell
seats. A passenger searches Port-au-Prince → Cap-Haïtien for a date, compares
companies, picks a seat, pays, and gets a PDF e-ticket with a QR that a
boarding agent scans once.

It is a **fourth vertical**, not a second application: same auth, same partner
dashboard, same admin console, same money pipeline as `stay`, `car` and
`restaurant`. If you are new here, read `AGENTS.md` first — this file only
covers what is specific to buses.

---

## 1. The shape

**A route is a `listings` row. A departure is inventory. A seat is a row.**

```
partners(type='bus')
  ├── bus_coaches ──── bus_coach_seats      the fleet, and each coach's seat plan
  ├── bus_terminals                         the gares
  └── listings(kind='bus')                  ONE ROW PER ROUTE; price = the fare
        ├── bus_route_stops                 ordered stops, each pointing at a gare
        ├── bus_schedules                   weekdays[] + departs_at, the recurring timetable
        │     └── bus_departures            ONE ROW PER DATED DEPARTURE
        │           └── bus_departure_seats ONE ROW PER SEAT — the unit of inventory
        ├── bus_fares                       fare classes
        ├── bus_luggage_rules               free allowance + priced extras
        └── bus_cancellation_rules          the refund ladder
bus_tickets             one per passenger: qr_code, access_token, checked_in_at
bus_trip_events         delays, cancellations, check-ins — the audit trail
bus_staff_assignments   driver / boarding agent per departure
```

**Why a route is a listing.** It inherits the draft→submitted→published
lifecycle, admin moderation, partner RLS, packages, promotions, reviews,
favourites, the trip planner, `commission_rules.service_kind`, the search grid
and the destination counts. A parallel vertical would have duplicated all of
it.

**Why a seat is a row, not a counter.** This is the central decision. Stays
take `for update` on the capacity-carrying row and then count — correct, but
the lock is *convention*: nothing stops a second writer inserting a
`booking_items` row without taking it. Buses do not inherit that. Allocation is

```sql
update bus_departure_seats set booking_item_id = …
 where id in (select id from bus_departure_seats
               where departure_id = … and booking_item_id is null
                 and (held_until is null or held_until < now() or held_by = …)
               order by seat_no limit n
               for update skip locked)
```

so overselling is **physically impossible** rather than merely prevented, there
is no whole-table lock, and N seats on one sale line is natural.

**There is no holds table.** A checkout hold is `held_by` + `held_until` *on
the seat row*, so a hold and a sale contend for the same row. A separate table
would need "one unexpired hold per seat", which requires `now()` in a unique
index — something Postgres cannot express.

**One fare source**: `listings.price` *is* the fare; `bus_departures.fare` is a
nullable override coalesced over it. Two independent fare columns is the
`commission_rules` / `platform_settings` mistake, where the figure shown and
the figure charged part company.

**Times are a local clock time plus `duration_minutes`, never a `timestamptz`.**
Haiti observes DST. `bus_departure_instant(departs_on, departs_at, delayed_to)`
is the single place that turns those into an instant, via the IANA zone — and
it is also where a delay that crosses midnight is resolved (see §4.2).

---

## 2. Roles and permissions

No second staff system: `partner_members` already links users to a business.
Five permissions were added, with their role grants — **including `owner`**,
because the owner grant was a one-time `insert … select 'owner', code`, so a
new permission reaches nobody unless its rows are inserted.

| Permission | Covers |
|---|---|
| `manage_fleet` | coaches and their seat plans |
| `manage_network` | gares, routes, stops |
| `manage_departures` | schedules, departures, delays, cancellations |
| `sell_tickets` | counter sales |
| `board_passengers` | scanning and check-in |

Four roles were added — `dispatcher`, `ticket_agent`, `boarding_agent`,
`driver` — alongside the existing ten. A driver holds `view_reservations` only,
and `bus_staff_assignments` is what narrows that to the coach they are actually
driving.

Admin needs no new role: `view_listings`, `view_bookings`, `modify_bookings`,
`manage_verification`, `view_payments` and `view_analytics` cover every bus
screen.

**Isolation is enforced in RLS and in the definer functions, never in the
browser.** A company can never read another company's passengers, sales,
departures or payouts. Hiding a menu item is a courtesy, not a control.

---

## 3. From application to catalogue

`submit_partner_application` accepts a bus file: `cities_served`,
`partner_application_coaches`, `partner_application_routes`, plus a post-check
that a bus application declares at least one route and one coach.

`admin_decide_application(…, 'accept')` → `build_partner_listings(partner)`
creates, in one transaction: one `listings(kind='bus', status='draft')` per
declared route, its `bus_route_stops`, one `bus_coaches` row per declared
coach, and one `bus_terminals` row per declared city.

**It never invents a value the form did not collect** — the same rule the car
and restaurant branches follow. No fare is written that the applicant did not
give.

---

## 4. The five lifecycles

### 4.1 Timetable → departures

`bus_schedules` holds the recurring pattern. `bus_publish_timetable(listing,
until)` materialises `bus_departures` rows within a clamped horizon, and
`bus_materialize_departures` — the function that actually writes — is **revoked
from everyone**: it is reachable only through the publish function, which checks
`manage_departures`.

**This is deliberate and load-bearing.** Calling it lazily from the public
search would re-open the hole `AGENTS.md` records for `create_booking`: an
anonymous caller looping over dates to fill the table. Instead the partner's
Départs screen says how far the timetable is published and offers to extend it,
and the public search simply finds nothing beyond the horizon.

**There is no scheduler.** `pg_cron` and `pg_net` are available on the project
but not installed.

### 4.2 Delay

`bus_delay_departure(departure, new_time, reason)` stores `delayed_to` and sets
the status to `delayed`.

`delayed_to` is a bare `time`, which cannot say "tomorrow". A 23:00 coach
delayed to 01:00 would read as **twenty-two hours earlier** on the same date —
which would have put every overnight-delayed departure in the past and quietly
refunded nobody. `bus_departure_instant` resolves it: a delay only ever moves
forward, so a stored time before the scheduled one means the next day. The
function refuses a move backwards.

### 4.3 Cancellation and refunds

The ladder lives in `bus_cancellation_rules`: tiers of
`hours_before → refund_percent (+ fee_flat)`. A quote takes the highest rung it
is still above. A **route's** rungs replace the **company's** as a whole set —
merging them would produce a policy neither screen ever showed.

`bus_refund_policy(listing)` resolves route → company → **platform default**
(48 h/90 %, 24 h/50 %, 2 h/0 %). A company that has never opened the policy
screen still has a policy; the alternative — no rules meaning no refund — would
be the harshest possible terms arrived at by silence.

**The platform floor is applied to the computed figure, not to each rule.**
`bus_refund_protected_hours` and `bus_refund_min_percent` (both in
`platform_settings`) guarantee a minimum refund beyond the protected window. A
per-rule check would be evaded by simply not writing a generous rung, since a
quote falls to the next rung down.

Cancelling does three things or none of them:

1. the ticket is marked `cancelled`;
2. **the seat goes back on sale** — a cancelled ticket still holding its seat
   is a seat nobody can ever buy again, and the loss is silent;
3. a `refunds` row is filed as `requested`.

That last point is reuse, not a new pipeline: `refunds` already had
`cancellation_fee`, `eligible_amount`, `final_amount` and `admin_decide_refund`,
and had never been written to. The admin decides; the company only reads.

`bus_cancel_departure` sets the status **first** (so each quote sees a cancelled
departure and applies 100 % with no fee), then writes its trip event **before**
cancelling the tickets — so the notice still knows which tickets were live —
then cancels them.

### 4.4 Sale

```
/bus → bus_search(from, to, date, pax)
     → /bus/depart/:id → bus_departure_detail + bus_seat_map
     → seats held on their own rows → passengers named
     → /checkout → demo_checkout → create_booking
                                 → quote_booking_item   (price rebuilt)
                                 → assign_bus_seats     (skip locked)
                                 → bus_tickets + qr_code + access_token
                                 → payments, per partner per kind
```

`bus_hold_seats` is **authenticated-only**, a deliberate deviation from the
original spec. A ten-minute hold handed to `anon` is the power to freeze a whole
coach from a loop. A guest therefore gets no hold and claims seats atomically at
payment, being told plainly if one has gone.

### 4.5 Boarding

`bus_validate_ticket(code, departure)` answers `VALID`, `ALREADY_USED`,
`WRONG_TRIP`, `CANCELLED` or `INVALID`. The ticket row is locked before
anything is decided, so two doors cannot both read `VALID`.

The QR carries `qr_code` (128-bit random), **not** the ticket number — encoding
the readable number would make every printed ticket forgeable from a photograph
of another one. A scanner belonging to another company always gets `INVALID`,
so it cannot be used as an oracle.

---

## 5. Money

- **Fares are USD**, like every other price, with HTG shown from
  `exchange_rates`. (An HTG-canonical variant was costed and rejected: it would
  have needed a currency pre-pass in `create_booking`, fx columns on `payments`,
  a split cart with two non-atomic card validations, and a rewrite of eleven
  reporting aggregates that `sum(amount)` with no currency grouping.)
- **Commission** comes from `commission_rules` via `effective_commission()`,
  seeded at 10 % for `partner_type='bus'`. Without that row it computes zero
  and every ticket earns nothing.
- `demo_checkout` writes **one `payments` row per partner per kind**. It used to
  group with `min(bi.kind::text)`, and `'bus'` sorts before `'car'`,
  `'restaurant'` and `'stay'` — so any mixed cart would have charged the
  transport rate on everything that partner sold.
- **Promo codes: whoever offered the code absorbs it.**

  | Code | Passenger pays | Company receives | Commission |
  |---|---|---|---|
  | the company's own (`partner_discounts`, or a `promotions` campaign scoped via `eligible_partners`) | 18 | **18** | 1.80 |
  | an open PAPOT campaign | 18 | **20** (in full) | **0** |

  On a 20 $ sale at 10 % with a 2 $ code. In the first case
  `sum(payments.amount)` still equals `bookings.total`; in the second, gross
  legitimately exceeds what the customer paid, which is why
  `payments.discount` and `discount_borne_by` exist rather than just a smaller
  amount — a report that cannot tell the two apart reads the difference as a
  hole in the books.

  The bearer is decided in exactly one place, `resolve_discount_code`, so the
  sale and the payout cannot disagree.

- **Payouts** need no bus-specific code: `src/partner/pages/Money.tsx` has no
  kind-specific logic, so Finance / Versements / Transactions / Factures worked
  for buses the day the first payment row existed.
- `demo_payments` stays **on**; no card is charged. A real gateway goes
  *behind* `create_booking`, exactly where `demo_checkout` sits — never beside
  it (see §7).

---

## 6. Security

Everything in `AGENTS.md § Security` applies. What is specific here:

- **The price is never taken from the payload.** `quote_booking_item` rebuilds
  the fare from the catalogue; the browser names options (`departure_id`,
  `fare_class`, `seat_nos`, `extra_bags`) and never prices. The same holds for
  refunds and promo codes.
- **A new `SECURITY DEFINER` function needs both** its permission check *and*
  no grant to `anon`. `grant execute … to authenticated` does **not** close
  anything: Postgres grants EXECUTE to PUBLIC at creation and `anon` inherits
  it. Four lifecycle writes shipped that way before the re-audit caught them.
  Always `revoke execute … from public` — naming only `anon` is a silent no-op.
- **Reachable by `anon`, each for a stated reason**: `bus_search`,
  `bus_cities_served`, `bus_route_pairs`, `bus_departure_detail`,
  `bus_seat_map`, `bus_availability`, `bus_refund_policy`,
  `bus_ticket_refund_quote`, `bus_cancel_ticket`, `bus_ticket_by_token`,
  `bus_review_by_token`, `bus_review_state`, `bus_route_reviews`,
  `bus_company_public`, `bus_companies_public`, `check_promo_code`,
  `submit_review`. Everything else is revoked.
- **A short reference is not a password.** `get_booking` and `submit_review`
  need the reference *and* the email. A 128-bit `access_token` is different in
  kind: it is the whole credential, which is why the ticket page, the refund
  quote, the cancellation and the review-by-token all take it alone.
- **Tables are closed; functions are the API.** A visitor reads bus data
  through the `bus_*` definer functions. `bus_coaches`, `bus_tickets`,
  `bus_trip_events`, `notifications`, `refunds`, `promotion_redemptions` and
  the rest return **zero rows** to `anon`; `bookings` and `booking_items` have
  no grant at all.
- A gare is public only when a **published route stops there** — not merely
  when its company has a published route somewhere. The looser version leaked
  which towns a company was preparing to serve.

---

## 7. Extending it

**Adding a payment provider.** Write a new function alongside `demo_checkout`:
validate the instrument, then call `create_booking`, then write the `payments`
rows. Make it `SECURITY DEFINER` and owned by `postgres` so it calls
`create_booking` as the owner. **Never re-grant `create_booking` to `anon`** —
on its own it returns a confirmed booking with no payment, and the lines hold
inventory, so a loop over dates fills every calendar on the platform.

**Adding a notification channel.** `notify_event()` writes rows only;
`notification_deliveries` carries one row per channel. Add the channel to the
`notification_channel` enum (alone in its own migration — `add value` cannot
share a transaction with its first use), then teach
`supabase/functions/dispatch-notifications` to drain it. No business logic
changes: a provider outage must never roll back the refund that caused the
notice.

**Adding a notice.** Do not call `notify_event` from a lifecycle function.
Write a `bus_trip_events` row; the trigger `bus_trip_events_notify` fans out.
That way the notice and the audit row cannot drift apart.

**Adding a field to the ticket PDF.** Put it through `pdfText()`
(`supabase/functions/send-bus-ticket/pdf-text.ts`). pdf-lib's standard fonts are
WinAnsi and `drawText` throws outside CP1252 — every route is named
`Origine → Destination`, and that arrow once broke **100 %** of ticket PDFs.

---

## 8. Environment

No new secrets. The bus functions reuse what is already set on the project:
`RESEND_API_KEY`, `PARTNER_EMAIL_FROM`, `SITE_URL`. Without `RESEND_API_KEY`,
`send-bus-ticket` and `dispatch-notifications` answer 503 and send nothing,
which is said plainly rather than reported as success.

`VITE_SITE_URL` (in `.env.production`) is the origin the sitemap and the
ticket links use.

---

## 9. Testing

```bash
npx pnpm@10 typecheck     # tsc --noEmit
npx pnpm@10 test          # vitest: clock arithmetic, slugs, the PDF sanitiser
npx pnpm@10 build
npx pnpm@10 sitemap       # regenerates public/sitemap.xml from what is published
node scripts/migration-drift.mjs   # the repo's half of the AGENTS.md md5 check
```

**The database rules are tested in SQL**, not from Node: run
`supabase/tests/bus_rules.sql` whole. It builds its own fixture, asserts, and
ends by raising — which rolls everything back, so it is safe against
production. Success is the error message `ALL BUS RULES PASSED (rolled back)`.
It covers oversell, the refund ladder and the platform floor, seat release on
cancellation, full refund on a company cancellation, the overnight delay,
cross-company scan isolation, both promo bearers, and the review gate.

Testing those rules from Node would mean mocking the database, which proves
only that the mock agrees with itself.

**Two traps that produced false results before they were understood:**

- `current_date` is **UTC**; everything customer-facing uses `haiti_today()`.
  Between 20:00 and midnight Haiti time they are different days, so a code
  ending `current_date - 1` is still live. Build date fixtures from
  `haiti_today()`.
- PAPOT's first two auth users are `super_admin`, and every bus guard is
  `partner_can(…) or admin_can(…)`. A permission test run as one of them
  measures `admin_can()` and proves nothing about company isolation. Use a
  non-staff user, and make the negative case an **owner of a different
  partner**.

---

## 10. Deliberately not built

- **Departure reminders.** The one notice nobody triggers, so it needs a
  scheduler. `pg_cron`/`pg_net` are available but not installed, and wiring
  them means putting a service-role key in the database via vault. Delays and
  cancellations do not need it: the screen that causes them calls
  `dispatch-notifications` fire-and-forget.
- **JSON-LD.** `public/.htaccess` sets `script-src 'self'` with no
  `'unsafe-inline'`, and the build contains no inline script at all. A
  `<script type="application/ld+json">` block would be the first, and browsers
  that enforce script-src on non-executable script types drop it without a
  word. Structured data that silently does not ship is worse than none. It
  needs SSR or a CSP hash — a decision, not an afterthought. Titles,
  descriptions, canonicals and a real sitemap are shipped instead.
- **Redeeming `partner_discounts` outside a promo code.** The table also
  supports non-code discounts (`min_nights`, `eligible_listings`); only the
  code path is redeemed today.
