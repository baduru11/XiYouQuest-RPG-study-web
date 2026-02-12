import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import type { ExpressionName } from "@/types/character";
import { getCharacterImageFallback } from "@/lib/character-images";

const QuizSession = dynamic(() => import("./quiz-session").then(m => m.QuizSession), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4 animate-pulse">
      <div className="h-24 w-24 mx-auto rounded-full bg-muted" />
      <div className="h-16 w-full rounded bg-muted" />
      <div className="h-10 w-32 mx-auto rounded bg-muted" />
    </div>
  ),
});
import type { QuizQuestion } from "@/types/practice";

// Default quiz questions covering all 3 sub-types
const FALLBACK_QUESTIONS: QuizQuestion[] = [
  // Word Choice
  { id: "1", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["工作", "返工"], correctIndex: 0, explanation: "'工作' is standard Putonghua. '返工' is Cantonese." },
  { id: "2", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["现在", "而家"], correctIndex: 0, explanation: "'现在' is standard. '而家' is Cantonese for 'now'." },
  { id: "3", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["不要", "唔好"], correctIndex: 0, explanation: "'不要' is standard. '唔好' is Cantonese." },
  { id: "4", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["聊天", "吹水"], correctIndex: 0, explanation: "'聊天' is standard. '吹水' is Cantonese slang." },
  { id: "5", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["下雨", "落雨"], correctIndex: 0, explanation: "'下雨' is standard. '落雨' is dialectal." },
  { id: "6", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["便宜", "平"], correctIndex: 0, explanation: "'便宜' is standard. '平' meaning cheap is Cantonese." },
  { id: "7", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["空调", "冷气"], correctIndex: 0, explanation: "'空调' is the standard term. '冷气' is used in Cantonese regions." },
  // Measure Words
  { id: "8", type: "measure-word", prompt: "一___桌子", options: ["张", "个", "把", "条"], correctIndex: 0, explanation: "桌子 uses 张 as its measure word." },
  { id: "9", type: "measure-word", prompt: "一___书", options: ["本", "张", "个", "片"], correctIndex: 0, explanation: "书 uses 本 as its measure word." },
  { id: "10", type: "measure-word", prompt: "一___狗", options: ["只", "条", "个", "头"], correctIndex: 0, explanation: "狗 commonly uses 只 as its measure word." },
  { id: "11", type: "measure-word", prompt: "一___车", options: ["辆", "台", "个", "部"], correctIndex: 0, explanation: "车 uses 辆 as its measure word." },
  { id: "12", type: "measure-word", prompt: "一___信", options: ["封", "张", "本", "份"], correctIndex: 0, explanation: "信 uses 封 as its measure word." },
  { id: "13", type: "measure-word", prompt: "一___刀", options: ["把", "条", "支", "根"], correctIndex: 0, explanation: "刀 uses 把 as its measure word." },
  { id: "14", type: "measure-word", prompt: "一___花", options: ["朵", "束", "根", "棵"], correctIndex: 0, explanation: "花 uses 朵 as its measure word for a single flower." },
  // Sentence Order
  { id: "15", type: "sentence-order", prompt: "Which sentence is correct?", options: ["我把书放在桌子上。", "我放在桌子上把书。"], correctIndex: 0, explanation: "The 把 structure requires: Subject + 把 + Object + Verb + Complement." },
  { id: "16", type: "sentence-order", prompt: "Which sentence is correct?", options: ["因为下雨，所以我没去。", "虽然下雨，所以我没去。"], correctIndex: 0, explanation: "'因为...所以...' is the correct paired conjunction. '虽然' pairs with '但是'." },
  { id: "17", type: "sentence-order", prompt: "Which sentence is correct?", options: ["虽然很累，但是我还得工作。", "虽然很累，所以我还得工作。"], correctIndex: 0, explanation: "'虽然...但是...' is the correct concessive conjunction pair." },
  { id: "18", type: "sentence-order", prompt: "Which sentence is correct?", options: ["我从来没见过他。", "我没从来见过他。"], correctIndex: 0, explanation: "'从来' should come before '没' in the negative pattern." },
  { id: "19", type: "sentence-order", prompt: "Which sentence is correct?", options: ["你先别着急。", "你别先着急。"], correctIndex: 0, explanation: "'先' modifies '别着急' as a whole — 'first, don't worry'." },
  { id: "20", type: "sentence-order", prompt: "Which sentence is correct?", options: ["这本书我看过两遍。", "这本书我两遍看过。"], correctIndex: 0, explanation: "The frequency complement '两遍' goes after the verb '看过'." },
];

export default async function Component3Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch selected character with expressions
  const { data: userCharacter } = await supabase
    .from("user_characters")
    .select(`
      *,
      characters (
        *,
        character_expressions (*)
      )
    `)
    .eq("user_id", user!.id)
    .eq("is_selected", true)
    .single();

  // Build character data for the quiz session
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
    expressions: getCharacterImageFallback(characterName, expressions),
  };

  // Use fallback questions (DB may not have quiz-formatted data yet)
  const questions = FALLBACK_QUESTIONS;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Component 3: Vocabulary &amp; Grammar Judgment
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">选择判断</span> — Choose the correct or more standard Putonghua vocabulary and grammar.
        </p>
      </div>

      <QuizSession questions={questions} character={character} characterId={characterData?.id} component={3} />
    </div>
  );
}
