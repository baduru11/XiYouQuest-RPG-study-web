// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 90_000, testTimeout: 90_000 });

const read = (name: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");

const ALICE = "00000000-0000-4000-8000-00000000000a";
const DELETED = "00000000-0000-4000-8000-0000000000de";
const CAROL = "00000000-0000-4000-8000-00000000000c";

describe.sequential("rate-limit global purge migration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    await db.exec(read("20260924100000_rate_limit_counters.sql"));
    await db.exec(read("20260925100000_rate_limit_global_purge.sql"));
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM public.rate_limit_counters");
  });

  async function consume(userId: string): Promise<void> {
    await db.exec("SET ROLE service_role");
    try {
      await db.query(
        "SELECT public.consume_rate_limit($1::uuid, 'write', ARRAY[3600], ARRAY[100])",
        [userId],
      );
    } finally {
      await db.exec("RESET ROLE");
    }
  }

  async function seed(userId: string, windowSeconds: number, startedAgo: string, count = 1) {
    await db.query(
      `INSERT INTO public.rate_limit_counters (user_id, bucket, window_seconds, window_start, hits)
       SELECT $1::uuid, 'b' || g, $2, now() - $3::interval, 1 FROM generate_series(1, $4) AS g`,
      [userId, windowSeconds, startedAgo, count],
    );
  }

  const rowsFor = async (userId: string) =>
    (await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.rate_limit_counters WHERE user_id = $1::uuid",
      [userId],
    )).rows[0].n;

  it("removes another user's long-expired windows, such as rows left after an account deletion", async () => {
    await seed(DELETED, 3600, "10 days");
    await consume(ALICE);
    expect(await rowsFor(DELETED)).toBe(0);
    expect(await rowsFor(ALICE)).toBe(1);
  });

  it("keeps windows that are still running or ended less than a day ago", async () => {
    await seed(CAROL, 3600, "30 minutes");
    await seed(CAROL, 86400, "30 hours");
    await consume(ALICE);
    expect(await rowsFor(CAROL)).toBe(2);
  });

  it("keeps a window longer than a day until it has really ended", async () => {
    await seed(CAROL, 7 * 86400, "3 days");
    await consume(ALICE);
    expect(await rowsFor(CAROL)).toBe(1);
  });

  it("removes at most 100 foreign rows per call", async () => {
    await seed(DELETED, 3600, "10 days", 150);
    await consume(ALICE);
    expect(await rowsFor(DELETED)).toBe(50);
    await consume(ALICE);
    expect(await rowsFor(DELETED)).toBe(0);
  });

  it("still counts hits and reports the retry time when a window is exceeded", async () => {
    await db.exec("SET ROLE service_role");
    try {
      const results: number[] = [];
      for (let i = 0; i < 3; i++) {
        const { rows } = await db.query<{ retry: number }>(
          "SELECT public.consume_rate_limit($1::uuid, 'tight', ARRAY[3600], ARRAY[2]) AS retry",
          [ALICE],
        );
        results.push(rows[0].retry);
      }
      expect(results[0]).toBe(0);
      expect(results[1]).toBe(0);
      expect(results[2]).toBeGreaterThan(0);
    } finally {
      await db.exec("RESET ROLE");
    }
  });

  it("keeps the function server-only", async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
      SELECT has_function_privilege('anon', 'public.consume_rate_limit(uuid, text, integer[], integer[])', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.consume_rate_limit(uuid, text, integer[], integer[])', 'EXECUTE') AS authenticated,
             has_function_privilege('service_role', 'public.consume_rate_limit(uuid, text, integer[], integer[])', 'EXECUTE') AS service
    `);
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
});
