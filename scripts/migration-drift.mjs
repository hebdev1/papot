/**
 * One fingerprint instead of 151 files.
 *
 * AGENTS.md documents the SQL side of this check; this is the local half.
 * Migrations reach the database through the Supabase MCP server, which records
 * them in `supabase_migrations.schema_migrations` — so the repository and the
 * project can drift silently, and the drift is only noticed when someone tries
 * to build the schema from scratch.
 *
 * Run:  node scripts/migration-drift.mjs
 * then compare the two lines against:
 *
 *   select count(*), md5(string_agg(version || ':' ||
 *            md5(rtrim(replace(array_to_string(statements, E';\n\n') || ';',
 *                              E'\r\n', E'\n'))),
 *            ',' order by version))
 *     from supabase_migrations.schema_migrations;
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

const rows = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => {
    const version = f.slice(0, f.indexOf("_"));
    const body = readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n");
    // rtrim, matching Postgres rtrim() which strips trailing whitespace only.
    return { version, file: f, hash: md5(body.replace(/\s+$/, "")) };
  })
  .sort((a, b) => a.version.localeCompare(b.version));

if (process.argv[2]) {
  const hit = rows.filter((r) => r.version === process.argv[2]);
  for (const r of hit) console.log(`${r.version}  ${r.hash}  ${r.file}`);
  if (!hit.length) console.log(`no local file for version ${process.argv[2]}`);
  process.exit(0);
}

console.log(`count: ${rows.length}`);
console.log(`md5:   ${md5(rows.map((r) => `${r.version}:${r.hash}`).join(","))}`);
