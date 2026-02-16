import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { loadSelectedCharacter } from "@/lib/character-loader";
import { shuffle } from "@/lib/utils";
import { C6_GROUPS_PER_CATEGORY, C6_WORDS_PER_GROUP } from "@/lib/constants";

const PracticeSession = dynamic(() => import("./practice-session").then(m => m.PracticeSession), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4 animate-pulse">
      <div className="h-24 w-24 mx-auto rounded-full bg-muted" />
      <div className="h-16 w-full rounded bg-muted" />
      <div className="h-10 w-32 mx-auto rounded bg-muted" />
    </div>
  ),
});

// Fallback words per category
const FALLBACK_WORDS: Record<string, string[]> = {
  zhcs: ["杂志", "竹子", "自习", "知识", "早餐", "长城", "从此", "城市", "三十", "山水"],
  nng: ["北京", "上海", "天津", "重庆", "长城", "长江", "黄河", "黄山", "心情", "心静"],
  ln: ["奶奶", "来来", "牛奶", "流利", "那里", "哪里", "男女", "褴褛", "蓝绿", "南岭"],
};

const CATEGORY_LABELS: Record<string, string> = {
  zhcs: "平翘舌音 — z/c/s vs zh/ch/sh",
  nng: "前后鼻音 — n vs ng",
  ln: "边鼻音 — l vs n",
};

const CATEGORY_ORDER = ["zhcs", "nng", "ln"] as const;

export default async function Component6Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const wordsPerCategory = C6_GROUPS_PER_CATEGORY * C6_WORDS_PER_GROUP;

  const [character, { data: dbQuestions }] = await Promise.all([
    loadSelectedCharacter(supabase, user!.id),
    supabase
      .from("question_banks")
      .select("content, metadata")
      .eq("component", 6)
      .limit(200),
  ]);

  // Group by category, shuffle, and take subset
  const categoryWords: Record<string, string[]> = { zhcs: [], nng: [], ln: [] };

  if (dbQuestions && dbQuestions.length > 0) {
    for (const q of dbQuestions) {
      const cat = (q.metadata as { category?: string })?.category;
      if (cat && cat in categoryWords) {
        categoryWords[cat].push(q.content);
      }
    }
  }

  // Build sequential word list: zhcs words, then nng words, then ln words
  // Each category shuffled independently, take wordsPerCategory from each
  const questions: string[] = [];
  const categoryBoundaries: Array<{ label: string; startIndex: number }> = [];

  for (const cat of CATEGORY_ORDER) {
    const pool = categoryWords[cat].length > 0 ? categoryWords[cat] : FALLBACK_WORDS[cat];
    const selected = shuffle([...pool]).slice(0, wordsPerCategory);
    categoryBoundaries.push({
      label: CATEGORY_LABELS[cat],
      startIndex: questions.length,
    });
    questions.push(...selected);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Component 6: Cantonese Mistakes
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">易错字词练习</span> — Practice high-frequency trouble sounds for Cantonese speakers.
        </p>
      </div>

      <PracticeSession
        questions={questions}
        character={character}
        characterId={character.id}
        component={6}
        categoryBoundaries={categoryBoundaries}
      />
    </div>
  );
}
