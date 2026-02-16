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

// Default quiz questions covering all 3 sub-types (matches new real question format)
const FALLBACK_QUESTIONS: QuizQuestion[] = [
  { id: "1", type: "word-choice", prompt: "选择普通话词语", options: ["鼻公", "鼻哥", "鼻子", "鼻"], correctIndex: 2, explanation: "「鼻子」是普通话标准说法。" },
  { id: "2", type: "word-choice", prompt: "选择普通话词语", options: ["为么子", "为什么", "做脉个", "为怎样"], correctIndex: 1, explanation: "「为什么」是普通话标准说法。" },
  { id: "3", type: "word-choice", prompt: "选择普通话词语", options: ["单车", "自行车", "脚踏车"], correctIndex: 1, explanation: "「自行车」是普通话标准说法。" },
  { id: "4", type: "word-choice", prompt: "选择普通话词语", options: ["厨房", "灶下", "灶披", "灶房"], correctIndex: 0, explanation: "「厨房」是普通话标准说法。" },
  { id: "5", type: "word-choice", prompt: "选择普通话词语", options: ["吹大炮", "车大炮", "吹牛"], correctIndex: 2, explanation: "「吹牛」是普通话标准说法。" },
  { id: "6", type: "measure-word", prompt: "一（　）钥匙", options: ["把", "根", "条", "个", "串"], correctIndex: 0, explanation: "钥匙用「把」作量词。" },
  { id: "7", type: "measure-word", prompt: "一（　）床", options: ["张", "架", "条", "铺", "个"], correctIndex: 0, explanation: "床用「张」作量词。" },
  { id: "8", type: "measure-word", prompt: "一（　）树", options: ["棵", "颗", "株", "根", "条"], correctIndex: 0, explanation: "树用「棵」作量词。" },
  { id: "9", type: "measure-word", prompt: "一（　）鱼", options: ["条", "尾", "只", "个", "头"], correctIndex: 0, explanation: "鱼用「条」作量词。" },
  { id: "10", type: "measure-word", prompt: "一（　）花", options: ["朵", "枝", "束", "盆", "棵"], correctIndex: 0, explanation: "花用「朵」作量词。" },
  { id: "11", type: "sentence-order", prompt: "选择正确的句子", options: ["我先走", "我走先", "我走头先"], correctIndex: 0, explanation: "「我先走」是普通话标准语序。" },
  { id: "12", type: "sentence-order", prompt: "选择正确的句子", options: ["给本书我", "把本书我", "给我一本书"], correctIndex: 2, explanation: "「给我一本书」是普通话标准语序。" },
  { id: "13", type: "sentence-order", prompt: "选择正确的句子", options: ["他比我高", "他高过我", "他比我过高"], correctIndex: 0, explanation: "「他比我高」是普通话标准比较句式。" },
  { id: "14", type: "sentence-order", prompt: "选择正确的句子", options: ["你吃饭头先", "你吃饭先", "你先吃饭"], correctIndex: 2, explanation: "「你先吃饭」是普通话标准语序。" },
  { id: "15", type: "sentence-order", prompt: "选择正确的句子", options: ["我买了西瓜两个", "我两个西瓜买了", "我买了两个西瓜"], correctIndex: 2, explanation: "「我买了两个西瓜」是普通话标准语序。" },
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
