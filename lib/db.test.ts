// Runs the real migration in PGlite (Postgres compiled to WASM) and checks the budget guard and grants
// as Supabase's roles. Not covered: concurrent callers (PGlite has one connection; the advisory lock does that job).
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";

const db = new PGlite();
const as = async <T>(role: string, sql: string, params: unknown[] = []) => {
  await db.exec(`set role ${role}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const reserve = (cost: number, cap: number) =>
  as<{ total: string | null }>("service_role", "select public.reserve_spend('test', $1, $2) as total", [cost, cap]);

before(async () => {
  // Same role attributes as Supabase: only service_role bypasses RLS.
  await db.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;");
  // Mimic older Supabase projects that still grant everything by default: the migration must revoke it.
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated;");
  await db.exec(readFileSync("supabase/migrations/20261029000000_init.sql", "utf8"));
});

test("reserve_spend records spend under the cap and refuses past it", async () => {
  assert.equal(Number((await reserve(40, 75))[0].total), 40);
  assert.equal(Number((await reserve(30, 75))[0].total), 70);
  assert.equal((await reserve(6, 75))[0].total, null); // 76 > 75: refused
  assert.equal((await reserve(25, 60))[0].total, null); // SAM's lower cap
  assert.equal(Number((await reserve(5, 75))[0].total), 75); // exactly at the cap is allowed
  const [{ n, sum }] = await as<{ n: number; sum: string }>("service_role", "select count(*)::int n, sum(cost_usd) sum from public.usage_ledger");
  assert.equal(n, 3); // refused calls left no rows
  assert.equal(Number(sum), 75);
});

test("anon and authenticated can't read tables or call the budget function", async () => {
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(as(role, "select * from public.usage_ledger"), /permission denied/);
    await assert.rejects(as(role, "select * from public.signs"), /permission denied/);
    await assert.rejects(as(role, "select public.reserve_spend('x', 1, 75)"), /permission denied/);
  }
});

test("the budget function runs with the caller's rights, not elevated ones", async () => {
  const [{ definer }] = await as<{ definer: boolean }>("postgres", "select prosecdef as definer from pg_proc where proname = 'reserve_spend'");
  assert.equal(definer, false);
});

test("negative costs are rejected", async () => {
  await assert.rejects(reserve(-1, 75), /check constraint/);
});
