import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import { loadSelectedCharacter } from "@/lib/character-loader";
import { shuffle } from "@/lib/utils";
import type { QuizQuestion } from "@/types/practice";

const ExamRunner = dynamic(() => import("./exam-runner").then(m => m.ExamRunner), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4 animate-pulse">
      <div className="h-24 w-24 mx-auto rounded-full bg-muted" />
      <div className="h-6 w-64 mx-auto rounded bg-muted" />
      <div className="h-10 w-40 mx-auto rounded bg-muted" />
    </div>
  ),
});

// Fallbacks if DB has no questions (100 monosyllabic characters for C1)
const FALLBACK_CHARACTERS = [
  "八", "把", "百", "办", "半", "包", "北", "本", "比", "边",
  "表", "别", "不", "才", "菜", "草", "茶", "长", "常", "场",
  "车", "城", "吃", "出", "穿", "船", "春", "词", "次", "从",
  "村", "大", "带", "到", "的", "等", "地", "点", "电", "东",
  "动", "都", "读", "短", "对", "多", "二", "发", "法", "饭",
  "方", "房", "放", "飞", "分", "风", "服", "父", "该", "高",
  "告", "哥", "歌", "给", "跟", "更", "工", "公", "共", "狗",
  "古", "故", "刮", "关", "光", "广", "国", "果", "过", "还",
  "孩", "海", "寒", "好", "喝", "和", "河", "黑", "很", "红",
  "后", "花", "话", "画", "坏", "欢", "换", "黄", "回", "会",
];
// Fallbacks if DB has no questions (50 multisyllabic words for C2)
const FALLBACK_WORDS = [
  "国王", "今日", "虐待", "花瓶儿", "难怪", "产品", "掉头", "遭受",
  "露馅儿", "人群", "压力", "材料", "窘迫", "亏损", "翱翔", "永远",
  "一辈子", "佛典", "沙尘", "存在", "请求", "累赘", "发愣", "外面",
  "酒盅儿", "似乎", "怎么", "赔偿", "勘察", "妨碍", "安排", "保护",
  "标准", "表演", "参加", "成功", "诚实", "传统", "打算", "代表",
  "道理", "发展", "丰富", "改变", "感觉", "工程", "贡献", "管理",
  "规律", "合作",
];

export default async function MockExamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  // Fetch character and all component questions in parallel
  const [character, { data: c1Questions }, { data: c2Questions }, { data: c3Questions }, { data: c4Passages }, { data: c5Topics }] = await Promise.all([
    loadSelectedCharacter(supabase, userId),
    supabase
      .from("question_banks")
      .select("content")
      .eq("component", 1)
      .limit(100),
    supabase
      .from("question_banks")
      .select("content")
      .eq("component", 2)
      .limit(100),
    supabase
      .from("question_banks")
      .select("id, content, metadata")
      .eq("component", 3)
      .limit(500),
    supabase
      .from("question_banks")
      .select("id, content, metadata")
      .eq("component", 4)
      .limit(50),
    supabase
      .from("question_banks")
      .select("content")
      .eq("component", 5)
      .limit(150),
  ]);

  const examCharacters: string[] = shuffle(c1Questions?.length ? c1Questions.map(q => q.content) : FALLBACK_CHARACTERS);
  const examWords: string[] = shuffle(c2Questions?.length ? c2Questions.map(q => q.content) : FALLBACK_WORDS);

  // C3: Parse quiz questions — pick 10 word-choice + 10 measure-word + 5 sentence-order
  let examQuizQuestions: QuizQuestion[] | undefined;
  if (c3Questions && c3Questions.length > 0) {
    const allParsed = c3Questions
      .filter((row: { metadata: unknown }) => row.metadata && typeof row.metadata === "object")
      .map((row: { id: string; content: string; metadata: { type: string; options: string[]; correctIndex: number; explanation: string } }) => ({
        id: row.id,
        type: row.metadata.type as QuizQuestion["type"],
        prompt: row.content,
        options: row.metadata.options,
        correctIndex: row.metadata.correctIndex,
        explanation: row.metadata.explanation,
      }));
    const wc = shuffle(allParsed.filter(q => q.type === "word-choice")).slice(0, 10);
    const mw = shuffle(allParsed.filter(q => q.type === "measure-word")).slice(0, 10);
    const so = shuffle(allParsed.filter(q => q.type === "sentence-order")).slice(0, 5);
    examQuizQuestions = [...wc, ...mw, ...so];
  }

  // C4: Pick one random passage
  let examPassage: { id: string; title: string; content: string } | undefined;
  if (c4Passages && c4Passages.length > 0) {
    const picked = shuffle(c4Passages)[0] as { id: string; content: string; metadata: { title: string } };
    examPassage = { id: picked.id, title: picked.metadata.title ?? "Untitled", content: picked.content };
  }

  // C5: Pick random topics
  let examTopics: string[] | undefined;
  if (c5Topics && c5Topics.length > 0) {
    examTopics = shuffle(c5Topics.map((q: { content: string }) => q.content)).slice(0, 10);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">Mock PSC Exam</h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">模拟考试</span> — Complete all 5 components to get your estimated PSC grade.
        </p>
      </div>

      <ExamRunner
        character={{ ...character, id: character.id ?? "" }}
        characters={examCharacters}
        words={examWords}
        quizQuestions={examQuizQuestions}
        passage={examPassage}
        topics={examTopics}
      />
    </div>
  );
}
