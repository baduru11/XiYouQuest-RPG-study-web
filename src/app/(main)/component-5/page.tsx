import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { loadSelectedCharacter } from "@/lib/character-loader";
import { shuffle } from "@/lib/utils";

const SpeakingSession = dynamic(() => import("./speaking-session").then(m => m.SpeakingSession), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="h-24 w-24 mx-auto rounded-full animate-shimmer" />
      <div className="h-16 w-full rounded animate-shimmer" />
      <div className="h-10 w-32 mx-auto rounded animate-shimmer" />
    </div>
  ),
});

// Default speaking topics for Component 5
const FALLBACK_TOPICS = [
  "我的家庭", "我的一位朋友", "我尊敬的人", "我最喜欢的季节",
  "我最喜欢的运动", "我的一次难忘旅行", "我的一次失败经历",
  "我学习普通话的体会", "我的一天", "我的家乡",
  "我现在住的城市", "我喜欢的美食", "我喜欢的电影",
  "我喜欢的一本书", "我的兴趣爱好", "我对时间管理的看法",
  "我对网络生活的看法", "我对环保的看法", "我理想的工作",
  "我最喜欢的节日",
];

export default async function Component5Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch selected character and topics in parallel
  const [character, { data: dbTopics }] = await Promise.all([
    loadSelectedCharacter(supabase, user!.id),
    supabase
      .from("question_banks")
      .select("content")
      .eq("component", 5)
      .limit(150),
  ]);

  // Use DB topics with shuffle, or fallback
  const topics: string[] = shuffle(
    dbTopics && dbTopics.length > 0
      ? dbTopics.map((q: { content: string }) => q.content)
      : FALLBACK_TOPICS
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Component 5: Prompted Speaking
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">命题说话</span> — Speak on a given topic for 3 minutes with natural fluency and structure.
        </p>
      </div>

      <SpeakingSession topics={topics} character={character} characterId={character.id} component={5} />
    </div>
  );
}
