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

// Default multisyllabic words for Component 2 if no DB questions available
const DEFAULT_WORDS = [
  "国王", "今日", "虐待", "花瓶儿", "难怪", "产品", "掉头", "遭受",
  "露馅儿", "人群", "压力", "材料", "窘迫", "亏损", "翱翔", "永远",
  "一辈子", "佛典", "沙尘", "存在", "请求", "累赘", "发愣", "外面",
  "酒盅儿", "似乎", "怎么", "赔偿", "勘察", "妨碍",
];

export default async function Component2Page() {
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
      .eq("component", 2)
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
      : DEFAULT_WORDS;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Component 2: Multisyllabic Words
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">读多音节词语</span> — Read multisyllabic words with correct pronunciation, tones, and natural flow.
        </p>
      </div>

      <PracticeSession questions={questions} character={character} characterId={characterData?.id} component={2} />
    </div>
  );
}
