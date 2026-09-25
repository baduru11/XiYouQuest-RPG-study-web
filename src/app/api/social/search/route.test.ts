import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; args: unknown[] }> = [];

// A query builder: every filter method records its call and returns the
// builder; awaiting it yields an empty result.
function builder(): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "or", "ilike", "limit", "not"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
  return query;
}

// The client itself must not be thenable, or `await createClient()` unwraps it.
function chain(): Record<string, unknown> {
  return {
    from: (...args: unknown[]) => {
      calls.push({ method: "from", args });
      return builder();
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => chain()),
  getSessionUser: vi.fn(async () => ({ id: "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c", email: "a@ust.hk" })),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

import { GET } from "./route";

async function search(q: string) {
  calls.length = 0;
  const res = await GET(new NextRequest(`https://cle-xyq.hkust.edu.hk/api/social/search?q=${encodeURIComponent(q)}`));
  const pattern = calls.find((c) => c.method === "ilike")?.args[1];
  return { status: res.status, pattern };
}

describe("GET /api/social/search wildcard handling", () => {
  it("removes PostgREST's * wildcard so '**' cannot match every name", async () => {
    const { status } = await search("**");
    expect(status).toBe(400);
  });

  it("strips * inside a longer query", async () => {
    const { status, pattern } = await search("a*n*");
    expect(status).toBe(200);
    expect(pattern).toBe("%an%");
  });

  it("still escapes the standard LIKE metacharacters", async () => {
    const { pattern } = await search("50%_x");
    expect(pattern).toBe("%50\\%\\_x%");
  });
});
