import { defineConfig } from "vitest/config";

/**
 * Unit tests for the parts of PAPOT that are pure functions.
 *
 * Deliberately narrow. Most of this project's logic lives in Postgres —
 * pricing, inventory, refunds, permissions — and testing it from Node would
 * mean mocking the database, which proves that the mock agrees with itself.
 * Those rules are tested in `supabase/tests/bus_rules.sql`, which runs against
 * the real schema inside a transaction that rolls itself back.
 *
 * What is here is what Node can genuinely check: clock arithmetic, slugs, and
 * the PDF character sanitiser whose absence once broke every ticket.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
