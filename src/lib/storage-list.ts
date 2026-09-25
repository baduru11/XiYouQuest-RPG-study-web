import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * storage-js `list()` returns at most 100 entries per call, so a single call
 * silently truncates a larger folder. Page through with this size.
 */
export const STORAGE_PAGE_SIZE = 100;

// 10,000 entries per folder: far beyond real use, and a stop if a storage
// backend ever ignored the offset and repeated the same page forever.
const MAX_PAGES = 100;

export interface StorageEntry {
  name: string;
}

/** Every entry directly under `path` in `bucket`; throws on a listing error. */
export async function listAllEntries(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, { limit: STORAGE_PAGE_SIZE, offset: page * STORAGE_PAGE_SIZE });
    if (error) throw error;
    if (!data || data.length === 0) break;
    entries.push(...data);
    if (data.length < STORAGE_PAGE_SIZE) break;
  }
  return entries;
}

/** Removes the given object paths, a page at a time; throws on a removal error. */
export async function removePaths(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  for (let start = 0; start < paths.length; start += STORAGE_PAGE_SIZE) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(paths.slice(start, start + STORAGE_PAGE_SIZE));
    if (error) throw error;
  }
}
