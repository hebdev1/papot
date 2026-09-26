# PAPOT

React + Vite + Tailwind CSS booking front-end, backed by Supabase.

## Development Server

Start it with `npx pnpm@10 dev` (pnpm is not installed globally; `corepack enable`
needs admin). Vite serves on http://localhost:5173 with hot reload.

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `src/lib/supabase.ts` - Supabase browser client, reads `VITE_SUPABASE_*` from `.env`
- `src/types/database.ts` - Types generated from the Supabase schema
- `.env` - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (git-ignored; publishable key only),
  plus optional `VITE_SITE_URL` - the canonical origin for links that travel in
  email. Set it on the production deployment only: unset, `src/lib/authRedirect.ts`
  falls back to the current origin, which is what development and preview
  deployments want.
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Deployment

The canonical site is **https://papotht.com**, served from Hostinger. The build
is static: `npx pnpm@10 build`, then upload everything in `dist/` to
`public_html/`.

**Upload the hidden files too.** `dist/.htaccess` is what makes `/admin`,
`/partenaire` and `/p/<id>` work: without it the server looks for a directory of
that name, fails, and answers 404 — the home page loads and every deep route
does not. The File Manager and most FTP clients skip dotfiles unless told
otherwise (File Manager: Settings → Show hidden files; FileZilla: Server → Force
showing hidden files). A 404 on `/admin` and a working `/` is always this.

Hostinger puts a CDN in front (`Server: hcdn`), which caches those 404s. Purge
it after the first upload: hPanel → Performance → CDN → Purge cache.

`.env.production` pins `VITE_SITE_URL` to the canonical origin. It is versioned
because it holds no secret, and because a correct build should not depend on
someone remembering to set a variable. Vite reads it for `vite build` only, so
development keeps its own origin and never mails a confirmation link to
production.

`papot.vercel.app` still deploys from `main` and works; it is a mirror, not the
canonical site.

## Admin console

The staff console lives under `src/admin/` and is mounted at `/admin`, lazily,
so it stays out of the public bundle. Its structure:

- `lib/adminAuth.tsx` - who the admin is and what they may do (`admin_me()`)
- `lib/adminData.ts` - `useTable` / `useRow` / `useRpc`, CSV export, and the
  `adminRpc` / `adminTable` boundary where runtime-built names meet the typed
  Supabase client
- `lib/nav.ts` - the single navigation definition used by the sidebar, the
  mobile menu, the command palette and the route guard
- `components/` - shell, DataTable, FilterBar, dialogs, charts, status system
- `pages/` - one file per screen

**Permissions are enforced in the database, never in the browser.** Every admin
read goes through RLS or a `security_invoker` view that requires `admin_can()`,
and every sensitive write goes through a `SECURITY DEFINER` RPC that re-checks
the permission and writes the audit row in the same transaction. Hiding a menu
item is a courtesy; it is not a control. When adding an admin action, add the
RPC first.

After any migration, regenerate the client types or the build will fail:
`src/types/database.ts` is generated, not hand-written.

## Migrations

`supabase/migrations/` mirrors the schema, one file per migration, named
`<version>_<name>.sql` the way the CLI names them. The files were taken from
`supabase_migrations.schema_migrations` — Supabase's own record of what it
executed — so they are the applied statements themselves, not a reconstruction
from the current schema. `supabase/config.toml` carries the project ref.

Migrations reach the database through the Supabase MCP server, which records
them in that table. **Write the file too**, with the same version and name, or
the repository and the project drift apart — and the drift is invisible until
someone tries to build the schema from scratch.

To check that nothing has drifted, compare one fingerprint rather than 115
files:

```sql
select count(*), md5(string_agg(version || ':' ||
         md5(rtrim(replace(array_to_string(statements, E';\n\n') || ';', E'\r\n', E'\n'))),
         ',' order by version))
  from supabase_migrations.schema_migrations;
```

and the same md5 over the local files, each `rstrip()`ped, joined the same way.

To link a fresh clone (asks for the database password, which is not in the
repository):

```
npx supabase link --project-ref sqkbtygodsomekizhhyj
```

## Partner dashboard

The business-facing dashboard lives under `src/partner/` and is mounted lazily
at `/partenaire`. It shares the console design system in `src/console/` with the
admin: `Ui`, `DataTable`, `Dialog`, `Charts`, `Cards`, `StatusBadge`, `format`
and the `data` layer (`useTable` / `useRow` / `useRpc`). Anything admin-only —
audit trail, internal notes, saved views — stays in `src/admin/lib/adminData.ts`.

**A partner is a business, not a person.** `partner_members` links users to a
business with one of 7 roles over 15 permissions; `partner_can(partner_id, perm)`
and `my_partner_ids()` are the gates. Every partner-facing table carries an RLS
policy keyed to the caller's own business, so `useTable("listings")` returns the
partner's listings for a partner and all of them for an admin, without the page
knowing the difference.

The navigation tree in `lib/nav.ts` is filtered twice: by role permissions and
by business type. A restaurant never sees "Chambres"; a car rental never sees
"Menu".

### From application to catalogue

`admin_decide_application(..., 'accept')` creates the business, its owner
membership and — through `build_partner_listings(partner)` — the listings the
file described, all in one transaction. A hotel or guesthouse becomes one `stay`
listing plus a `listing_units` row per declared room type; a rental company
becomes one `car` listing per declared vehicle plus a pickup location at the
business address; a restaurant becomes one `restaurant` listing plus its
`restaurant_details`. Everything lands as `draft`, so the partner completes and
publishes it themselves.

The generator is idempotent: a partner that already owns a listing is left
untouched, which is what makes `admin_generate_listings(partner)` safe to expose
as a button for partners approved before this existed.

**It never invents a value the form did not collect.** No `car_details` row is
written, because that table requires a fuel type and a drivetrain the wizard
never asks for, and a guessed spec on a card reads as fact to a traveller. Same
rule for `restaurant_details.price_band`. Photos are carried across as storage
paths in `attrs.photos`, not as `img`: the `partner-photos` bucket is private,
so there is no URL a public card could use.

### Offers (promotional packages)

`partner_packages` and `package_lines` let any business type bundle several
things it already sells under one name and one price — a room plus breakfast, a
car plus a driver, a table plus a menu. Every metier gets the same screen at
`/partenaire/paquets` under `manage_promotions`; a package appears on the fiche
of the annonce it sits on, and on the home page under "Offres du moment".

Two rules carry the feature. **A bound line never copies a price**: it points at
a `listing_units`, `listings` or `menu_items` row and `package_quote()` reads
the value live, so a tariff changed this morning is the one compared this
afternoon. **The saving is only shown when every line has a value** — a line the
partner described without pricing means there is no figure to state, and PAPOT
does not invent one. That is the same rule as the listings generator's.

The price of a sale comes from the database, never the payload:
`create_booking` reads `package_id`, re-reads the price, and ignores whatever
`amount` the browser sent. Everything else in the cart is still priced by the
browser — that is older than this feature and untouched by it.

### Availability

A room and a vehicle are finite, and until recently nothing said so.
`create_booking` wrote a `stay` or `car` line with no overlap check at all — only
restaurants were protected, by `assign_restaurant_table`. The same room could be
sold twice for the same night, and the live data contained exactly that.

`stay_availability(listing, from, to, unit)` is the one rule. The fiche reads it
to show what is left; `create_booking` calls it through
`assign_stay_inventory()`, which first takes `for update` on the row that carries
the capacity — the `listing_units` row for a séjour, the `listings` row for a
voiture — so two buyers of the last room are serialised and the second is told
rather than sold. `stay_availability_units()` answers a whole room list in one
round trip, for the fiche.

Three things decide capacity, in this order: `listing_units.units` for a room
type, one for a vehicle, and a per-day cap or closure in `listing_availability`.
**An empty calendar means open** — blocking is an act, not a default, and the
opposite would silently close every business that has not found the screen at
`/partenaire/disponibilite`. Dates are half-open, so a departure on the 16th
leaves the 16th free for the next guest.

A paquet holds everything it bundles, not only its first room: every bound line
except the one already written as the main article gets its own `booking_items`
row at zero, and that row is held like any other sale.

Scarcity is only shown when something has actually gone (`taken > 0`). A vehicle
is always one vehicle, so "il n'en reste qu'un" under every car would be a true
sentence carrying no information — which is what invented urgency looks like.

The dates come from the URL (`checkin` / `checkout`), collected on the home page
and editable on the fiche. They used to be two constants in `Property.tsx`, which
is why the availability check could not ship without `src/lib/stayDates.ts`: with
one date for everybody, the first buyer of a one-room type would have locked out
everyone after them.

### Money

`commission_rules` is what `effective_commission()` reads; `platform_settings`
only displays the rates in the admin screen. The two were out of step — the
rates were declared and the rules table was empty, so every commission computed
to zero — and the rules are now seeded from the settings. Change a rate in
`commission_rules`, not in `platform_settings`, or the figure shown and the
figure charged part company.

Payment runs through `demo_checkout(payload, number)` while the demo gateway is
on: it validates a test instrument, books, and writes one `payments` row per
partner, all in one transaction. A refusal writes nothing. The switch is the
`demo_payments` platform setting, so it goes off from `/admin/parametres`
without a deploy.

## Security

Audited end to end. What held, and what did not:

**The database layer held.** Every table has RLS with policies, `anon` has no
INSERT/UPDATE/DELETE grant anywhere, all 92 `SECURITY DEFINER` functions pin
`search_path`, and all 6 views are `security_invoker`. No table is reachable
around its policies.

**The price was not held.** `create_booking` took `amount` from the payload for
everything that was not a paquet, so a 500 $ suite could be bought for 1 $ by
editing one number. `quote_booking_item()` now rebuilds every tariff from the
catalogue and `create_booking` calls it; the payload's `amount` is read by
nothing. **The browser names options, never prices** — a vehicle sends
`with_driver` and `pickup`, and the fee for each is looked up here. When adding
a priced option, add it to that function, not to the payload.

**Every console function was callable by a stranger.** Each refused them
internally, and that check is the control — but the model rested on nobody ever
forgetting the first line of a new function. `anon` has since lost EXECUTE on
all 50 console actions. Six predicates keep it deliberately: `admin_can`,
`partner_can`, `is_staff`, `is_partner_member`, `my_partner_ids` and
`partner_me` are called from inside RLS policies, and a policy that cannot call
its predicate raises instead of returning false — revoking them breaks every
anonymous read of the catalogue.

**Booking is not an entry point.** `create_booking` was granted to `anon`, so
it could be called on its own: no card, no account, no gateway — and it returned
a `confirmed` booking with zero rows in `payments`. Worse than the free
reservation, the line holds inventory, so a loop over dates and listings fills
every calendar on the platform and the business stops selling. The lock that
prevents double-selling is exactly what gives that its teeth. It is now
reachable only through a payment function: `demo_checkout` today, a real gateway
later, both SECURITY DEFINER and owned by `postgres` so they call it as the
owner. **Any future gateway goes in the same place — never re-grant this.**

**A reference is not a password.** `get_booking` asked for nothing but a
booking reference and returned the traveller's name, email, telephone, total and
travel dates — past RLS, with no account. References are `PPT-<year>-<4 digits>`,
so nine thousand requests harvested the whole customer list, and travel dates
say when a house is empty. It now needs the reference *and* the email, unless
the caller is the signed-in owner. Anything else keyed only on a short,
human-readable identifier needs the same second factor; `track_food_order`
already had one.

**A new `SECURITY DEFINER` function needs both**: its own `admin_can()` /
`partner_can()` check, and no grant to `anon`. One without the other is half a
lock.

The HTTP headers live in `public/.htaccess` and only exist once that file is
uploaded — see Deployment. `script-src` is `'self'` with no `'unsafe-inline'`
because the build has no inline script; `style-src` must allow inline because
React writes `style` attributes and the receipt injects keyframes.

Still open, and deliberately not changed here: leaked-password protection is
disabled in the Supabase dashboard (Authentication → Policies), which is a
setting, not code.

## Dependencies

- Runtime: React 19, React DOM 19, and `@supabase/supabase-js`
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.
