// @vitest-environment node
//
// Server-level proof of the scan sign-in switch: the auth config is loaded
// twice, once as production (flag unset) and once as the scan sandbox.
// Requests that would need a database are only checked for how far they get.

import { afterEach, describe, expect, it, vi } from "vitest";

const BASE = "http://localhost:3000";

async function loadAuth(flag: string | undefined) {
  vi.resetModules();
  if (flag === undefined) delete process.env.SCAN_PASSWORD_SIGN_IN;
  else process.env.SCAN_PASSWORD_SIGN_IN = flag;
  process.env.BETTER_AUTH_URL = BASE;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
  return (await import("./auth")).auth;
}

function post(path: string, body: unknown): Request {
  return new Request(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(body),
  });
}

const CREDS = { email: "scan@ust.hk", password: "hunter2hunter2" };

describe("scan sign-in switch (server)", () => {
  afterEach(() => {
    delete process.env.SCAN_PASSWORD_SIGN_IN;
  });

  it("production (flag unset): password sign-in is not available", async () => {
    const auth = await loadAuth(undefined);
    expect(auth.options.emailAndPassword?.enabled).toBe(false);
    const res = await auth.handler(post("/sign-in/email", CREDS));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMAIL_PASSWORD_DISABLED");
  });

  it("scan sandbox: sign-up is refused", async () => {
    const auth = await loadAuth("1");
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    const res = await auth.handler(post("/sign-up/email", { name: "X", ...CREDS }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  });

  it("scan sandbox: password sign-in is accepted for processing", async () => {
    const auth = await loadAuth("1");
    // No database here, so the lookup itself fails; what matters is that the
    // endpoint is live (not the 'not enabled' refusal production returns).
    const res = await auth.handler(post("/sign-in/email", CREDS));
    expect(res.status).not.toBe(400);
  });
});
