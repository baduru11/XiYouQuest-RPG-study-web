import { afterEach, describe, expect, it, vi } from "vitest";

const { getSessionUser, createClient, deleteAuthUser } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  createClient: vi.fn(() => {
    throw new Error("data deletion reached");
  }),
  deleteAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getSessionUser, createClient }));
vi.mock("@/lib/auth", () => ({ deleteAuthUser }));
vi.mock("@/lib/security-events", () => ({
  logSecurityEvent: vi.fn(),
  requestContext: () => ({}),
}));
vi.mock("@/lib/storage-list", () => ({ listAllEntries: vi.fn(), removePaths: vi.fn() }));

import { DELETE } from "./route";

const request = () =>
  new Request("http://localhost/api/auth/delete-account", { method: "DELETE" });

describe("DELETE /api/auth/delete-account: ITSO scan account", () => {
  afterEach(() => {
    delete process.env.SCAN_PASSWORD_SIGN_IN;
    vi.clearAllMocks();
  });

  it("refuses to delete the scan account on the scan sandbox", async () => {
    process.env.SCAN_PASSWORD_SIGN_IN = "1";
    getSessionUser.mockResolvedValue({ id: "u1", email: "xyq-itso-scan@ust.hk" });
    const res = await DELETE(request());
    expect(res.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it("still deletes other accounts on the scan sandbox", async () => {
    process.env.SCAN_PASSWORD_SIGN_IN = "1";
    getSessionUser.mockResolvedValue({ id: "u2", email: "someone@ust.hk" });
    await DELETE(request()).catch(() => undefined);
    expect(createClient).toHaveBeenCalled();
  });

  it("does not protect the scan address in production", async () => {
    getSessionUser.mockResolvedValue({ id: "u1", email: "xyq-itso-scan@ust.hk" });
    await DELETE(request()).catch(() => undefined);
    expect(createClient).toHaveBeenCalled();
  });
});
