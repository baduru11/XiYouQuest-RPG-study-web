import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import type { ExpressionName } from "@/types/character";
import { getCharacterImageFallback } from "@/lib/character-images";

const ReadingSession = dynamic(() => import("./reading-session").then(m => m.ReadingSession), {
  loading: () => (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="h-24 w-24 mx-auto rounded-full animate-shimmer" />
      <div className="h-16 w-full rounded animate-shimmer" />
      <div className="h-10 w-32 mx-auto rounded animate-shimmer" />
    </div>
  ),
});

interface Passage {
  id: string;
  title: string;
  content: string;
}

// Default passages for Component 4 if no DB data available
const FALLBACK_PASSAGES: Passage[] = [
  {
    id: "1",
    title: "一段不赶的路",
    content: "我以前总以为，做事越快越好。后来我才明白，真正难的不是速度，而是把每一步走稳。那年我第一次独自出门旅行，行李不多，却把自己弄得很狼狈：票没看清，站台跑错，到了车门口儿才发现身份证差点儿掉在口袋外面。那一刻我很慌，心跳得厉害，脑子里全是\u201C来不及\u201D三个字。后来我深呼吸，停下来，把事情一件一件理顺：先确认车次，再找工作人员，再把包里每样东西摸一遍。结果不但赶上了车，心里反而更踏实。现在我遇到麻烦，常提醒自己：别急，先把顺序摆正；不怕慢，就怕乱。",
  },
  {
    id: "2",
    title: "把话说清楚",
    content: "说话这件事，看似简单，其实很讲究。很多误会不是因为事情复杂，而是因为表达不清楚：该说的没说到点儿上，不该说的又说得太满。后来我学会了一个办法：先把结论说出来，再补充理由，最后给出建议。这样做的好处是，对方能马上抓住重点，不会在细枝末节里绕来绕去。尤其在工作里，时间宝贵，语言越清晰，效率越高。把话说清楚，是对别人负责，也是对自己负责。",
  },
];

export default async function Component4Page() {
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

  // Build character data for the reading session
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

  // Use fallback passages (DB likely won't have component 4 data yet)
  const passages = FALLBACK_PASSAGES;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Component 4: Passage Reading
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">朗读短文</span> — Read a passage aloud with correct pronunciation, pacing, and fluency.
        </p>
      </div>

      <ReadingSession passages={passages} character={character} characterId={characterData?.id} component={4} />
    </div>
  );
}
