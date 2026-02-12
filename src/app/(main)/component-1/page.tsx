import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { loadSelectedCharacter } from "@/lib/character-loader";
import { shuffle } from "@/lib/utils";

const PracticeSession = dynamic(() => import("./practice-session").then(m => m.PracticeSession), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4 animate-pulse">
      <div className="h-24 w-24 mx-auto rounded-full bg-muted" />
      <div className="h-16 w-full rounded bg-muted" />
      <div className="h-10 w-32 mx-auto rounded bg-muted" />
    </div>
  ),
});

// Default monosyllabic characters for Component 1 if no DB questions available
const DEFAULT_CHARACTERS = [
  "八", "把", "百", "办", "半", "包", "北", "本", "比", "边",
  "表", "别", "不", "才", "菜", "草", "茶", "长", "常", "场",
  "车", "城", "吃", "出", "穿", "船", "春", "词", "次", "从",
  "村", "大", "带", "到", "的", "等", "地", "点", "电", "东",
  "动", "都", "读", "短", "对", "多", "二", "发", "法", "饭",
];

export default async function Component1Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  // Fetch character and questions in parallel
  const [character, { data: dbQuestions }] = await Promise.all([
    loadSelectedCharacter(supabase, userId),
    supabase
      .from("question_banks")
      .select("content")
      .eq("component", 1)
      .limit(50),
  ]);

  const questions: string[] = shuffle(
    dbQuestions && dbQuestions.length > 0
      ? dbQuestions.map((q: { content: string }) => q.content)
      : DEFAULT_CHARACTERS
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Component 1: Monosyllabic Characters
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">读单音节字词</span> — Read monosyllabic characters with correct pronunciation and tones.
        </p>
      </div>

      <PracticeSession questions={questions} character={character} characterId={character.id} component={1} />
    </div>
  );
}
