// src/app/(main)/main-quest/page.tsx
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import type { StageNumber } from "@/lib/quest/types";
import { getUnlockedCharacters } from "@/lib/quest/battle-logic";

const MainQuestClient = dynamic(
  () => import("./main-quest-client").then((m) => m.MainQuestClient),
  {
    loading: () => (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-48 bg-muted rounded" />
        <div className="h-64 bg-muted rounded pixel-border" />
      </div>
    ),
  }
);

export default async function MainQuestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user!.id;

  const { data: questProgress } = await supabase
    .from("quest_progress")
    .select("*")
    .eq("user_id", userId)
    .order("stage", { ascending: true });

  const clearedStages = (questProgress ?? [])
    .filter((p: { is_cleared: boolean }) => p.is_cleared)
    .map((p: { stage: number }) => p.stage as StageNumber);

  const unlockedCharacters = getUnlockedCharacters(clearedStages);

  return (
    <MainQuestClient
      questProgress={questProgress ?? []}
      unlockedCharacters={unlockedCharacters}
    />
  );
}
