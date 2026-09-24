// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 90_000, testTimeout: 90_000 });

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260925090000_security_events.sql"),
  "utf8",
);

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

describe.sequential("security_events migration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    await db.exec(migration);
  });

  afterAll(async () => {
    await db.close();
  });

  async function asRole<T>(role: string, sql: string): Promise<T[]> {
    await db.exec(`SET ROLE ${role}`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("RESET ROLE");
    }
  }

  it("lets service_role record an event through the function", async () => {
    await asRole("service_role", `
      SELECT public.log_security_event('auth.sign_in', '${ALICE}', '203.0.113.7', 'Mozilla/5.0', '{"method":"hkust"}')
    `);
    const rows = await db.query<{ event_type: string; ip: string }>(
      "SELECT event_type, host(ip_address) AS ip FROM public.security_events",
    );
    expect(rows.rows).toEqual([{ event_type: "auth.sign_in", ip: "203.0.113.7" }]);
  });

  it.each(["SELECT * FROM public.security_events", "DELETE FROM public.security_events",
    "UPDATE public.security_events SET event_type = 'auth.sign_in'",
    `INSERT INTO public.security_events (event_type) VALUES ('auth.sign_in')`])(
    "refuses service_role direct table access: %s",
    async (sql) => {
      await expect(asRole("service_role", sql)).rejects.toThrow(/permission denied/);
    },
  );

  it.each(["anon", "authenticated"])("refuses %s the logging function", async (role) => {
    await expect(
      asRole(role, `SELECT public.log_security_event('auth.sign_in')`),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects an unknown event type", async () => {
    await expect(
      asRole("service_role", `SELECT public.log_security_event('made.up')`),
    ).rejects.toThrow(/check constraint/);
  });

  it("stores a malformed IP as NULL instead of losing the event", async () => {
    await asRole("service_role", `SELECT public.log_security_event('account.export', '${BOB}', 'not-an-ip')`);
    const rows = await db.query<{ ip_address: string | null }>(
      `SELECT ip_address FROM public.security_events WHERE user_id = '${BOB}'`,
    );
    expect(rows.rows).toEqual([{ ip_address: null }]);
  });

  it("returns only the requested user's events for export", async () => {
    const rows = await asRole<{ event_type: string }>(
      "service_role",
      `SELECT event_type FROM public.security_events_for_user('${ALICE}')`,
    );
    expect(rows).toEqual([{ event_type: "auth.sign_in" }]);
  });

  it("purges entries older than 180 days on the next insert", async () => {
    await db.exec(`
      INSERT INTO public.security_events (occurred_at, event_type, user_id)
      VALUES (now() - interval '181 days', 'auth.sign_in', '${ALICE}'),
             (now() - interval '179 days', 'auth.sign_in', '${ALICE}')
    `);
    await asRole("service_role", `SELECT public.log_security_event('rate_limit.exceeded', '${ALICE}')`);
    const ages = await db.query<{ old: number; recent: number }>(`
      SELECT count(*) FILTER (WHERE occurred_at < now() - interval '180 days')::int AS old,
             count(*) FILTER (WHERE occurred_at < now() - interval '178 days')::int AS recent
      FROM public.security_events
    `);
    expect(ages.rows[0]).toEqual({ old: 0, recent: 1 });
  });
});
