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
- `.env` - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (git-ignored; publishable key only)
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

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

The schema lives in Supabase and is not yet mirrored into this repository.
To pull it into `supabase/migrations/` (needs the project's database password):

```
npx supabase link --project-ref sqkbtygodsomekizhhyj
npx supabase db pull
```

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
