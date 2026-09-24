import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClient, getSessionUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient, getSessionUser }));

vi.mock("@/lib/achievements/check", () => ({
  checkAndUnlockAchievements: vi.fn().mockResolvedValue([]),
}));

// The authenticated caller for every case below. Every route in this file is
// exercised as this user attempting to reach a resource owned by SOMEONE
// ELSE, never the other way around.
const SESSION_USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "a@connect.ust.hk" };
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const RESOURCE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NODE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CHECKPOINT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

type QueryResult = { data: unknown; error: unknown; count?: number };
type RecordedCall = { method: string; args: unknown[] };

/**
 * A minimal stand-in for a Supabase PostgREST query builder: every filter
 * method records its call and returns itself (chainable), and the chain
 * resolves to a fixed result either via `.single()`/`.maybeSingle()` or by
 * being awaited directly (Supabase's builder is itself a thenable).
 */
function createQueryChain(
  result: QueryResult,
  onCall: (call: RecordedCall) => void,
) {
  const chain: Record<string, unknown> = {};
  const passthroughMethods = [
    "select",
    "eq",
    "neq",
    "or",
    "order",
    "limit",
    "in",
    "ilike",
    "not",
    "update",
    "insert",
    "delete",
  ];
  for (const method of passthroughMethods) {
    chain[method] = vi.fn((...args: unknown[]) => {
      onCall({ method, args });
      return chain;
    });
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

interface TableFixture {
  result: QueryResult;
  calls: RecordedCall[];
}

function createSupabaseStub(perTable: Record<string, TableFixture>) {
  return {
    from: vi.fn((table: string) => {
      const fixture = perTable[table];
      if (!fixture) {
        throw new Error(
          `Unexpected table access '${table}' — this ownership check should have short-circuited before reaching it`,
        );
      }
      return createQueryChain(fixture.result, (call) =>
        fixture.calls.push(call),
      );
    }),
  };
}

function fixture(result: QueryResult): TableFixture {
  return { result, calls: [] };
}

function eqArgs(fixtureEntry: TableFixture, column: string): unknown[] {
  return fixtureEntry.calls
    .filter((c) => c.method === "eq" && c.args[0] === column)
    .map((c) => c.args[1]);
}

beforeEach(() => {
  getSessionUser.mockReset().mockResolvedValue(SESSION_USER);
  createClient.mockReset();
});

describe("chat/history: session ownership", () => {
  it("returns 404 (not another user's session data) when the sessionId belongs to a different user", async () => {
    const chatSessions = fixture({ data: null, error: null });
    createClient.mockResolvedValue(createSupabaseStub({ chat_sessions: chatSessions }));

    const { GET } = await import("./chat/history/route");
    const response = await GET(
      new NextRequest(
        `https://test.example.com/api/chat/history?sessionId=${RESOURCE_ID}`,
      ),
    );

    expect(response.status).toBe(404);
    // The ownership filter is bound to the SESSION user, not any
    // client-supplied id — a cross-user id can only ever miss.
    expect(eqArgs(chatSessions, "user_id")).toEqual([SESSION_USER.id]);
    expect(eqArgs(chatSessions, "id")).toEqual([RESOURCE_ID]);
  });
});

describe("chat/delete: session ownership", () => {
  it("returns 404 and never issues a delete when the session is not owned by the caller", async () => {
    const chatSessions = fixture({ data: null, error: null });
    // "chat_messages" is deliberately NOT registered: if the route ever
    // reached the delete step for another user's session, the stub would
    // throw on that unexpected table access and fail this test.
    createClient.mockResolvedValue(createSupabaseStub({ chat_sessions: chatSessions }));

    const { POST } = await import("./chat/delete/route");
    const response = await POST(
      new NextRequest("https://test.example.com/api/chat/delete", {
        method: "POST",
        body: JSON.stringify({ sessionId: RESOURCE_ID }),
      }),
    );

    expect(response.status).toBe(404);
    expect(eqArgs(chatSessions, "user_id")).toEqual([SESSION_USER.id]);
  });
});

describe("chat/resume: session ownership", () => {
  it("returns 404 and never mutates or reads messages for a session owned by someone else", async () => {
    const chatSessions = fixture({ data: null, error: null });
    createClient.mockResolvedValue(createSupabaseStub({ chat_sessions: chatSessions }));

    const { POST } = await import("./chat/resume/route");
    const response = await POST(
      new NextRequest("https://test.example.com/api/chat/resume", {
        method: "POST",
        body: JSON.stringify({ sessionId: RESOURCE_ID }),
      }),
    );

    expect(response.status).toBe(404);
    expect(eqArgs(chatSessions, "user_id")).toEqual([SESSION_USER.id]);
  });
});

describe("learning/node/complete: plan ownership", () => {
  it("returns 403 when the node's plan belongs to a different user", async () => {
    const learningNodes = fixture({
      data: { id: NODE_ID, plan_id: PLAN_ID, phase: 1 },
      error: null,
    });
    const learningPlans = fixture({ data: { user_id: OTHER_USER_ID }, error: null });
    createClient.mockResolvedValue(
      createSupabaseStub({ learning_nodes: learningNodes, learning_plans: learningPlans }),
    );

    const { POST } = await import("./learning/node/complete/route");
    const response = await POST(
      new NextRequest("https://test.example.com/api/learning/node/complete", {
        method: "POST",
        body: JSON.stringify({ nodeId: NODE_ID, score: 80, xpEarned: 10 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(eqArgs(learningPlans, "id")).toEqual([PLAN_ID]);
  });
});

describe("learning/checkpoint/complete: plan ownership", () => {
  it("returns 403 before touching checkpoints or generating the next phase when the plan belongs to someone else", async () => {
    const learningPlans = fixture({ data: { user_id: OTHER_USER_ID }, error: null });
    // learning_checkpoints / learning_nodes intentionally unregistered: a
    // correct implementation never reaches them for another user's plan.
    createClient.mockResolvedValue(createSupabaseStub({ learning_plans: learningPlans }));

    const { POST } = await import("./learning/checkpoint/complete/route");
    const response = await POST(
      new NextRequest("https://test.example.com/api/learning/checkpoint/complete", {
        method: "POST",
        body: JSON.stringify({
          planId: PLAN_ID,
          checkpointNumber: 1,
          scores: { c1: 50, c2: 50, c3: 50, c4: 50, c5: 50 },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(eqArgs(learningPlans, "id")).toEqual([PLAN_ID]);
  });
});

describe("learning/report: plan and checkpoint ownership", () => {
  it("returns 403 for a planId report when the plan belongs to a different user", async () => {
    const learningPlans = fixture({ data: { id: PLAN_ID, user_id: OTHER_USER_ID }, error: null });
    createClient.mockResolvedValue(createSupabaseStub({ learning_plans: learningPlans }));

    const { GET } = await import("./learning/report/route");
    const response = await GET(
      new NextRequest(`https://test.example.com/api/learning/report?planId=${PLAN_ID}`),
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 for a checkpointId report when the joined plan belongs to a different user", async () => {
    const learningCheckpoints = fixture({
      data: {
        id: CHECKPOINT_ID,
        learning_plans: { user_id: OTHER_USER_ID },
      },
      error: null,
    });
    createClient.mockResolvedValue(
      createSupabaseStub({ learning_checkpoints: learningCheckpoints }),
    );

    const { GET } = await import("./learning/report/route");
    const response = await GET(
      new NextRequest(
        `https://test.example.com/api/learning/report?checkpointId=${CHECKPOINT_ID}`,
      ),
    );

    expect(response.status).toBe(403);
  });
});

describe("mock-exam/save PATCH: result ownership", () => {
  // This route does not fetch-then-compare ownership; it scopes the UPDATE
  // itself by the session user id, and the PATCH body has no field that can
  // name a different owner. A cross-user id can therefore only ever match
  // zero rows — this test proves the filter is bound to the session, not to
  // any attacker-controlled value.
  it("scopes the update to the session user id regardless of which result id is targeted", async () => {
    const mockExamResults = fixture({ data: null, error: null });
    createClient.mockResolvedValue(createSupabaseStub({ mock_exam_results: mockExamResults }));

    const { PATCH } = await import("./mock-exam/save/route");
    const response = await PATCH(
      new NextRequest("https://test.example.com/api/mock-exam/save", {
        method: "PATCH",
        body: JSON.stringify({ id: RESOURCE_ID, aiFeedback: "feedback" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(eqArgs(mockExamResults, "id")).toEqual([RESOURCE_ID]);
    expect(eqArgs(mockExamResults, "user_id")).toEqual([SESSION_USER.id]);
  });
});

describe("social/remove: friendship ownership", () => {
  it("returns 404 and derives the ownership filter from the session, never from client input, when the friendship does not involve the caller", async () => {
    const friendships = fixture({ data: null, error: null, count: 0 });
    createClient.mockResolvedValue(createSupabaseStub({ friendships }));

    const { DELETE } = await import("./social/remove/route");
    const response = await DELETE(
      new NextRequest(`https://test.example.com/api/social/remove?id=${RESOURCE_ID}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
    const orCall = friendships.calls.find((c) => c.method === "or");
    expect(orCall?.args[0]).toBe(
      `requester_id.eq.${SESSION_USER.id},addressee_id.eq.${SESSION_USER.id}`,
    );
  });
});

describe("social/respond: friend request ownership", () => {
  it("returns 404 when the caller is not the addressee of the pending request", async () => {
    const friendships = fixture({ data: null, error: null });
    createClient.mockResolvedValue(createSupabaseStub({ friendships }));

    const { POST } = await import("./social/respond/route");
    const response = await POST(
      new NextRequest("https://test.example.com/api/social/respond", {
        method: "POST",
        body: JSON.stringify({ friendship_id: RESOURCE_ID, action: "accept" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(eqArgs(friendships, "addressee_id")).toEqual([SESSION_USER.id]);
  });
});
