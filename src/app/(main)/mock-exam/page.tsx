import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import type { ExpressionName } from "@/types/character";
import { getCharacterImageFallback } from "@/lib/character-images";

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

  // Fetch character, C1 characters, and C2 words in parallel
  const [{ data: userCharacter }, { data: c1Questions }, { data: c2Questions }] = await Promise.all([
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
    supabase
      .from("question_banks")
      .select("content")
      .eq("component", 2)
      .limit(100),
  ]);

  const examCharacters: string[] = c1Questions?.length ? c1Questions.map(q => q.content) : FALLBACK_CHARACTERS;
  const examWords: string[] = c2Questions?.length ? c2Questions.map(q => q.content) : FALLBACK_WORDS;

  // Build character data
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
    id: characterData?.id ?? "",
    name: characterName,
    personalityPrompt: characterData?.personality_prompt ?? "You are a friendly and encouraging study companion.",
    voiceId: characterData?.voice_id ?? "",
    expressions: getCharacterImageFallback(characterName, expressions),
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">Mock PSC Exam</h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">模拟考试</span> — Complete all 5 components to get your estimated PSC grade.
        </p>
      </div>

      <ExamRunner character={character} characters={examCharacters} words={examWords} />
    </div>
  );
}
