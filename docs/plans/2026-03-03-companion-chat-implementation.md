# Companion Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an oral conversation feature where users chat with unlocked Journey to the West companions in preset scenarios, with pronunciation scoring, AI-generated background images, and full gamification.

**Architecture:** New route at `/companion-chat` with state-machine client component. 5 new API routes handle the conversation lifecycle (start, respond, generate-image, end, history). 3 new DB tables (chat_scenarios, chat_sessions, chat_messages) + Supabase Storage bucket for generated images. Reuses existing AudioRecorder, iFlytek ASR/ISE, TTS companion route, and OpenRouter/DeepSeek client.

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Supabase (PostgreSQL + Storage + RLS) / iFlytek ISE+ASR / DeepSeek v3.2 via OpenRouter / Gemini 3.1 Flash Image Preview via OpenRouter / Tailwind CSS 4 / shadcn/ui

---

### Task 1: Database Migration — Tables & RLS

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with project_id `yfoifmqjhavxidomgids`:

```sql
-- chat_scenarios: preset conversation scenarios per quest stage
CREATE TABLE chat_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number int NOT NULL CHECK (stage_number BETWEEN 1 AND 7),
  title text NOT NULL,
  description text NOT NULL,
  system_prompt text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

-- chat_sessions: one per conversation
CREATE TABLE chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id),
  scenario_id uuid NOT NULL REFERENCES chat_scenarios(id),
  message_count int NOT NULL DEFAULT 0,
  avg_score real,
  xp_earned int NOT NULL DEFAULT 0,
  affection_earned int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- chat_messages: individual messages within a session
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'companion')),
  content text NOT NULL,
  transcript text,
  pronunciation_score real,
  tone_score real,
  fluency_score real,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_scenarios_stage ON chat_scenarios(stage_number);

-- RLS
ALTER TABLE chat_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- chat_scenarios: everyone can read (public seed data)
CREATE POLICY "Anyone can read scenarios" ON chat_scenarios FOR SELECT USING (true);

-- chat_sessions: users can only access their own
CREATE POLICY "Users can read own sessions" ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);

-- chat_messages: users can access messages in their own sessions
CREATE POLICY "Users can read own messages" ON chat_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id AND chat_sessions.user_id = auth.uid()));
CREATE POLICY "Users can insert own messages" ON chat_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id AND chat_sessions.user_id = auth.uid()));
CREATE POLICY "Users can update own messages" ON chat_messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id AND chat_sessions.user_id = auth.uid()));
```

Migration name: `create_chat_tables`

**Step 2: Add TypeScript types**

Add to `src/types/database.ts` (after `UserAchievement` interface, before end of file):

```typescript
export interface ChatScenario {
  id: string;
  stage_number: number;
  title: string;
  description: string;
  system_prompt: string;
  sort_order: number;
}

export interface ChatSession {
  id: string;
  user_id: string;
  character_id: string;
  scenario_id: string;
  message_count: number;
  avg_score: number | null;
  xp_earned: number;
  affection_earned: number;
  created_at: string;
  ended_at: string | null;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'companion';
  content: string;
  transcript: string | null;
  pronunciation_score: number | null;
  tone_score: number | null;
  fluency_score: number | null;
  image_url: string | null;
  created_at: string;
}
```

**Step 3: Verify migration applied**

Run: `mcp__supabase__list_tables` with project_id `yfoifmqjhavxidomgids`, schemas `["public"]`

Expected: `chat_scenarios`, `chat_sessions`, `chat_messages` appear in table list.

**Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(chat): add database types for companion chat tables"
```

---

### Task 2: Seed Scenario Data

**Step 1: Seed chat_scenarios via SQL**

Use `mcp__supabase__execute_sql` with project_id `yfoifmqjhavxidomgids`:

```sql
INSERT INTO chat_scenarios (stage_number, title, description, system_prompt, sort_order) VALUES
-- Stage 1: Flower Fruit Mountain
(1, '水帘洞探秘', '和悟空一起发现花果山的秘密宝地', '你和旅伴正在花果山探险，发现了传说中的水帘洞。洞内有奇特的石壁画和古老的文字。你们正在讨论洞里发现的奇妙景象。', 1),
(1, '拜师学艺', '跟随菩提祖师学习本领', '你正在灵台方寸山上，向菩提祖师学习各种本领。今天要学习的是语言之道——如何说好普通话。师父正在考验你的发音。', 2),

-- Stage 2: Journey Begins
(2, '白马寺相遇', '在白马寺前偶遇取经团队', '你在白马寺前遇到了取经团队。他们正在准备出发去西天取经。你们正在讨论旅途中需要准备的物品和注意事项。', 3),
(2, '收服悟空', '三藏法师初遇孙悟空', '五行山下，三藏法师揭开如来的封印，孙悟空重获自由。他们正在互相了解，建立师徒关系。你作为旁观者参与对话。', 4),

-- Stage 3: Flowing Sand River
(3, '河畔对话', '在流沙河畔与沙悟净对话', '你来到流沙河边，河水汹涌。沙悟净刚刚加入取经队伍，他正在分享自己在天庭的故事和被贬下凡的经历。', 5),
(3, '渡河之策', '商量如何渡过流沙河', '流沙河挡住了去路，水中有危险的妖怪。你们需要想出渡河的办法。大家正在讨论各种方案——游泳、造船还是飞过去。', 6),

-- Stage 4: White Bone Spirit
(4, '识破妖怪', '一起识破白骨精的伪装', '白骨精变成了一个漂亮的村姑，端着饭菜走来。悟空的火眼金睛识破了她的伪装。你们正在讨论如何辨别妖怪。', 7),
(4, '师徒争执', '三藏和悟空因白骨精产生分歧', '三藏误以为悟空滥杀无辜，要赶走悟空。你夹在中间，需要调解师徒之间的矛盾。', 8),

-- Stage 5: Flaming Mountain
(5, '借芭蕉扇', '向铁扇公主借取芭蕉扇', '火焰山挡住了去路，必须借到铁扇公主的芭蕉扇才能灭火。你们正在铁扇公主的翠云山前，商量借扇的策略。', 9),
(5, '火焰山下', '在火焰山脚下休息和准备', '你们在火焰山脚下歇脚。周围热气逼人，但风景壮观。大家一边吃干粮一边聊天，讨论着取经路上的见闻。', 10),

-- Stage 6: Spider Cave
(6, '盘丝洞奇遇', '误入蜘蛛精的洞穴', '你们不小心走进了盘丝洞，发现这里布满了蛛丝。七个蜘蛛精正在洞中设宴。你们需要想办法脱身。', 11),
(6, '猪八戒的烦恼', '八戒倾诉思乡之情', '夜深了，猪八戒独自坐在月光下叹气。他想念高老庄的日子，想念翠兰。你坐在他旁边，听他倾诉。', 12),

-- Stage 7: Thunder Monastery
(7, '真假美猴王', '分辨真假悟空', '突然出现了一个和悟空一模一样的猴子！两个悟空都说自己是真的。你需要通过对话来分辨谁是真的谁是假的。', 13),
(7, '取经归来', '历经九九八十一难终取真经', '终于到达了雷音寺，如来佛祖正在殿上。取经团队经历了所有磨难，即将获得真经。你们在回忆这段旅程。', 14);
```

**Step 2: Verify seed data**

Run: `mcp__supabase__execute_sql` with query: `SELECT stage_number, title FROM chat_scenarios ORDER BY sort_order;`

Expected: 14 rows, 2 per stage.

---

### Task 3: Create Supabase Storage Bucket

**Step 1: Create the chat-images bucket**

Use `mcp__supabase__execute_sql` with project_id `yfoifmqjhavxidomgids`:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', true);
```

**Step 2: Add storage RLS policy for uploads**

```sql
CREATE POLICY "Authenticated users can upload chat images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-images');

CREATE POLICY "Anyone can view chat images"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-images');
```

Use `mcp__supabase__apply_migration` with name `create_chat_images_bucket`.

---

### Task 4: Zod Validation Schemas

**Files:**
- Modify: `src/lib/validations.ts`

**Step 1: Add chat validation schemas**

Add to end of `src/lib/validations.ts` (before the Helpers section at line 70):

```typescript
// --- Chat API Schemas ---

export const chatStartSchema = z.object({
  characterId: uuid,
  scenarioId: uuid,
});

export const chatEndSchema = z.object({
  sessionId: uuid,
});

export const chatGenerateImageSchema = z.object({
  sessionId: uuid,
  conversationSummary: z.string().min(1).max(2000),
});

export const chatHistoryQuerySchema = z.object({
  sessionId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
```

**Step 2: Commit**

```bash
git add src/lib/validations.ts
git commit -m "feat(chat): add Zod validation schemas for chat API"
```

---

### Task 5: OpenRouter Chat Client — Multi-Turn Conversation

**Files:**
- Modify: `src/lib/gemini/client.ts`

**Step 1: Add multi-turn chat function**

Add to end of `src/lib/gemini/client.ts`:

```typescript
// ---------- Multi-Turn Conversation (Companion Chat) ----------

export interface ChatTurnMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatConversation(
  messages: ChatTurnMessage[],
): Promise<string> {
  try {
    return await retryWithBackoff(async () => {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${body}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from OpenRouter");
      return text;
    });
  } catch (error) {
    console.error("[AI] Chat conversation failed after retries:", error);
    return "抱歉，我现在有点走神了。你刚才说什么？";
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/gemini/client.ts
git commit -m "feat(chat): add multi-turn conversation function to OpenRouter client"
```

---

### Task 6: Image Generation Client

**Files:**
- Create: `src/lib/image-gen/client.ts`

**Step 1: Create the image generation client**

```typescript
import { OPENROUTER_API_KEY } from "@/lib/env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

/**
 * Generate a pixel-art scene image based on conversation context.
 * Returns base64-encoded image data (PNG).
 */
export async function generateSceneImage(params: {
  companionName: string;
  scenarioTitle: string;
  conversationSummary: string;
}): Promise<{ base64: string; mimeType: string } | null> {
  const prompt = `Generate a pixel art scene in Chinese ink painting style.
Scene: ${params.conversationSummary}
Setting: A Journey to the West scenario titled "${params.scenarioTitle}"
Characters: ${params.companionName} (from Journey to the West) and a young traveler
Style: 16-bit pixel art with muted earth tones, warm lighting, Chinese landscape elements
Requirements: No text or words in the image. Landscape orientation. Atmospheric and evocative.`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[ImageGen] OpenRouter error ${res.status}: ${body}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    // Gemini image preview returns inline_data in parts
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          // data:image/png;base64,... format
          const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            return { base64: match[2], mimeType: match[1] };
          }
        }
      }
    }

    // Alternative: check for inline base64 in text content
    if (typeof content === "string" && content.includes("base64")) {
      const match = content.match(/data:(image\/\w+);base64,([A-Za-z0-9+/=]+)/);
      if (match) {
        return { base64: match[2], mimeType: match[1] };
      }
    }

    console.warn("[ImageGen] No image data found in response");
    return null;
  } catch (error) {
    console.error("[ImageGen] Generation failed:", error);
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/image-gen/client.ts
git commit -m "feat(chat): add pixel-art image generation client via OpenRouter"
```

---

### Task 7: API Route — POST /api/chat/start

**Files:**
- Create: `src/app/api/chat/start/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatStartSchema } from "@/lib/validations";
import { chatConversation } from "@/lib/gemini/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = chatStartSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { characterId, scenarioId } = parsed.data;

    // Validate character is unlocked
    const { data: userChar } = await supabase
      .from("user_characters")
      .select("character_id")
      .eq("user_id", user.id)
      .eq("character_id", characterId)
      .single();

    if (!userChar) {
      return NextResponse.json({ error: "Character not unlocked" }, { status: 403 });
    }

    // Fetch character details + scenario
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase.from("characters").select("name, personality_prompt, voice_id").eq("id", characterId).single(),
      supabase.from("chat_scenarios").select("*").eq("id", scenarioId).single(),
    ]);

    if (!character || !scenario) {
      return NextResponse.json({ error: "Character or scenario not found" }, { status: 404 });
    }

    // Validate scenario stage is cleared (Stage 1 always open)
    if (scenario.stage_number > 1) {
      const { data: stageProgress } = await supabase
        .from("quest_progress")
        .select("is_cleared")
        .eq("user_id", user.id)
        .eq("stage", scenario.stage_number)
        .eq("is_cleared", true)
        .single();

      if (!stageProgress) {
        return NextResponse.json({ error: "Scenario stage not cleared" }, { status: 403 });
      }
    }

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        character_id: characterId,
        scenario_id: scenarioId,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("[Chat] Session creation error:", sessionError);
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Generate opening message
    const systemPrompt = `You ARE ${character.name}. Stay fully in character at all times.

${character.personality_prompt}

SCENE: ${scenario.system_prompt}

RULES:
- Respond in Mandarin Chinese (简体中文) only
- Keep responses 1-3 sentences, natural conversational length
- Stay in the Journey to the West scenario context
- Be engaging — ask a question to start the conversation
- Use vocabulary appropriate for PSC intermediate level`;

    const openingMessage = await chatConversation([
      { role: "system", content: systemPrompt },
      { role: "user", content: "（场景开始，请你先开口说话，用1-2句话开始对话）" },
    ]);

    // Save opening message
    await supabase.from("chat_messages").insert({
      session_id: session.id,
      role: "companion",
      content: openingMessage,
    });

    return NextResponse.json({
      sessionId: session.id,
      openingMessage,
      characterVoiceId: character.voice_id,
      characterName: character.name,
    });
  } catch (error) {
    console.error("[Chat] Start error:", error);
    return NextResponse.json({ error: "Failed to start chat" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/chat/start/route.ts
git commit -m "feat(chat): add POST /api/chat/start route"
```

---

### Task 8: API Route — POST /api/chat/respond

**Files:**
- Create: `src/app/api/chat/respond/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/iflytek-speech/asr-client";
import { assessPronunciation } from "@/lib/iflytek-speech/client";
import { chatConversation, type ChatTurnMessage } from "@/lib/gemini/client";
import { isValidUUID } from "@/lib/validations";

const MAX_MESSAGES_PER_SESSION = 40; // 20 exchanges = 40 messages (user + companion)

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const sessionId = formData.get("sessionId") as string;
    const audio = formData.get("audio") as File;

    if (!sessionId || !isValidUUID(sessionId) || !audio) {
      return NextResponse.json({ error: "Missing sessionId or audio" }, { status: 400 });
    }

    // Validate file size (10MB max for chat messages)
    if (audio.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio too large (max 10MB)" }, { status: 400 });
    }

    // Verify session belongs to user and is still open
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, character_id, scenario_id, message_count, ended_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.ended_at) {
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }
    if (session.message_count >= MAX_MESSAGES_PER_SESSION) {
      return NextResponse.json({ error: "Maximum messages reached" }, { status: 400 });
    }

    // Fetch character + scenario for LLM context
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase.from("characters").select("name, personality_prompt, voice_id").eq("id", session.character_id).single(),
      supabase.from("chat_scenarios").select("system_prompt, title").eq("id", session.scenario_id).single(),
    ]);

    if (!character || !scenario) {
      return NextResponse.json({ error: "Character or scenario not found" }, { status: 500 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());

    // Step 1: ASR transcription
    console.log("[Chat] Step 1: Transcribing audio...");
    let transcript: string;
    try {
      const asrResult = await transcribeAudio(buffer);
      transcript = asrResult.transcript.trim();
    } catch (err) {
      console.error("[Chat] ASR failed:", err);
      return NextResponse.json({ error: "Speech recognition failed. Please try again." }, { status: 422 });
    }

    if (!transcript) {
      return NextResponse.json({ error: "No speech detected. Please speak clearly and try again." }, { status: 422 });
    }

    // Step 2: ISE pronunciation scoring
    console.log("[Chat] Step 2: Scoring pronunciation...");
    let pronunciationScore = 0;
    let toneScore = 0;
    let fluencyScore = 0;

    try {
      const iseResult = await assessPronunciation(buffer, transcript, "zh-CN", "read_chapter");
      pronunciationScore = iseResult.pronunciationScore;
      toneScore = iseResult.toneScore;
      fluencyScore = iseResult.fluencyScore;
    } catch (err) {
      console.error("[Chat] ISE scoring failed:", err);
      // Continue without scores rather than failing the whole turn
      pronunciationScore = 70;
      toneScore = 70;
      fluencyScore = 70;
    }

    const overallScore = Math.round((pronunciationScore + toneScore + fluencyScore) / 3);

    // Step 3: Save user message
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: transcript,
      transcript,
      pronunciation_score: pronunciationScore,
      tone_score: toneScore,
      fluency_score: fluencyScore,
    });

    // Step 4: Build conversation history for LLM
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const systemPrompt = `You ARE ${character.name}. Stay fully in character at all times.

${character.personality_prompt}

SCENE: ${scenario.system_prompt}

RULES:
- Respond in Mandarin Chinese (简体中文) only
- Keep responses 1-3 sentences, natural conversational length
- Stay in the Journey to the West scenario context
- Be engaging — ask follow-up questions to keep conversation going
- Adjust difficulty to match user's apparent Mandarin level
- The user's latest pronunciation score was ${overallScore}/100${overallScore < 70 ? ". Gently encourage them." : ""}
- Use vocabulary appropriate for PSC intermediate level`;

    const messages: ChatTurnMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((msg) => ({
        role: (msg.role === "companion" ? "assistant" : "user") as "assistant" | "user",
        content: msg.content,
      })),
    ];

    // Step 5: Generate companion reply
    console.log("[Chat] Step 3: Generating companion reply...");
    const companionReply = await chatConversation(messages);

    // Step 6: Save companion message
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "companion",
      content: companionReply,
    });

    // Update message count
    await supabase
      .from("chat_sessions")
      .update({ message_count: (session.message_count ?? 0) + 2 })
      .eq("id", sessionId);

    // Calculate XP for this turn
    let xpEarned = 2; // attempted
    if (overallScore >= 90) xpEarned = 10; // perfect
    else if (overallScore >= 60) xpEarned = 5; // good

    const turnNumber = Math.floor(((session.message_count ?? 0) + 2) / 2);

    return NextResponse.json({
      userTranscript: transcript,
      scores: {
        pronunciation: pronunciationScore,
        tone: toneScore,
        fluency: fluencyScore,
        overall: overallScore,
      },
      companionReply,
      xpEarned,
      turnNumber,
    });
  } catch (error) {
    console.error("[Chat] Respond error:", error);
    return NextResponse.json({ error: "Failed to process response" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/chat/respond/route.ts
git commit -m "feat(chat): add POST /api/chat/respond route with ASR+ISE pipeline"
```

---

### Task 9: API Route — POST /api/chat/generate-image

**Files:**
- Create: `src/app/api/chat/generate-image/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatGenerateImageSchema } from "@/lib/validations";
import { generateSceneImage } from "@/lib/image-gen/client";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = chatGenerateImageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { sessionId, conversationSummary } = parsed.data;

    // Verify session belongs to user
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, character_id, scenario_id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch character name and scenario title
    const [{ data: character }, { data: scenario }] = await Promise.all([
      supabase.from("characters").select("name").eq("id", session.character_id).single(),
      supabase.from("chat_scenarios").select("title").eq("id", session.scenario_id).single(),
    ]);

    // Generate image
    const imageResult = await generateSceneImage({
      companionName: character?.name ?? "Companion",
      scenarioTitle: scenario?.title ?? "Journey",
      conversationSummary,
    });

    if (!imageResult) {
      return NextResponse.json({ error: "Image generation failed" }, { status: 502 });
    }

    // Upload to Supabase Storage using service role for storage operations
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const fileName = `${user.id}/${sessionId}/${Date.now()}.png`;
    const imageBuffer = Buffer.from(imageResult.base64, "base64");

    const { error: uploadError } = await adminClient.storage
      .from("chat-images")
      .upload(fileName, imageBuffer, {
        contentType: imageResult.mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[ImageGen] Upload failed:", uploadError);
      return NextResponse.json({ error: "Failed to save image" }, { status: 500 });
    }

    const { data: urlData } = adminClient.storage.from("chat-images").getPublicUrl(fileName);
    const imageUrl = urlData.publicUrl;

    // Find the latest companion message in this session and update it with image_url
    const { data: latestCompanionMsg } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("session_id", sessionId)
      .eq("role", "companion")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestCompanionMsg) {
      await supabase
        .from("chat_messages")
        .update({ image_url: imageUrl })
        .eq("id", latestCompanionMsg.id);
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("[ImageGen] Route error:", error);
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/chat/generate-image/route.ts
git commit -m "feat(chat): add POST /api/chat/generate-image route"
```

---

### Task 10: API Route — POST /api/chat/end

**Files:**
- Create: `src/app/api/chat/end/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatEndSchema } from "@/lib/validations";
import { getAffectionLevel } from "@/lib/gamification/xp";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";
import { XP_VALUES } from "@/types/gamification";
import { MAX_XP_PER_SESSION } from "@/lib/constants";

/** Get today's date in Hong Kong time (YYYY-MM-DD) */
function getHKTDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

const AFFECTION_PER_TURN = 3;
const MIN_EXCHANGES_FOR_STREAK = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = chatEndSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { sessionId } = parsed.data;

    // Fetch session + verify ownership
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.ended_at) {
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }

    // Calculate stats from messages
    const { data: userMessages } = await supabase
      .from("chat_messages")
      .select("pronunciation_score, tone_score, fluency_score")
      .eq("session_id", sessionId)
      .eq("role", "user")
      .not("pronunciation_score", "is", null);

    const scoredMessages = userMessages ?? [];
    const messageCount = session.message_count;
    const userTurnCount = Math.floor(messageCount / 2);

    // Average score
    let avgScore = 0;
    if (scoredMessages.length > 0) {
      const totalScore = scoredMessages.reduce((sum, m) => {
        const s = ((m.pronunciation_score ?? 0) + (m.tone_score ?? 0) + (m.fluency_score ?? 0)) / 3;
        return sum + s;
      }, 0);
      avgScore = Math.round(totalScore / scoredMessages.length);
    }

    // XP calculation: per-turn XP based on scores
    let totalXpEarned = 0;
    for (const m of scoredMessages) {
      const overall = ((m.pronunciation_score ?? 0) + (m.tone_score ?? 0) + (m.fluency_score ?? 0)) / 3;
      if (overall >= 90) totalXpEarned += XP_VALUES.question_perfect;
      else if (overall >= 60) totalXpEarned += XP_VALUES.question_good;
      else totalXpEarned += XP_VALUES.question_attempted;
    }
    totalXpEarned = Math.min(totalXpEarned, MAX_XP_PER_SESSION);

    // Affection XP
    const affectionEarned = userTurnCount * AFFECTION_PER_TURN;

    // Update session
    await supabase
      .from("chat_sessions")
      .update({
        ended_at: new Date().toISOString(),
        avg_score: avgScore,
        xp_earned: totalXpEarned,
        affection_earned: affectionEarned,
      })
      .eq("id", sessionId);

    // Update profile XP + streak (only if enough exchanges)
    if (userTurnCount >= MIN_EXCHANGES_FOR_STREAK) {
      const todayHKT = getHKTDate();
      await supabase.rpc("update_profile_with_streak", {
        p_user_id: user.id,
        p_today: todayHKT,
        p_xp_to_add: totalXpEarned,
        p_daily_bonus_base: XP_VALUES.daily_login,
      });
    } else if (totalXpEarned > 0) {
      // Still award XP even if not enough exchanges for streak
      await supabase
        .from("profiles")
        .update({ total_xp: supabase.rpc ? undefined : 0 }) // Use RPC instead
        .eq("id", user.id);

      // Simple XP add without streak
      await supabase.rpc("update_profile_with_streak", {
        p_user_id: user.id,
        p_today: getHKTDate(),
        p_xp_to_add: totalXpEarned,
        p_daily_bonus_base: 0, // No daily bonus for short sessions
      });
    }

    // Update affection for the character
    const { data: userChar } = await supabase
      .from("user_characters")
      .select("affection_xp")
      .eq("user_id", user.id)
      .eq("character_id", session.character_id)
      .single();

    if (userChar) {
      const newAffectionXP = userChar.affection_xp + affectionEarned;
      const affectionInfo = getAffectionLevel(newAffectionXP);

      await supabase
        .from("user_characters")
        .update({
          affection_xp: newAffectionXP,
          affection_level: affectionInfo.level,
        })
        .eq("user_id", user.id)
        .eq("character_id", session.character_id);
    }

    // Check achievements
    let newAchievements: unknown[] = [];
    try {
      const { data: charData } = await supabase
        .from("characters")
        .select("name")
        .eq("id", session.character_id)
        .single();

      if (charData) {
        newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
          type: "chat_complete",
          characterName: charData.name,
        } as never); // Will need achievement type extension in Task 11
      }
    } catch (err) {
      console.error("[Chat] Achievement check error:", err);
    }

    // Fetch generated images for summary
    const { data: images } = await supabase
      .from("chat_messages")
      .select("image_url")
      .eq("session_id", sessionId)
      .not("image_url", "is", null);

    return NextResponse.json({
      summary: {
        messageCount,
        avgScore,
        xpEarned: totalXpEarned,
        affectionEarned,
        images: (images ?? []).map((i) => i.image_url).filter(Boolean),
      },
      newAchievements,
    });
  } catch (error) {
    console.error("[Chat] End error:", error);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/chat/end/route.ts
git commit -m "feat(chat): add POST /api/chat/end route with XP and affection"
```

---

### Task 11: API Route — GET /api/chat/history

**Files:**
- Create: `src/app/api/chat/history/route.ts`

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  // If sessionId provided, return full messages for that session
  if (sessionId) {
    if (!isValidUUID(sessionId)) {
      return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
    }

    const [{ data: session }, { data: messages }] = await Promise.all([
      supabase
        .from("chat_sessions")
        .select("*, characters(name), chat_scenarios(title)")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session, messages: messages ?? [] });
  }

  // Otherwise, return session list
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const { data: sessions, error, count } = await supabase
    .from("chat_sessions")
    .select("*, characters(name), chat_scenarios(title)", { count: "exact" })
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Chat] History fetch error:", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }

  return NextResponse.json({ sessions: sessions ?? [], total: count ?? 0 });
}
```

**Step 2: Commit**

```bash
git add src/app/api/chat/history/route.ts
git commit -m "feat(chat): add GET /api/chat/history route"
```

---

### Task 12: Achievement System Extension

**Files:**
- Modify: `src/lib/achievements/types.ts`
- Modify: `src/lib/achievements/definitions.ts`
- Modify: `src/lib/achievements/check.ts`

**Step 1: Add chat_complete context type**

In `src/lib/achievements/types.ts`, update the `AchievementContext` union (line 12-18):

```typescript
export type AchievementContext =
  | { type: 'quest_clear'; stage: number; damageTaken: number; remainingHP: number }
  | { type: 'quest_fail' }
  | { type: 'session_complete'; characterName: string }
  | { type: 'friend_added' }
  | { type: 'mock_exam_complete' }
  | { type: 'account_created' }
  | { type: 'chat_complete'; characterName: string };
```

**Step 2: Add 4 new achievement definitions**

In `src/lib/achievements/definitions.ts`, add before the closing `];` (after line 35):

```typescript
  { key: 'first_chat', name: 'First Words', description: 'Complete your first companion chat', emoji: '💬', tier: 'common', sortOrder: 33 },
  { key: 'chat_messages_50', name: 'Chatterbox', description: 'Send 50 messages in companion chat', emoji: '🗣️', tier: 'uncommon', sortOrder: 34 },
  { key: 'chat_all_companions', name: 'Polyglot', description: 'Chat with all 4 companions', emoji: '🌏', tier: 'rare', sortOrder: 35 },
  { key: 'chat_sessions_10', name: 'Storyteller', description: 'Complete 10 companion chat sessions', emoji: '📖', tier: 'epic', sortOrder: 36 },
```

**Step 3: Add chat achievement checking logic**

In `src/lib/achievements/check.ts`, add `chat_complete` case to `getCandidateKeys` (after `case 'account_created':` block, around line 47):

```typescript
    case 'chat_complete':
      return ['first_chat', 'chat_messages_50', 'chat_all_companions', 'chat_sessions_10'];
```

In `verifyConditions`, add verification for chat achievements inside the `for` loop (before the session checks, around line 73):

```typescript
    // Simple event-based: first_chat
    if (key === 'first_chat') {
      verified.push(key);
      continue;
    }

    // chat_messages_50: check total user messages across all chat sessions
    if (key === 'chat_messages_50') {
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')
        .in('session_id',
          supabase.from('chat_sessions').select('id').eq('user_id', userId)
        );
      // Supabase doesn't support subquery in .in() directly, so use a join approach
      const { count: msgCount } = await supabase.rpc('count_user_chat_messages', { p_user_id: userId });
      if (msgCount !== null && msgCount >= 50) {
        verified.push(key);
      }
      continue;
    }

    // chat_all_companions: check distinct character_ids in ended chat sessions
    if (key === 'chat_all_companions') {
      const { data: distinctChars } = await supabase
        .from('chat_sessions')
        .select('character_id')
        .eq('user_id', userId)
        .not('ended_at', 'is', null);

      const uniqueChars = new Set((distinctChars ?? []).map(r => r.character_id));
      if (uniqueChars.size >= 4) {
        verified.push(key);
      }
      continue;
    }

    // chat_sessions_10: check total completed chat sessions
    if (key === 'chat_sessions_10') {
      const { count } = await supabase
        .from('chat_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('ended_at', 'is', null);

      if (count !== null && count >= 10) {
        verified.push(key);
      }
      continue;
    }
```

**Step 4: Add SQL function for counting chat messages**

Use `mcp__supabase__apply_migration` with name `add_count_user_chat_messages_rpc`:

```sql
CREATE OR REPLACE FUNCTION count_user_chat_messages(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT count(*)
  FROM chat_messages cm
  JOIN chat_sessions cs ON cs.id = cm.session_id
  WHERE cs.user_id = p_user_id
    AND cm.role = 'user';
$$;
```

**Step 5: Seed achievement rows in DB**

Use `mcp__supabase__execute_sql`:

```sql
INSERT INTO achievements (key, name, description, emoji, tier, sort_order) VALUES
('first_chat', 'First Words', 'Complete your first companion chat', '💬', 'common', 33),
('chat_messages_50', 'Chatterbox', 'Send 50 messages in companion chat', '🗣️', 'uncommon', 34),
('chat_all_companions', 'Polyglot', 'Chat with all 4 companions', '🌏', 'rare', 35),
('chat_sessions_10', 'Storyteller', 'Complete 10 companion chat sessions', '📖', 'epic', 36);
```

**Step 6: Remove the `as never` cast in Task 10's chat/end route**

Now that the type is properly extended, the `type: "chat_complete"` will type-check correctly.

**Step 7: Commit**

```bash
git add src/lib/achievements/types.ts src/lib/achievements/definitions.ts src/lib/achievements/check.ts
git commit -m "feat(chat): add 4 companion chat achievements"
```

---

### Task 13: Dashboard Tile

**Files:**
- Modify: `src/app/(main)/dashboard/dashboard-client.tsx`

**Step 1: Add MessageCircle import**

In `src/app/(main)/dashboard/dashboard-client.tsx`, update the Lucide imports (line 7) to add `MessageCircle`:

```typescript
import {
  Swords,
  BookOpen,
  ClipboardCheck,
  Trophy,
  Users,
  UserCircle,
  ArrowRight,
  Volume2,
  VolumeX,
  Play,
  Flame,
  Github,
  MessageCircle,
} from "lucide-react";
```

**Step 2: Add Companion Chat to MENU_ITEMS**

Add after the Characters entry (line 47), before the closing `];`:

```typescript
  {
    href: "/companion-chat",
    icon: MessageCircle,
    label: "Companion Chat",
    description: "Chat with companions in Journey to the West scenarios",
  },
```

**Step 3: Commit**

```bash
git add src/app/(main)/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): add Companion Chat tile to home hub"
```

---

### Task 14: Server Component — Page & Loading Skeleton

**Files:**
- Create: `src/app/(main)/companion-chat/page.tsx`
- Create: `src/app/(main)/companion-chat/loading.tsx`

**Step 1: Create the server page**

```typescript
import { createClient } from "@/lib/supabase/server";
import { CHARACTER_IMAGES } from "@/lib/character-images";
import dynamic from "next/dynamic";

const CompanionChatClient = dynamic(() => import("./companion-chat-client"), {
  loading: () => <ChatSkeleton />,
});

function ChatSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 rounded animate-shimmer" />
      <div className="grid gap-4 grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-3">
            <div className="h-24 w-24 mx-auto rounded animate-shimmer" />
            <div className="h-4 w-20 mx-auto rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function CompanionChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;

  const [
    { data: characters },
    { data: userCharacters },
    { data: scenarios },
    { data: questProgress },
    { data: recentSessions },
  ] = await Promise.all([
    supabase.from("characters").select("*").order("unlock_stage", { ascending: true, nullsFirst: true }),
    supabase.from("user_characters").select("character_id, affection_xp, affection_level").eq("user_id", userId),
    supabase.from("chat_scenarios").select("*").order("sort_order", { ascending: true }),
    supabase.from("quest_progress").select("stage, is_cleared").eq("user_id", userId).eq("is_cleared", true),
    supabase
      .from("chat_sessions")
      .select("*, characters(name), chat_scenarios(title)")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Enrich characters with unlock status and images
  const unlockedIds = new Set((userCharacters ?? []).map((uc) => uc.character_id));
  const clearedStages = new Set((questProgress ?? []).map((qp) => qp.stage));

  const enrichedCharacters = (characters ?? []).map((char) => ({
    id: char.id,
    name: char.name,
    voiceId: char.voice_id,
    personalityPrompt: char.personality_prompt,
    image: char.image_url || CHARACTER_IMAGES[char.name] || null,
    isUnlocked: unlockedIds.has(char.id),
    unlockStage: char.unlock_stage,
    affectionXP: (userCharacters ?? []).find((uc) => uc.character_id === char.id)?.affection_xp ?? 0,
    affectionLevel: (userCharacters ?? []).find((uc) => uc.character_id === char.id)?.affection_level ?? 0,
  }));

  // Group scenarios by stage, only include cleared stages + stage 1
  const availableScenarios = (scenarios ?? []).filter(
    (s) => s.stage_number === 1 || clearedStages.has(s.stage_number)
  );

  return (
    <CompanionChatClient
      characters={enrichedCharacters}
      scenarios={availableScenarios}
      recentSessions={(recentSessions ?? []).map((s) => ({
        id: s.id,
        characterName: (s.characters as { name: string } | null)?.name ?? "Unknown",
        scenarioTitle: (s.chat_scenarios as { title: string } | null)?.title ?? "Unknown",
        messageCount: s.message_count,
        avgScore: s.avg_score,
        xpEarned: s.xp_earned,
        createdAt: s.created_at,
      }))}
    />
  );
}
```

**Step 2: Create loading skeleton**

```typescript
// src/app/(main)/companion-chat/loading.tsx
export default function CompanionChatLoading() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 rounded animate-shimmer" />
      <div className="grid gap-4 grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-3">
            <div className="h-24 w-24 mx-auto rounded animate-shimmer" />
            <div className="h-4 w-20 mx-auto rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/(main)/companion-chat/page.tsx src/app/(main)/companion-chat/loading.tsx
git commit -m "feat(chat): add companion chat page server component and loading skeleton"
```

---

### Task 15: Client Component — State Machine & Chat UI

This is the largest task. The client component handles the full state machine: `select_companion → select_scenario → chatting → summary`, plus the History tab.

**Files:**
- Create: `src/app/(main)/companion-chat/companion-chat-client.tsx`

**Step 1: Create the client component**

This is the main interactive component. Key sections:

1. **Companion selection** — Grid of 4 character cards
2. **Scenario selection** — Vertical list grouped by stage
3. **Chat screen** — Message bubbles, record button, background overlay, typing indicator
4. **Summary screen** — Stats and image gallery
5. **History tab** — Session list and detail view

The component should:
- Use `fetchWithRetry` for all API calls
- Reuse `AudioRecorder` for voice input
- Use existing `useAudioSettings` for TTS volume
- Use `useAchievementToast` for achievement notifications
- Implement C4-style background fade overlay for generated images
- Auto-scroll to latest message
- Auto-play companion TTS on new messages

Full code for this component (save as `src/app/(main)/companion-chat/companion-chat-client.tsx`):

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  MessageCircle,
  History,
  ArrowLeft,
  Mic,
  Square,
  Volume2,
  ChevronDown,
  ChevronUp,
  LogOut,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/practice/audio-recorder";
import { Button } from "@/components/ui/button";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { useAudioSettings } from "@/components/shared/audio-settings";
import { useAchievementToast } from "@/components/shared/achievement-toast";
import { getAffectionLevel } from "@/lib/gamification/xp";

// ── Types ──

interface EnrichedCharacter {
  id: string;
  name: string;
  voiceId: string;
  personalityPrompt: string;
  image: string | null;
  isUnlocked: boolean;
  unlockStage: number | null;
  affectionXP: number;
  affectionLevel: number;
}

interface Scenario {
  id: string;
  stage_number: number;
  title: string;
  description: string;
}

interface HistorySession {
  id: string;
  characterName: string;
  scenarioTitle: string;
  messageCount: number;
  avgScore: number | null;
  xpEarned: number;
  createdAt: string;
}

interface ChatMessageUI {
  id: string;
  role: "user" | "companion";
  content: string;
  pronunciationScore?: number;
  toneScore?: number;
  fluencyScore?: number;
  imageUrl?: string;
  expandedScore?: boolean;
}

interface SessionSummary {
  messageCount: number;
  avgScore: number;
  xpEarned: number;
  affectionEarned: number;
  images: string[];
}

type ViewTab = "chat" | "history";
type ChatPhase = "select_companion" | "select_scenario" | "chatting" | "summary";

interface CompanionChatClientProps {
  characters: EnrichedCharacter[];
  scenarios: Scenario[];
  recentSessions: HistorySession[];
}

// ── Stage names ──

const STAGE_NAMES: Record<number, string> = {
  1: "花果山 — Flower Fruit Mountain",
  2: "取经启程 — Journey Begins",
  3: "流沙河 — Flowing Sand River",
  4: "白骨精 — White Bone Spirit",
  5: "火焰山 — Flaming Mountain",
  6: "盘丝洞 — Spider Cave",
  7: "雷音寺 — Thunder Monastery",
};

// ── Component ──

export default function CompanionChatClient({
  characters,
  scenarios,
  recentSessions,
}: CompanionChatClientProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<ViewTab>("chat");

  // Chat state machine
  const [phase, setPhase] = useState<ChatPhase>("select_companion");
  const [selectedCharacter, setSelectedCharacter] = useState<EnrichedCharacter | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [turnCount, setTurnCount] = useState(0);

  // History state
  const [historyDetail, setHistoryDetail] = useState<{ session: HistorySession; messages: ChatMessageUI[] } | null>(null);

  // Audio
  const { effectiveTTSVolume } = useAudioSettings();
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Background overlay (C4 pattern)
  const bgOverlayRef = useRef<HTMLDivElement | null>(null);

  // Message scroll
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Achievement toast
  const { showAchievementToasts } = useAchievementToast();

  // ── Background overlay setup (C4 pattern) ──
  useEffect(() => {
    if (phase !== "chatting") return;

    document.body.style.isolation = "isolate";
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: -1;
      background-size: cover; background-position: center; background-attachment: fixed;
      opacity: 0; transition: opacity 0.8s ease-in-out; pointer-events: none;
    `;
    document.body.appendChild(overlay);
    bgOverlayRef.current = overlay;

    return () => {
      overlay.remove();
      bgOverlayRef.current = null;
      document.body.style.isolation = "";
    };
  }, [phase]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── TTS playback ──
  const playTTS = useCallback(async (text: string, voiceId: string) => {
    try {
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      const res = await fetchWithRetry("/api/tts/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, text }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = effectiveTTSVolume;
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.error("[Chat] TTS playback error:", err);
    }
  }, [effectiveTTSVolume]);

  // ── Background image transition ──
  const showBackgroundImage = useCallback((imageUrl: string) => {
    if (!bgOverlayRef.current) return;
    const overlay = bgOverlayRef.current;
    const img = new window.Image();
    img.onload = () => {
      overlay.style.backgroundImage = `url(${imageUrl})`;
      requestAnimationFrame(() => { overlay.style.opacity = "0.4"; });
    };
    img.src = imageUrl;
  }, []);

  // ── Start chat session ──
  const handleStartChat = useCallback(async () => {
    if (!selectedCharacter || !selectedScenario) return;
    setIsStarting(true);

    try {
      const res = await fetchWithRetry("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedCharacter.id,
          scenarioId: selectedScenario.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to start chat");
        setIsStarting(false);
        return;
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setMessages([{
        id: crypto.randomUUID(),
        role: "companion",
        content: data.openingMessage,
      }]);
      setTurnCount(0);
      setPhase("chatting");

      // Auto-play opening message
      playTTS(data.openingMessage, selectedCharacter.voiceId);
    } catch (err) {
      console.error("[Chat] Start error:", err);
      alert("Failed to start chat. Please try again.");
    } finally {
      setIsStarting(false);
    }
  }, [selectedCharacter, selectedScenario, playTTS]);

  // ── Handle recording complete ──
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!sessionId || !selectedCharacter) return;
    setIsProcessing(true);

    // Add typing indicator
    const typingId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: typingId,
      role: "companion",
      content: "...",
    }]);

    try {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("audio", audioBlob, "recording.wav");

      const res = await fetchWithRetry("/api/chat/respond", {
        method: "POST",
        body: formData,
      });

      // Remove typing indicator
      setMessages(prev => prev.filter(m => m.id !== typingId));

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to process response");
        setIsProcessing(false);
        return;
      }

      const data = await res.json();
      const newTurnCount = data.turnNumber;
      setTurnCount(newTurnCount);

      // Add user message
      const userMsgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: userMsgId,
        role: "user",
        content: data.userTranscript,
        pronunciationScore: data.scores.pronunciation,
        toneScore: data.scores.tone,
        fluencyScore: data.scores.fluency,
      }]);

      // Add companion reply
      const companionMsgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: companionMsgId,
        role: "companion",
        content: data.companionReply,
      }]);

      // Auto-play companion reply
      playTTS(data.companionReply, selectedCharacter.voiceId);

      // Generate image every 4 user turns (non-blocking)
      if (newTurnCount > 0 && newTurnCount % 4 === 0) {
        // Build conversation summary from last 8 messages
        const recentMsgs = messages.slice(-8).map(m =>
          `${m.role === "user" ? "User" : selectedCharacter.name}: ${m.content}`
        ).join("\n");

        fetchWithRetry("/api/chat/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            conversationSummary: recentMsgs,
          }),
        }).then(async (imgRes) => {
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            if (imgData.imageUrl) {
              showBackgroundImage(imgData.imageUrl);
              // Update the companion message with image URL
              setMessages(prev => prev.map(m =>
                m.id === companionMsgId ? { ...m, imageUrl: imgData.imageUrl } : m
              ));
            }
          }
        }).catch(err => console.error("[Chat] Image gen error:", err));
      }
    } catch (err) {
      // Remove typing indicator on error
      setMessages(prev => prev.filter(m => m.id !== typingId));
      console.error("[Chat] Respond error:", err);
      alert("Failed to process your response. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, selectedCharacter, messages, playTTS, showBackgroundImage]);

  // ── End conversation ──
  const handleEndChat = useCallback(async () => {
    if (!sessionId) return;
    if (!confirm("End this conversation?")) return;

    setIsProcessing(true);
    try {
      const res = await fetchWithRetry("/api/chat/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setPhase("summary");

        if (data.newAchievements?.length > 0) {
          showAchievementToasts(data.newAchievements);
        }
      }
    } catch (err) {
      console.error("[Chat] End error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, showAchievementToasts]);

  // ── Reset to start ──
  const handleNewChat = useCallback(() => {
    setPhase("select_companion");
    setSelectedCharacter(null);
    setSelectedScenario(null);
    setSessionId(null);
    setMessages([]);
    setSummary(null);
    setTurnCount(0);

    // Fade out background
    if (bgOverlayRef.current) {
      bgOverlayRef.current.style.opacity = "0";
    }
  }, []);

  // ── View history detail ──
  const handleViewHistory = useCallback(async (session: HistorySession) => {
    try {
      const res = await fetchWithRetry(`/api/chat/history?sessionId=${session.id}`);
      if (!res.ok) return;

      const data = await res.json();
      setHistoryDetail({
        session,
        messages: (data.messages ?? []).map((m: { id: string; role: string; content: string; pronunciation_score: number | null; tone_score: number | null; fluency_score: number | null; image_url: string | null }) => ({
          id: m.id,
          role: m.role as "user" | "companion",
          content: m.content,
          pronunciationScore: m.pronunciation_score ?? undefined,
          toneScore: m.tone_score ?? undefined,
          fluencyScore: m.fluency_score ?? undefined,
          imageUrl: m.image_url ?? undefined,
        })),
      });
    } catch (err) {
      console.error("[Chat] History detail error:", err);
    }
  }, []);

  // ── Score color helper ──
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return "bg-green-100 border-green-400";
    if (score >= 70) return "bg-yellow-100 border-yellow-400";
    return "bg-red-100 border-red-400";
  };

  // ── Tab bar ──
  const renderTabBar = () => (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => { setActiveTab("chat"); setHistoryDetail(null); }}
        className={`flex items-center gap-2 px-4 py-2 font-pixel text-sm transition-all ${
          activeTab === "chat"
            ? "pixel-border-primary bg-primary/10 text-primary"
            : "pixel-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        <MessageCircle className="h-4 w-4" />
        New Chat
      </button>
      <button
        onClick={() => { setActiveTab("history"); setHistoryDetail(null); }}
        className={`flex items-center gap-2 px-4 py-2 font-pixel text-sm transition-all ${
          activeTab === "history"
            ? "pixel-border-primary bg-primary/10 text-primary"
            : "pixel-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        <History className="h-4 w-4" />
        History
      </button>
    </div>
  );

  // ── RENDER: History Tab ──
  if (activeTab === "history") {
    if (historyDetail) {
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          {renderTabBar()}
          <button
            onClick={() => setHistoryDetail(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to history
          </button>

          <div className="pixel-border chinese-corner bg-card p-4">
            <p className="font-pixel text-sm text-primary">{historyDetail.session.characterName}</p>
            <p className="text-sm text-muted-foreground">{historyDetail.session.scenarioTitle}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(historyDetail.session.createdAt).toLocaleDateString()} · {historyDetail.session.messageCount} messages · Avg: {historyDetail.session.avgScore ?? "N/A"}
            </p>
          </div>

          <div className="space-y-3">
            {historyDetail.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] pixel-border p-3 ${
                  msg.role === "user" ? "bg-primary/10 border-primary/30" : "bg-card"
                }`}>
                  <p className="font-chinese text-sm">{msg.content}</p>
                  {msg.pronunciationScore !== undefined && (
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-pixel border ${getScoreBg(msg.pronunciationScore)}`}>
                      {Math.round(((msg.pronunciationScore ?? 0) + (msg.toneScore ?? 0) + (msg.fluencyScore ?? 0)) / 3)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {renderTabBar()}
        <h2 className="font-pixel text-sm text-foreground">Chat History</h2>
        {recentSessions.length === 0 ? (
          <div className="pixel-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No conversations yet. Start chatting!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleViewHistory(session)}
                className="w-full text-left pixel-border chinese-corner bg-card px-4 py-3 hover:pixel-border-primary transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-pixel text-sm text-foreground">{session.characterName}</p>
                    <p className="text-sm text-muted-foreground">{session.scenarioTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                    <p className="font-pixel text-xs text-primary">
                      {session.messageCount} msgs · Avg: {session.avgScore ? Math.round(session.avgScore) : "—"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── RENDER: Chat Tab ──

  // Phase: Select Companion
  if (phase === "select_companion") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {renderTabBar()}
        <h2 className="font-pixel text-sm text-foreground">Choose Your Companion</h2>
        <p className="font-chinese text-sm text-muted-foreground">选择你的同伴</p>
        <div className="grid grid-cols-2 gap-3">
          {characters.map((char) => {
            const affInfo = getAffectionLevel(char.affectionXP);
            return (
              <button
                key={char.id}
                disabled={!char.isUnlocked}
                onClick={() => {
                  setSelectedCharacter(char);
                  setPhase("select_scenario");
                }}
                className={`pixel-border p-4 text-center transition-all ${
                  char.isUnlocked
                    ? "bg-card hover:pixel-border-primary cursor-pointer"
                    : "bg-muted/50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="relative h-24 w-24 mx-auto mb-2 pixel-border bg-muted overflow-hidden">
                  {char.image ? (
                    <Image
                      src={char.image}
                      alt={char.name}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl">?</div>
                  )}
                </div>
                <p className="font-pixel text-xs text-foreground leading-relaxed">{char.name}</p>
                {char.isUnlocked ? (
                  <p className="text-xs text-muted-foreground mt-1">{affInfo.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Stage {char.unlockStage}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Phase: Select Scenario
  if (phase === "select_scenario") {
    // Group scenarios by stage
    const grouped = scenarios.reduce<Record<number, Scenario[]>>((acc, s) => {
      (acc[s.stage_number] ??= []).push(s);
      return acc;
    }, {});

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {renderTabBar()}
        <button
          onClick={() => setPhase("select_companion")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="pixel-border chinese-corner bg-card p-3 flex items-center gap-3">
          {selectedCharacter?.image && (
            <div className="relative h-12 w-12 shrink-0 pixel-border bg-muted overflow-hidden">
              <Image src={selectedCharacter.image} alt="" fill className="object-contain" unoptimized />
            </div>
          )}
          <div>
            <p className="font-pixel text-sm text-primary">{selectedCharacter?.name}</p>
            <p className="text-xs text-muted-foreground">Select a scenario</p>
          </div>
        </div>

        {Object.entries(grouped)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([stage, stageScenarios]) => (
            <div key={stage} className="space-y-2">
              <p className="font-pixel text-xs text-muted-foreground">
                Stage {stage}: {STAGE_NAMES[Number(stage)] ?? ""}
              </p>
              {stageScenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => {
                    setSelectedScenario(scenario);
                    handleStartChat();
                  }}
                  disabled={isStarting}
                  className="w-full text-left pixel-border bg-card px-4 py-3 hover:pixel-border-primary transition-all disabled:opacity-50"
                >
                  <p className="font-chinese text-base text-foreground">{scenario.title}</p>
                  <p className="font-chinese text-sm text-muted-foreground">{scenario.description}</p>
                </button>
              ))}
            </div>
          ))}

        {isStarting && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="font-pixel text-sm text-muted-foreground">Starting conversation...</span>
          </div>
        )}
      </div>
    );
  }

  // Phase: Chatting
  if (phase === "chatting") {
    return (
      <div className="mx-auto max-w-2xl flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>
        {/* Top bar */}
        <div className="pixel-border chinese-corner bg-card/90 backdrop-blur-sm p-3 flex items-center gap-3 shrink-0">
          {selectedCharacter?.image && (
            <div className="relative h-10 w-10 shrink-0 pixel-border bg-muted overflow-hidden">
              <Image src={selectedCharacter.image} alt="" fill className="object-contain" unoptimized />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-pixel text-xs text-primary truncate">{selectedCharacter?.name}</p>
            <p className="font-chinese text-xs text-muted-foreground truncate">{selectedScenario?.title}</p>
          </div>
          <span className="font-pixel text-xs text-muted-foreground">{turnCount}/20</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEndChat}
            disabled={isProcessing}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 px-1 space-y-3 bg-background/80 backdrop-blur-sm">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${msg.role === "user" ? "" : ""}`}>
                {/* Companion messages */}
                {msg.role === "companion" && (
                  <div className="pixel-border bg-card/90 backdrop-blur-sm p-3">
                    {msg.content === "..." ? (
                      <div className="flex gap-1">
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <>
                        <p className="font-chinese text-sm leading-relaxed">{msg.content}</p>
                        <button
                          onClick={() => selectedCharacter && playTTS(msg.content, selectedCharacter.voiceId)}
                          className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Volume2 className="h-3 w-3" /> Listen
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* User messages */}
                {msg.role === "user" && (
                  <div className="pixel-border bg-primary/10 border-primary/30 p-3">
                    <p className="font-chinese text-sm leading-relaxed">{msg.content}</p>
                    {msg.pronunciationScore !== undefined && (() => {
                      const overall = Math.round(((msg.pronunciationScore ?? 0) + (msg.toneScore ?? 0) + (msg.fluencyScore ?? 0)) / 3);
                      return (
                        <div className="mt-2">
                          <button
                            onClick={() => setMessages(prev => prev.map(m =>
                              m.id === msg.id ? { ...m, expandedScore: !m.expandedScore } : m
                            ))}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-pixel border ${getScoreBg(overall)} ${getScoreColor(overall)}`}
                          >
                            {overall}
                            {msg.expandedScore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                          {msg.expandedScore && (
                            <div className="mt-2 space-y-1 text-xs">
                              <p>Pronunciation: <span className={getScoreColor(msg.pronunciationScore ?? 0)}>{msg.pronunciationScore}</span></p>
                              <p>Tone: <span className={getScoreColor(msg.toneScore ?? 0)}>{msg.toneScore}</span></p>
                              <p>Fluency: <span className={getScoreColor(msg.fluencyScore ?? 0)}>{msg.fluencyScore}</span></p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="pixel-border bg-card/90 backdrop-blur-sm p-3 shrink-0">
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={isProcessing}
          />
          {isProcessing && (
            <p className="text-center text-xs text-muted-foreground mt-2 font-pixel animate-pulse">
              Processing...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Phase: Summary
  if (phase === "summary" && summary) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h2 className="font-pixel text-sm text-primary text-center">Conversation Complete</h2>
        <p className="font-chinese text-center text-muted-foreground">对话结束</p>

        <div className="pixel-border chinese-frame bg-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="font-pixel text-2xl text-primary">{summary.messageCount}</p>
              <p className="text-xs text-muted-foreground">Messages</p>
            </div>
            <div className="text-center">
              <p className={`font-pixel text-2xl ${getScoreColor(summary.avgScore)}`}>{summary.avgScore}</p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </div>
            <div className="text-center">
              <p className="font-pixel text-2xl text-primary">+{summary.xpEarned}</p>
              <p className="text-xs text-muted-foreground">XP Earned</p>
            </div>
            <div className="text-center">
              <p className="font-pixel text-2xl text-pink-500">+{summary.affectionEarned}</p>
              <p className="text-xs text-muted-foreground">Affection</p>
            </div>
          </div>

          {summary.images.length > 0 && (
            <>
              <div className="chinese-divider" />
              <p className="font-pixel text-xs text-muted-foreground text-center">Generated Scenes</p>
              <div className="grid grid-cols-2 gap-2">
                {summary.images.map((url, i) => (
                  <div key={i} className="pixel-border overflow-hidden">
                    <Image src={url} alt={`Scene ${i + 1}`} width={300} height={200} className="w-full h-auto" unoptimized />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={handleNewChat} className="pixel-btn">
            <RotateCcw className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
```

**Step 2: Fix the scenario selection flow**

Note: The `handleStartChat` is called in the scenario selection `onClick`, but `selectedScenario` won't be set yet at that point since `setSelectedScenario` is async. We need to handle this properly — either pass the scenario directly or use a `useEffect`. The simplest fix: modify the scenario button to set state and start in sequence.

Replace the scenario button onClick with:

```typescript
onClick={async () => {
  setSelectedScenario(scenario);
  // Start chat inline since setState is batched
  setIsStarting(true);
  try {
    const res = await fetchWithRetry("/api/chat/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: selectedCharacter!.id,
        scenarioId: scenario.id,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to start chat");
      setIsStarting(false);
      return;
    }
    const data = await res.json();
    setSessionId(data.sessionId);
    setMessages([{
      id: crypto.randomUUID(),
      role: "companion",
      content: data.openingMessage,
    }]);
    setTurnCount(0);
    setPhase("chatting");
    playTTS(data.openingMessage, selectedCharacter!.voiceId);
  } catch (err) {
    console.error("[Chat] Start error:", err);
    alert("Failed to start chat.");
  } finally {
    setIsStarting(false);
  }
}}
```

**Step 3: Commit**

```bash
git add src/app/(main)/companion-chat/companion-chat-client.tsx
git commit -m "feat(chat): add companion chat client component with full UI"
```

---

### Task 16: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add companion-chat route to the route structure**

In the route structure section, add after `social/`:

```
│   ├── companion-chat/         # Oral conversation with companions in JttW scenarios
```

**Step 2: Add companion chat to API routes section**

After the social routes:

```
    ├── chat/
    │   ├── start               # Create chat session, generate opening message
    │   ├── respond             # ASR + ISE pipeline + DeepSeek reply
    │   ├── generate-image      # Gemini pixel-art scene generation
    │   ├── end                 # Finalize session, award XP/affection
    │   └── history             # Session list and message history
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add companion chat routes to CLAUDE.md"
```

---

### Task 17: Build Verification & Smoke Test

**Step 1: Run linter**

```bash
npm run lint
```

Expected: No new errors from the chat files.

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 4: Fix any issues found**

If lint or type errors appear, fix them and commit:

```bash
git add -A
git commit -m "fix(chat): resolve lint and type errors"
```

---

### Task 18: Run Security Advisors

**Step 1: Check for security issues**

Use `mcp__supabase__get_advisors` with project_id `yfoifmqjhavxidomgids` and type `security`.

Verify that all new tables have proper RLS policies and no open security advisories.

**Step 2: Check for performance issues**

Use `mcp__supabase__get_advisors` with project_id `yfoifmqjhavxidomgids` and type `performance`.

If any issues, fix and commit.
