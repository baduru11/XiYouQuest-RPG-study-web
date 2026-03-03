import type { SupabaseClient } from "@supabase/supabase-js";
import { AFFECTION_LEVELS } from "@/types/gamification";

const COMPONENT_NAMES: Record<number, string> = {
  1: "C1 (Monosyllabic)",
  2: "C2 (Multisyllabic)",
  3: "C3 (Vocabulary & Grammar)",
  4: "C4 (Passage Reading)",
  5: "C5 (Prompted Speaking)",
  6: "C6 (Cantonese Mistakes)",
  7: "C7 (Polyphonic)",
};

/**
 * Build a player memory string for AI character context injection.
 * Queries recent sessions, per-component stats, and character relationship
 * in parallel, then formats into a readable summary.
 */
export async function buildPlayerMemory(
  supabase: SupabaseClient,
  userId: string,
  characterId: string,
): Promise<string> {
  const [sessionsResult, progressResult, relationshipResult] =
    await Promise.all([
      // Query 1: Recent sessions (last 10)
      supabase
        .from("practice_sessions")
        .select("component, score, xp_earned, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),

      // Query 2: Per-component stats
      supabase
        .from("user_progress")
        .select(
          "component, questions_attempted, questions_correct, best_streak, total_practice_time_seconds, last_practiced_at",
        )
        .eq("user_id", userId),

      // Query 3: Character relationship
      supabase
        .from("user_characters")
        .select("affection_xp, affection_level, characters(name)")
        .eq("user_id", userId)
        .eq("character_id", characterId)
        .single(),
    ]);

  const sessions = sessionsResult.data ?? [];
  const progress = progressResult.data ?? [];
  const relationship = relationshipResult.data;

  // If there's no data at all, return minimal memory
  if (sessions.length === 0 && progress.length === 0 && !relationship) {
    return "PLAYER MEMORY: New student — no practice history yet. Be welcoming and encouraging!";
  }

  const lines: string[] = [
    "PLAYER MEMORY (use this to personalize your response — reference specific details naturally):",
  ];

  // Relationship line
  if (relationship) {
    const level = relationship.affection_level ?? 0;
    const label = AFFECTION_LEVELS[level]?.name ?? "Stranger";
    const xp = relationship.affection_xp ?? 0;
    const charName =
      (relationship.characters as unknown as { name: string } | null)?.name ?? "companion";
    lines.push(
      `- Relationship with ${charName}: ${label} (affection level ${level}, ${xp} XP together)`,
    );
  }

  // Recent sessions summary
  if (sessions.length > 0) {
    const recent = sessions
      .slice(0, 5)
      .map((s) => {
        const name = COMPONENT_NAMES[s.component] ?? `C${s.component}`;
        return `${name} scored ${s.score}`;
      })
      .join(", ");
    lines.push(`- Recent sessions: ${recent}`);
  }

  // Per-component analysis
  if (progress.length > 0) {
    const withAccuracy = progress
      .filter((p) => p.questions_attempted > 0)
      .map((p) => ({
        ...p,
        accuracy: Math.round(
          (p.questions_correct / p.questions_attempted) * 100,
        ),
        name: COMPONENT_NAMES[p.component] ?? `C${p.component}`,
      }))
      .sort((a, b) => b.accuracy - a.accuracy);

    if (withAccuracy.length > 0) {
      // Strongest
      const strongest = withAccuracy
        .slice(0, 2)
        .map(
          (p) =>
            `${p.name} (${p.accuracy}% accuracy, ${p.questions_attempted} questions)`,
        )
        .join(", ");
      lines.push(`- Strongest: ${strongest}`);

      // Weakest
      const weakest = withAccuracy
        .slice(-2)
        .reverse()
        .filter((p) => p.accuracy < 80)
        .map(
          (p) =>
            `${p.name} (${p.accuracy}% accuracy, ${p.questions_attempted} questions attempted)`,
        )
        .join(", ");
      if (weakest) {
        lines.push(`- Weakest: ${weakest}`);
      }
    }

    // Score trends from recent sessions (group by component)
    if (sessions.length >= 3) {
      const byComponent = new Map<number, number[]>();
      for (const s of sessions) {
        const arr = byComponent.get(s.component) ?? [];
        arr.push(s.score);
        byComponent.set(s.component, arr);
      }
      const trends: string[] = [];
      for (const [comp, scores] of byComponent) {
        if (scores.length >= 2) {
          const name = COMPONENT_NAMES[comp] ?? `C${comp}`;
          const reversed = [...scores].reverse(); // oldest first
          const improving =
            reversed[reversed.length - 1] > reversed[0] ? "improving" : "declining";
          trends.push(
            `${name} ${improving} (${reversed.join("→")})`,
          );
        }
      }
      if (trends.length > 0) {
        lines.push(`- Trends: ${trends.join(", ")}`);
      }
    }

    // Total practice time & sessions
    const totalTimeSeconds = progress.reduce(
      (sum, p) => sum + (p.total_practice_time_seconds ?? 0),
      0,
    );
    const totalHours = (totalTimeSeconds / 3600).toFixed(1);
    lines.push(
      `- Practice time: ${totalHours} hours total, ${sessions.length} recent sessions`,
    );

    // Best streak
    const bestStreak = Math.max(...progress.map((p) => p.best_streak ?? 0));
    if (bestStreak > 0) {
      lines.push(`- Best streak: ${bestStreak} correct in a row`);
    }

    // Last practiced
    const lastPracticed = progress
      .filter((p) => p.last_practiced_at)
      .sort(
        (a, b) =>
          new Date(b.last_practiced_at).getTime() -
          new Date(a.last_practiced_at).getTime(),
      );
    if (lastPracticed.length > 0) {
      const last = lastPracticed[0];
      const name = COMPONENT_NAMES[last.component] ?? `C${last.component}`;
      const ago = getTimeAgo(new Date(last.last_practiced_at));
      lines.push(`- Last practiced: ${name}, ${ago}`);
    }
  }

  return lines.join("\n");
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} minutes ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} days ago`;
}
