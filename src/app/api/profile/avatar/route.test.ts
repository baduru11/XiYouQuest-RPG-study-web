// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, getSessionUser, enforceRateLimit, logSecurityEvent } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  logSecurityEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient, getSessionUser }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit }));
vi.mock("@/lib/security-events", () => ({ logSecurityEvent, requestContext: () => ({}) }));

import { POST } from "./route";

function fakeSupabase() {
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } }));
  const eq = vi.fn(async () => ({ error: null }));
  const client = {
    storage: { from: () => ({ upload, remove, getPublicUrl }) },
    from: () => ({ update: () => ({ eq }) }),
  };
  return { client, upload, remove };
}

function avatarRequest(bytes: Uint8Array, type: string) {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], "a", { type }));
  return new Request("https://app.test/api/profile/avatar", { method: "POST", body: form });
}

describe("POST /api/profile/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it("stores only re-encoded WebP bytes under a server-chosen .webp path", async () => {
    const { client, upload, remove } = fakeSupabase();
    createClient.mockResolvedValue(client);
    const png = new Uint8Array(
      await sharp({ create: { width: 900, height: 600, channels: 3, background: "#c33" } }).png().toBuffer(),
    );
    const input = new Uint8Array([...png, ...Buffer.from("TRAILING-PAYLOAD", "latin1")]);

    const response = await POST(avatarRequest(input, "image/png"));

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, stored, options] = upload.mock.calls[0] as unknown as [string, Uint8Array, { contentType: string }];
    expect(path).toBe("user-1/avatar.webp");
    expect(options.contentType).toBe("image/webp");
    expect(Buffer.from(stored).includes(Buffer.from("TRAILING-PAYLOAD"))).toBe(false);
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(512);
    // Older avatars under other extensions are cleaned up, never the new one.
    const removed = (remove.mock.calls[0] as unknown as [string[]])[0];
    expect(removed).not.toContain("user-1/avatar.webp");
    expect(removed).toContain("user-1/avatar.png");
    expect(enforceRateLimit).toHaveBeenCalledWith("user-1", "upload");
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "profile.avatar_upload", userId: "user-1" }),
    );
  });

  it("rejects a file with a valid magic header but an undecodable body without uploading", async () => {
    const { client, upload } = fakeSupabase();
    createClient.mockResolvedValue(client);
    const polyglot = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...Buffer.from("<?php echo 1; ?>", "latin1")]);

    const response = await POST(avatarRequest(polyglot, "image/png"));

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("still rejects a declared type that does not match the magic bytes", async () => {
    const { client, upload } = fakeSupabase();
    createClient.mockResolvedValue(client);
    const response = await POST(avatarRequest(new Uint8Array([1, 2, 3, 4, 5]), "image/png"));
    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
});
