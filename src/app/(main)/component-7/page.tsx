import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { loadSelectedCharacter } from "@/lib/character-loader";
import { shuffle } from "@/lib/utils";
import { QUIZ_SIZES } from "@/lib/constants";
import type { QuizQuestion } from "@/types/practice";

const QuizSession = dynamic(() => import("../component-3/quiz-session").then(m => m.QuizSession), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4 animate-pulse">
      <div className="h-24 w-24 mx-auto rounded-full bg-muted" />
      <div className="h-16 w-full rounded bg-muted" />
      <div className="h-10 w-32 mx-auto rounded bg-muted" />
    </div>
  ),
});

// Fallback polyphonic questions
const FALLBACK_QUESTIONS: QuizQuestion[] = [
  { id: "1", type: "polyphonic", prompt: "这根绳子太**长**了，需要剪掉一截。", options: ["cháng", "zhǎng"], correctIndex: 0, explanation: "表示长度，读 cháng。" },
  { id: "2", type: "polyphonic", prompt: "几年不见，这孩子**长**高了不少。", options: ["cháng", "zhǎng"], correctIndex: 1, explanation: "「长高」表示生长，读 zhǎng。" },
  { id: "3", type: "polyphonic", prompt: "你**行**动快一点，我们要迟到了。", options: ["xíng", "háng"], correctIndex: 0, explanation: "「行动」表示行为动作，读 xíng。" },
  { id: "4", type: "polyphonic", prompt: "我在银**行**办了点业务，耽误了一会儿。", options: ["xíng", "háng"], correctIndex: 1, explanation: "「银行」读 yín háng。" },
  { id: "5", type: "polyphonic", prompt: "这部电影很**好**看，推荐你也去瞧瞧。", options: ["hǎo", "hào"], correctIndex: 0, explanation: "「好看」表示好的程度，读 hǎo。" },
  { id: "6", type: "polyphonic", prompt: "他从小就**好**学，如今终于成了博士。", options: ["hǎo", "hào"], correctIndex: 1, explanation: "「好学」表示喜爱学习，读 hào。" },
  { id: "7", type: "polyphonic", prompt: "我**还**有一本书没看完，明天再还你。", options: ["hái", "huán"], correctIndex: 0, explanation: "「还有」表示仍然，读 hái。" },
  { id: "8", type: "polyphonic", prompt: "借了图书馆的书要记得按时**还**。", options: ["hái", "huán"], correctIndex: 1, explanation: "「还书」表示归还，读 huán。" },
  { id: "9", type: "polyphonic", prompt: "这个箱子很**重**，我一个人搬不动。", options: ["zhòng", "chóng"], correctIndex: 0, explanation: "表示重量大，读 zhòng。" },
  { id: "10", type: "polyphonic", prompt: "我没听清楚，请你**重**说一遍。", options: ["zhòng", "chóng"], correctIndex: 1, explanation: "「重说」表示再说一次，读 chóng。" },
  { id: "11", type: "polyphonic", prompt: "妈妈**教**我怎么做红烧肉。", options: ["jiào", "jiāo"], correctIndex: 1, explanation: "「教我」表示教授，读 jiāo。" },
  { id: "12", type: "polyphonic", prompt: "他**为**人正直，大家都愿意和他交朋友。", options: ["wéi", "wèi"], correctIndex: 0, explanation: "「为人」表示做人，读 wéi。" },
  { id: "13", type: "polyphonic", prompt: "这东西很**便**宜，才十块钱。", options: ["biàn", "pián"], correctIndex: 1, explanation: "「便宜」读 pián yi。" },
  { id: "14", type: "polyphonic", prompt: "他**背**着书包去上学。", options: ["bēi", "bèi"], correctIndex: 0, explanation: "「背着」表示用背部承载，读 bēi。" },
  { id: "15", type: "polyphonic", prompt: "衣服晾在外面，已经**干**了。", options: ["gān", "gàn"], correctIndex: 0, explanation: "「干了」表示干燥，读 gān。" },
];

export default async function Component7Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [character, { data: dbQuestions }] = await Promise.all([
    loadSelectedCharacter(supabase, user!.id),
    supabase
      .from("question_banks")
      .select("id, content, metadata")
      .eq("component", 7)
      .limit(100),
  ]);

  let questions: QuizQuestion[];
  if (dbQuestions && dbQuestions.length > 0) {
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

    questions = shuffle(allParsed).slice(0, QUIZ_SIZES.POLYPHONIC);
  } else {
    questions = FALLBACK_QUESTIONS;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Component 7: Polyphonic Characters
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">多音字练习</span> — Choose the correct pronunciation based on context.
        </p>
      </div>

      <QuizSession questions={questions} character={character} characterId={character.id} component={7} />
    </div>
  );
}
