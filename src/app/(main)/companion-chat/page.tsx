import { createClient } from "@/lib/supabase/server";
import { CHARACTER_IMAGES } from "@/lib/character-images";
import dynamic from "next/dynamic";

const CompanionChatClient = dynamic(() => import("./companion-chat-client"), {
  loading: () => <ChatSkeleton />,
});

function ChatSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 rounded animate-shimmer" />
      <div className="grid gap-4 grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-3">
            <div className="h-24 w-24 mx-auto rounded animate-shimmer" />
            <div className="h-4 w-20 mx-auto rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function CompanionChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;

  const [
    { data: characters },
    { data: userCharacters },
    { data: scenarios },
    { data: questProgress },
    { data: recentSessions },
  ] = await Promise.all([
    supabase.from("characters").select("*").order("unlock_stage", { ascending: true, nullsFirst: true }),
    supabase.from("user_characters").select("character_id, affection_xp, affection_level").eq("user_id", userId),
    supabase.from("chat_scenarios").select("*").order("sort_order", { ascending: true }),
    supabase.from("quest_progress").select("stage, is_cleared").eq("user_id", userId).eq("is_cleared", true),
    supabase
      .from("chat_sessions")
      .select("*, characters(name), chat_scenarios(title)")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Enrich characters with unlock status and images
  const unlockedIds = new Set((userCharacters ?? []).map((uc) => uc.character_id));
  const clearedStages = new Set((questProgress ?? []).map((qp) => qp.stage));

  const enrichedCharacters = (characters ?? []).map((char) => ({
    id: char.id,
    name: char.name,
    voiceId: char.voice_id,
    personalityPrompt: char.personality_prompt,
    image: char.image_url || CHARACTER_IMAGES[char.name] || null,
    isUnlocked: unlockedIds.has(char.id),
    unlockStage: char.unlock_stage,
    affectionXP: (userCharacters ?? []).find((uc) => uc.character_id === char.id)?.affection_xp ?? 0,
    affectionLevel: (userCharacters ?? []).find((uc) => uc.character_id === char.id)?.affection_level ?? 0,
  }));

  // Group scenarios by stage, only include cleared stages + stage 1
  const availableScenarios = (scenarios ?? []).filter(
    (s) => s.stage_number === 1 || clearedStages.has(s.stage_number)
  );

  return (
    <CompanionChatClient
      characters={enrichedCharacters}
      scenarios={availableScenarios}
      recentSessions={(recentSessions ?? []).map((s) => ({
        id: s.id,
        characterName: (s.characters as { name: string } | null)?.name ?? "Unknown",
        scenarioTitle: (s.chat_scenarios as { title: string } | null)?.title ?? "Unknown",
        messageCount: s.message_count,
        avgScore: s.avg_score,
        xpEarned: s.xp_earned,
        createdAt: s.created_at,
      }))}
    />
  );
}
