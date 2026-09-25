import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { COOKIE_ATTRIBUTES, SESSION_POLICY } from "@/lib/session-policy";

describe("session policy", () => {
  it("expires an idle session within a working day", () => {
    expect(SESSION_POLICY.expiresIn).toBeLessThanOrEqual(8 * 60 * 60);
    expect(SESSION_POLICY.updateAge).toBeLessThan(SESSION_POLICY.expiresIn);
  });

  it("keeps cookies HttpOnly and SameSite=Lax", () => {
    expect(COOKIE_ATTRIBUTES).toEqual({ httpOnly: true, sameSite: "lax" });
  });

  it("is wired into the Better Auth config", () => {
    const source = readFileSync("src/lib/auth.ts", "utf8");
    expect(source).toMatch(/\bsession: SESSION_POLICY\b/);
    expect(source).toMatch(/defaultCookieAttributes: COOKIE_ATTRIBUTES/);
  });
});
