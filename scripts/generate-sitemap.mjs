#!/usr/bin/env node
/**
 * Writes public/sitemap.xml from what is actually published.
 *
 * PAPOT is a client-rendered SPA: there is no SSR, so a crawler has to run the
 * JavaScript to see anything, and the one thing we can hand it without
 * guesswork is a list of URLs that exist. That is this file.
 *
 * It is deliberately NOT part of `build`. The build must stay independent of
 * the database being reachable — a sitemap that cannot be regenerated is a
 * stale sitemap, which is survivable; a deploy that cannot run is not. Run it
 * before a release: `npx pnpm@10 sitemap`.
 *
 * Only public, anon-callable reads are used, with the publishable key, so this
 * script holds no secret and can be run by anyone who can already browse the
 * site.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env reader: this script runs outside Vite, which normally does it. */
function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.production", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

const SUPABASE_URL = env("VITE_SUPABASE_URL");
const ANON = env("VITE_SUPABASE_ANON_KEY");
const SITE = (env("VITE_SITE_URL") ?? "https://papotht.com").replace(/\/$/, "");

if (!SUPABASE_URL || !ANON) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — cannot build a sitemap.");
  process.exit(1);
}

const slug = s =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function rpc(fn, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

const urls = new Map();
/** Later calls do not overwrite an earlier, more specific priority. */
const add = (path, priority, changefreq) => {
  if (!urls.has(path)) urls.set(path, { priority, changefreq });
};

// The pages that always exist.
add("/", "1.0", "daily");
add("/bus", "0.9", "daily");

try {
  const pairs = await rpc("bus_route_pairs");
  for (const p of pairs) {
    const from = slug(p.from_city);
    const to = slug(p.to_city);
    if (from && to) add(`/bus/${from}/${to}`, "0.8", "daily");
  }
  console.log(`routes: ${pairs.length}`);

  const companies = await rpc("bus_companies_public");
  for (const c of companies) {
    if (c.slug) add(`/autocar/${c.slug}`, "0.7", "weekly");
  }
  console.log(`companies: ${companies.length}`);
} catch (e) {
  // A sitemap missing its dynamic half is still a valid sitemap. Failing the
  // whole file would replace real URLs with nothing.
  console.error("Could not read the published routes:", e.message);
  process.exitCode = 1;
}

const today = new Date().toISOString().slice(0, 10);
const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [...urls.entries()]
    .map(
      ([path, m]) =>
        `  <url>\n` +
        `    <loc>${SITE}${path}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${m.changefreq}</changefreq>\n` +
        `    <priority>${m.priority}</priority>\n` +
        `  </url>`,
    )
    .join("\n") +
  `\n</urlset>\n`;

writeFileSync(resolve(root, "public/sitemap.xml"), xml);
console.log(`public/sitemap.xml — ${urls.size} URLs`);
