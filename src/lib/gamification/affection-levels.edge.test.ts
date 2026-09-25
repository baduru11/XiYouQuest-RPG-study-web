import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AFFECTION_LEVELS } from "@/types/gamification";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const EDGE_PATH = resolve(REPO_ROOT, "supabase/functions/_shared/affection-levels.ts");
const EDGE_CONSUMERS = [
  "supabase/functions/_shared/player-memory.ts",
  "supabase/functions/chat-respond/index.ts",
];

/**
 * AFFECTION_LEVELS is duplicated into the Deno Edge runtime, which cannot import
 * from src/. The Edge copy is extracted from source rather than imported: its
 * `.ts`-extension imports need allowImportingTsExtensions and the module graph
 * reaches Deno globals, both of which break `tsc --noEmit`.
 *
 * Anchored to the canonical table, not to a second copy: a copy-to-copy
 * comparison passes when both sides are wrong. The Edge copy previously carried
 * six invented labels while the canonical table had five, so the companion LLM
 * was told the wrong relationship level on every turn.
 */
function extractEdgeLevels(): Record<number, { name: string; xpRequired: number }> {
  const source = readFileSync(EDGE_PATH, "utf8");
  const block = source.match(/AFFECTION_LEVELS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    throw new Error(`AFFECTION_LEVELS map not found in ${EDGE_PATH}`);
  }
  const entries = [
    ...block[1].matchAll(
      /(\d+)\s*:\s*\{\s*name:\s*"((?:[^"\\]|\\.)*)"\s*,\s*xpRequired:\s*(\d+)\s*\}/g,
    ),
  ];
  return Object.fromEntries(
    entries.map((m) => [Number(m[1]), { name: m[2], xpRequired: Number(m[3]) }]),
  );
}

describe("Edge affection level contract", () => {
  const edgeLevels = extractEdgeLevels();

  it("matches the canonical AFFECTION_LEVELS table exactly", () => {
    // Guards the extractor too: an empty match would fail this rather than
    // letting a vacuous comparison pass.
    expect(Object.keys(edgeLevels)).toHaveLength(Object.keys(AFFECTION_LEVELS).length);
    expect(edgeLevels).toEqual(AFFECTION_LEVELS);
  });

  it("leaves no Edge consumer declaring its own affection table", () => {
    for (const consumer of EDGE_CONSUMERS) {
      const source = readFileSync(resolve(REPO_ROOT, consumer), "utf8");
      // Path form differs by location: files inside _shared/ import "./…".
      expect(source).toMatch(/from\s+"\.[./]*(?:_shared\/)?affection-levels\.ts"/);
      expect(source).not.toMatch(/(?:const|let)\s+AFFECTION_LEVEL/);
    }
  });
});
