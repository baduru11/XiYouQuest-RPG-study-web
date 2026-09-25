// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Vercel removes every path in .vercelignore before it builds, for CLI and Git
// deployments alike. `next build` type-checks every file under src, tests
// included, so an import that reaches into an ignored directory passes locally
// and fails the build on Vercel (the preview build of 2026-09-24 failed on
// `supabase/functions/_shared` this way).

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts"]);
const RELATIVE_IMPORT = /(?:from|import|require)\s*\(?\s*["']((?:\.\.\/)+[^"']+)["']/g;

function ignoreLines(): string[] {
  return readFileSync(join(ROOT, ".vercelignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Root-anchored directory entries, without the leading slash. */
function ignoredRootDirectories(): Set<string> {
  return new Set(
    ignoreLines()
      .filter((line) => line.startsWith("/") && !line.includes("*"))
      .map((line) => line.slice(1).replace(/\/$/, "")),
  );
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if ([...SOURCE_EXTENSIONS].some((ext) => entry.endsWith(ext))) {
      out.push(path);
    }
  }
  return out;
}

describe(".vercelignore", () => {
  it("keeps every directory that src imports, so the Vercel build can type-check", () => {
    const ignored = ignoredRootDirectories();
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(RELATIVE_IMPORT)) {
        const target = relative(ROOT, resolve(dirname(file), match[1]));
        const topLevel = target.split(sep)[0];
        if (ignored.has(topLevel)) {
          offenders.push(`${relative(ROOT, file)} -> ${target}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still keeps environment files and private material out of the upload", () => {
    const lines = ignoreLines();
    for (const required of [".env*", "!.env.example", "/docs", "/.claude", "*.pem"]) {
      expect(lines).toContain(required);
    }
  });
});
