import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { loadSelectedCharacter } from "@/lib/character-loader";
import { shuffle } from "@/lib/utils";
import { QUIZ_SIZES } from "@/lib/constants";
import type { QuizQuestion } from "@/types/practice";

const QuizSession = dynamic(() => import("./quiz-session").then(m => m.QuizSession), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4 animate-pulse">
      <div className="h-24 w-24 mx-auto rounded-full bg-muted" />
      <div className="h-16 w-full rounded bg-muted" />
      <div className="h-10 w-32 mx-auto rounded bg-muted" />
    </div>
  ),
});

// Default quiz questions covering all 3 sub-types
const FALLBACK_QUESTIONS: QuizQuestion[] = [
  { id: "1", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["工作", "返工"], correctIndex: 0, explanation: "'工作' is standard Putonghua. '返工' is Cantonese." },
  { id: "2", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["现在", "而家"], correctIndex: 0, explanation: "'现在' is standard. '而家' is Cantonese for 'now'." },
  { id: "3", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["不要", "唔好"], correctIndex: 0, explanation: "'不要' is standard. '唔好' is Cantonese." },
  { id: "4", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["聊天", "吹水"], correctIndex: 0, explanation: "'聊天' is standard. '吹水' is Cantonese slang." },
  { id: "5", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["下雨", "落雨"], correctIndex: 0, explanation: "'下雨' is standard. '落雨' is dialectal." },
  { id: "6", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["便宜", "平"], correctIndex: 0, explanation: "'便宜' is standard. '平' meaning cheap is Cantonese." },
  { id: "7", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["空调", "冷气"], correctIndex: 0, explanation: "'空调' is the standard term. '冷气' is used in Cantonese regions." },
  { id: "8", type: "measure-word", prompt: "一___桌子", options: ["张", "个", "把", "条"], correctIndex: 0, explanation: "桌子 uses 张 as its measure word." },
  { id: "9", type: "measure-word", prompt: "一___书", options: ["本", "张", "个", "片"], correctIndex: 0, explanation: "书 uses 本 as its measure word." },
  { id: "10", type: "measure-word", prompt: "一___狗", options: ["只", "条", "个", "头"], correctIndex: 0, explanation: "狗 commonly uses 只 as its measure word." },
  { id: "11", type: "measure-word", prompt: "一___车", options: ["辆", "台", "个", "部"], correctIndex: 0, explanation: "车 uses 辆 as its measure word." },
  { id: "12", type: "measure-word", prompt: "一___信", options: ["封", "张", "本", "份"], correctIndex: 0, explanation: "信 uses 封 as its measure word." },
  { id: "13", type: "measure-word", prompt: "一___刀", options: ["把", "条", "支", "根"], correctIndex: 0, explanation: "刀 uses 把 as its measure word." },
  { id: "14", type: "measure-word", prompt: "一___花", options: ["朵", "束", "根", "棵"], correctIndex: 0, explanation: "花 uses 朵 as its measure word for a single flower." },
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

  // Fetch selected character and quiz questions in parallel
  const [character, { data: dbQuestions }] = await Promise.all([
    loadSelectedCharacter(supabase, user!.id),
    supabase
      .from("question_banks")
      .select("id, content, metadata")
      .eq("component", 3)
      .limit(500),
  ]);

  // Parse DB questions into QuizQuestion format, or use fallback
  let questions: QuizQuestion[];
  if (dbQuestions && dbQuestions.length > 0) {
    // Parse all questions (skip rows with missing metadata)
    const allParsed = dbQuestions
      .filter((row: { metadata: unknown }) => row.metadata && typeof row.metadata === "object")
      .map((row: { id: string; content: string; metadata: { type: string; options: string[]; correctIndex: number; explanation: string } }) => ({
        id: row.id,
        type: row.metadata.type as QuizQuestion["type"],
        prompt: row.content,
        options: row.metadata.options,
        correctIndex: row.metadata.correctIndex,
        explanation: row.metadata.explanation,
      }));

    // Filter by type and take subsets for regular practice
    const wc = shuffle(allParsed.filter(q => q.type === "word-choice")).slice(0, QUIZ_SIZES.WORD_CHOICE);
    const mw = shuffle(allParsed.filter(q => q.type === "measure-word")).slice(0, QUIZ_SIZES.MEASURE_WORD);
    const so = shuffle(allParsed.filter(q => q.type === "sentence-order")).slice(0, QUIZ_SIZES.SENTENCE_ORDER);

    // Combine in type order (randomized within each type)
    questions = [...wc, ...mw, ...so];
  } else {
    questions = FALLBACK_QUESTIONS;
  }

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

      <QuizSession questions={questions} character={character} characterId={character.id} component={3} />
    </div>
  );
}
