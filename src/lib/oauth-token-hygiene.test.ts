import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EMPTY_PROVIDER_TOKENS, withoutProviderTokens } from "@/lib/oauth-token-hygiene";

describe("withoutProviderTokens", () => {
  it("drops every provider token and its expiry while keeping the account identity", () => {
    const stored = withoutProviderTokens({
      id: "acc-1",
      userId: "user-1",
      providerId: "hkust",
      accountId: "entra-sub",
      accessToken: "access",
      refreshToken: "refresh",
      idToken: "eyJ.header.payload",
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    });
    expect(stored).toMatchObject({
      id: "acc-1",
      userId: "user-1",
      providerId: "hkust",
      accountId: "entra-sub",
      ...EMPTY_PROVIDER_TOKENS,
    });
  });

  it("also blanks tokens on partial updates that carry no token fields", () => {
    expect(withoutProviderTokens({ updatedAt: "now" })).toEqual({
      updatedAt: "now",
      ...EMPTY_PROVIDER_TOKENS,
    });
  });
});

describe("auth.ts wiring", () => {
  const source = readFileSync("src/lib/auth.ts", "utf8");

  it("strips tokens on both account create and account update", () => {
    const hooks = source.slice(source.indexOf("databaseHooks: {"));
    expect(hooks).toMatch(
      /account:\s*\{[\s\S]*?create:\s*\{\s*before:[^}]*withoutProviderTokens[\s\S]*?update:\s*\{\s*before:[^}]*withoutProviderTokens/,
    );
  });

  it("never uses the UPN (an email address) as a display name", () => {
    expect(source).not.toMatch(/claims\.preferred_username as string\) \?\?\s*"Learner"/);
    expect(source).not.toContain('user.email.split("@")[0]');
  });
});
