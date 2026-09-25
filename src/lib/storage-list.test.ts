import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { STORAGE_PAGE_SIZE, listAllEntries, removePaths } from "@/lib/storage-list";

// A storage fake that behaves like storage-js list(): one page per call,
// sliced by the limit and offset it is given.
function fakeStorage(names: string[], listError: unknown = null) {
  const list = vi.fn(async (_path: string, options?: { limit?: number; offset?: number }) => {
    if (listError) return { data: null, error: listError };
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    return { data: names.slice(offset, offset + limit).map((name) => ({ name })), error: null };
  });
  const remove = vi.fn(async (paths: string[]) => ({ data: paths, error: null }));
  const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
  return { client, list, remove };
}

const names = (count: number) => Array.from({ length: count }, (_, i) => `item-${i}`);

describe("listAllEntries", () => {
  it("returns every entry past the 100-per-call page limit", async () => {
    const { client, list } = fakeStorage(names(250));
    const entries = await listAllEntries(client, "chat-images", "user-1");
    expect(entries.map((entry) => entry.name)).toEqual(names(250));
    expect(list).toHaveBeenCalledTimes(3);
  });

  it("stops after one call for a folder smaller than a page", async () => {
    const { client, list } = fakeStorage(names(3));
    expect(await listAllEntries(client, "avatars", "user-1")).toHaveLength(3);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("asks for an exact page size, so a full last page is followed by one empty call", async () => {
    const { client, list } = fakeStorage(names(STORAGE_PAGE_SIZE));
    expect(await listAllEntries(client, "avatars", "user-1")).toHaveLength(STORAGE_PAGE_SIZE);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("raises a listing error instead of returning a partial list", async () => {
    const { client } = fakeStorage(names(5), new Error("storage unavailable"));
    await expect(listAllEntries(client, "avatars", "user-1")).rejects.toThrow("storage unavailable");
  });
});

describe("removePaths", () => {
  it("removes in batches no larger than a page", async () => {
    const { client, remove } = fakeStorage([]);
    await removePaths(client, "chat-images", names(250));
    expect(remove).toHaveBeenCalledTimes(3);
    const batches = remove.mock.calls.map(([paths]) => paths as string[]);
    expect(batches.every((batch) => batch.length <= STORAGE_PAGE_SIZE)).toBe(true);
    expect(batches.flat()).toEqual(names(250));
  });

  it("makes no call when there is nothing to remove", async () => {
    const { client, remove } = fakeStorage([]);
    await removePaths(client, "chat-images", []);
    expect(remove).not.toHaveBeenCalled();
  });
});
