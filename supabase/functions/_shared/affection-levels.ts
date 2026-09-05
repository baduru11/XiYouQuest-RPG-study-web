/**
 * Deno port of AFFECTION_LEVELS from src/types/gamification.ts.
 *
 * Single source for the Edge runtime: edge functions cannot import from src/,
 * so this table is duplicated by necessity. Every Deno consumer must import it
 * from here rather than re-declaring its own copy — a hand-written copy in
 * _shared/player-memory.ts had drifted to six invented labels ("Stranger",
 * "Companion", "Kindred Spirit"), so the companion LLM was told the wrong
 * relationship level on every turn.
 *
 * Parity with the canonical table is guarded by
 * src/lib/gamification/affection-levels.edge.test.ts.
 */
export const AFFECTION_LEVELS: Record<
  number,
  { name: string; xpRequired: number }
> = {
  1: { name: "Acquaintance", xpRequired: 0 },
  2: { name: "Friend", xpRequired: 200 },
  3: { name: "Close Friend", xpRequired: 500 },
  4: { name: "Best Friend", xpRequired: 1000 },
  5: { name: "Soulmate", xpRequired: 2000 },
};

export function getAffectionLevel(
  affectionXP: number,
): { level: number; name: string } {
  let currentLevel = 1;
  let currentName = AFFECTION_LEVELS[1].name;

  for (const [level, config] of Object.entries(AFFECTION_LEVELS)) {
    if (affectionXP >= config.xpRequired) {
      currentLevel = Number(level);
      currentName = config.name;
    }
  }

  return { level: currentLevel, name: currentName };
}
