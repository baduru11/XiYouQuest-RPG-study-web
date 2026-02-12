import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import type { ExpressionName } from "@/types/character";
import { getCharacterImageFallback } from "@/lib/character-images";

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
  const [{ data: userCharacter }, { data: dbQuestions }] = await Promise.all([
    supabase
      .from("user_characters")
      .select(`
        *,
        characters (
          *,
          character_expressions (*)
        )
      `)
      .eq("user_id", userId)
      .eq("is_selected", true)
      .single(),
    supabase
      .from("question_banks")
      .select("content")
      .eq("component", 1)
      .limit(100),
  ]);

  // Build character data for the practice session
  const characterData = userCharacter?.characters;
  const expressions: Record<string, string> = {};

  if (characterData?.character_expressions) {
    for (const expr of characterData.character_expressions as Array<{
      expression_name: ExpressionName;
      image_url: string;
    }>) {
      expressions[expr.expression_name] = expr.image_url;
    }
  }

  const characterName = characterData?.name ?? "Study Buddy";
  const character = {
    name: characterName,
    personalityPrompt: characterData?.personality_prompt ?? "You are a friendly and encouraging study companion.",
    voiceId: characterData?.voice_id ?? "",
    expressions: getCharacterImageFallback(characterName, expressions),
  };

  const questions: string[] =
    dbQuestions && dbQuestions.length > 0
      ? dbQuestions.map((q: { content: string }) => q.content)
      : DEFAULT_CHARACTERS;

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

      <PracticeSession questions={questions} character={character} characterId={characterData?.id} component={1} />
    </div>
  );
}
