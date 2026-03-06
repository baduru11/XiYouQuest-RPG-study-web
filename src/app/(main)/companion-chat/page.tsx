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
    { data: recentSessions },
    { data: scenarioBackgrounds },
  ] = await Promise.all([
    supabase.from("characters").select("*").order("unlock_stage", { ascending: true, nullsFirst: true }),
    supabase.from("user_characters").select("character_id, affection_xp, affection_level").eq("user_id", userId),
    supabase.from("chat_scenarios").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("chat_sessions")
      .select("*, characters(name, voice_id, image_url), chat_scenarios(title, category)")
      .eq("user_id", userId)
      .order("ended_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("scenario_backgrounds").select("scenario_id, character_id, background_url"),
  ]);

  // Enrich characters with unlock status and images
  const unlockedIds = new Set((userCharacters ?? []).map((uc) => uc.character_id));

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

  // Build background lookup: "scenarioId:characterId" → url
  const backgroundMap: Record<string, string> = {};
  for (const bg of scenarioBackgrounds ?? []) {
    backgroundMap[`${bg.scenario_id}:${bg.character_id}`] = bg.background_url;
  }

  return (
    <CompanionChatClient
      characters={enrichedCharacters}
      scenarios={scenarios ?? []}
      backgroundMap={backgroundMap}
      recentSessions={(recentSessions ?? []).map((s) => ({
        id: s.id,
        characterName: (s.characters as { name: string; voice_id: string; image_url: string | null } | null)?.name ?? "Unknown",
        characterId: s.character_id,
        characterVoiceId: (s.characters as { name: string; voice_id: string; image_url: string | null } | null)?.voice_id ?? "",
        characterImage: (s.characters as { name: string; voice_id: string; image_url: string | null } | null)?.image_url ?? null,
        scenarioTitle: (s.chat_scenarios as { title: string; category: string } | null)?.title ?? "Unknown",
        scenarioId: s.scenario_id,
        scenarioCategory: (s.chat_scenarios as { title: string; category: string } | null)?.category ?? "jttw",
        messageCount: s.message_count,
        avgScore: s.avg_score,
        xpEarned: s.xp_earned,
        createdAt: s.created_at,
        endedAt: s.ended_at,
      }))}
    />
  );
}
