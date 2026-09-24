import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { EXPORT_PAGE_SIZE, collectUserData } from "@/lib/data-export";

type Row = Record<string, unknown>;
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";

/** In-memory PostgREST double that honours eq / in / or and range paging. */
function fakeSupabase(tables: Record<string, Row[]>, rpcError = false) {
  const queries: Array<{ table: string; filters: string[] }> = [];
  const client = {
    from(table: string) {
      let rows = tables[table] ?? [];
      const filters: string[] = [];
      const query = {
        select: () => query,
        order: () => query,
        eq(column: string, value: unknown) {
          filters.push(`eq:${column}`);
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push(`in:${column}`);
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        or(expression: string) {
          filters.push(`or:${expression}`);
          rows = rows.filter((row) => row.requester_id === ME || row.addressee_id === ME);
          return query;
        },
        range(from: number, to: number) {
          queries.push({ table, filters: [...filters] });
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        maybeSingle() {
          queries.push({ table, filters: [...filters] });
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
      };
      return query;
    },
    rpc: async () => (rpcError ? { data: null, error: { message: "missing" } } : { data: [], error: null }),
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const mine = (n: number, extra: (i: number) => Row = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, user_id: ME, ...extra(i) }));
const theirs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, user_id: OTHER }));

describe("collectUserData", () => {
  it("pages past PostgREST's 1,000-row cap instead of truncating", async () => {
    const sessions = mine(3);
    const details = Array.from({ length: 2 * EXPORT_PAGE_SIZE + 345 }, (_, i) => ({
      id: `d${i}`,
      session_id: sessions[i % 3].id,
    }));
    const { client } = fakeSupabase({ practice_sessions: sessions, practice_details: details });
    const data = await collectUserData(client, ME);
    expect(data.practice.details).toHaveLength(2 * EXPORT_PAGE_SIZE + 345);
  });

  it("never returns another user's rows and scopes every query to the session user", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: ME, display_name: "Me" }, { id: OTHER, display_name: "Them" }],
      friendships: [
        { id: "f1", requester_id: ME, addressee_id: OTHER },
        { id: "f2", requester_id: OTHER, addressee_id: "someone-else" },
      ],
    };
    for (const table of ["user_progress", "practice_sessions", "mock_exam_results", "quest_progress",
      "user_achievements", "learning_plans", "chat_sessions"]) {
      tables[table] = [...mine(2), ...theirs(2)];
    }
    tables.user_characters = [...mine(1, () => ({ character_id: "c1" })), ...theirs(1)];
    tables.rate_limit_counters = [...mine(1, () => ({ bucket: "write" })), ...theirs(1)];
    const { client, queries } = fakeSupabase(tables);

    const data = await collectUserData(client, ME);
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain(`"user_id":"${OTHER}"`);
    expect(serialised).not.toContain("Them");
    expect(data.social.friendships).toEqual([tables.friendships[0]]);
    for (const { table, filters } of queries) {
      expect(filters.length, `${table} is filtered`).toBeGreaterThan(0);
    }
  });

  it("reports an unavailable security log instead of failing the export", async () => {
    const { client } = fakeSupabase({}, true);
    const data = await collectUserData(client, ME);
    expect(data.securityEvents).toEqual({ unavailable: expect.any(String) });
  });
});
