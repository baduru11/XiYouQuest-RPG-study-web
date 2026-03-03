import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const PracticeHistoryClient = dynamic(
  () =>
    import("./practice-history-client").then((m) => m.PracticeHistoryClient),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="pixel-border p-4 animate-shimmer h-24" />
          ))}
        </div>
        <div className="pixel-border p-6 animate-shimmer h-64" />
        <div className="pixel-border p-6 animate-shimmer h-48" />
      </div>
    ),
  },
);

export default async function PracticeHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user!.id;

  const [sessionsResult, progressResult, questProgressResult] =
    await Promise.all([
      supabase
        .from("practice_sessions")
        .select(
          "id, component, score, xp_earned, duration_seconds, created_at, characters(name)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("user_progress").select("*").eq("user_id", userId),
      supabase
        .from("quest_progress")
        .select("stage, is_cleared, attempts, best_score, cleared_at")
        .eq("user_id", userId)
        .order("stage", { ascending: true }),
    ]);

  const sessions = sessionsResult.data ?? [];
  const progress = progressResult.data ?? [];
  const questProgress = questProgressResult.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Practice History
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">练习记录</span> — View your sessions,
          score trends, and AI-powered insights.
        </p>
      </div>

      <PracticeHistoryClient
        sessions={sessions}
        progress={progress}
        questProgress={questProgress}
      />
    </div>
  );
}
