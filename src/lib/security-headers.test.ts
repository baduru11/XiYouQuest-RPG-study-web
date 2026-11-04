import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security headers", () => {
  it("isolates every page from cross-origin openers", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/(.*)");
    expect(all?.headers).toContainEqual({ key: "Cross-Origin-Opener-Policy", value: "same-origin" });
  });
});
