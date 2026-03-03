import { OPENROUTER_API_KEY } from "@/lib/env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-v3.2";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function getFallbackMessage(isCorrect: boolean): string {
  return isCorrect
    ? "做得好！继续加油！ Nice work, keep it up!"
    : "再试一次吧！Practice makes perfect!";
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`[AI] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
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
}

// ---------- C5 Speaking Analysis ----------

export interface GeminiC5Analysis {
  vocabularyLevel: 1 | 2 | 3;
  vocabularyNotes: string;
  fluencyLevel: 1 | 2 | 3;
  fluencyNotes: string;
  contentRelevance: string;
}

const C5_ANALYSIS_SYSTEM_PROMPT = `You are a PSC (Putonghua Proficiency Test) examiner evaluating Component 5 (命题说话).

Analyze the transcript and rate TWO dimensions using the official PSC rubric:

## Vocabulary & Grammar (词汇语法):
- Level 1: Standard Putonghua vocabulary and grammar throughout. No dialectal words or non-standard grammar.
- Level 2: Some dialectal vocabulary or minor grammar errors (1-3 instances). Generally standard.
- Level 3: Frequent dialectal vocabulary, obvious grammar errors, or very limited vocabulary range.

## Fluency (自然流畅):
- Level 1: Natural flow, smooth delivery, well-organized thoughts. Minimal filler words.
- Level 2: Some hesitation, occasional filler words (嗯、那个、就是), but generally coherent.
- Level 3: Frequent pauses, excessive filler words, disorganized or incoherent speech.

Respond with ONLY a valid JSON object (no markdown, no code fences):
{
  "vocabularyLevel": 1|2|3,
  "vocabularyNotes": "brief explanation in Chinese+English",
  "fluencyLevel": 1|2|3,
  "fluencyNotes": "brief explanation in Chinese+English",
  "contentRelevance": "brief note on topic relevance"
}`;

function parseC5Analysis(text: string): GeminiC5Analysis {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate and clamp levels
  const vocabLevel = [1, 2, 3].includes(parsed.vocabularyLevel)
    ? parsed.vocabularyLevel as 1 | 2 | 3
    : 2;
  const fluencyLevel = [1, 2, 3].includes(parsed.fluencyLevel)
    ? parsed.fluencyLevel as 1 | 2 | 3
    : 2;

  return {
    vocabularyLevel: vocabLevel,
    vocabularyNotes: String(parsed.vocabularyNotes || "Standard vocabulary usage."),
    fluencyLevel: fluencyLevel,
    fluencyNotes: String(parsed.fluencyNotes || "Generally fluent delivery."),
    contentRelevance: String(parsed.contentRelevance || "Content is relevant to the topic."),
  };
}

export async function analyzeC5Speaking(params: {
  transcript: string;
  topic: string;
}): Promise<GeminiC5Analysis> {
  const userPrompt = `Topic: "${params.topic}"

Transcript of the student's 3-minute prompted speaking:
"""
${params.transcript}
"""

Analyze this speaking sample according to the PSC C5 rubric.`;

  try {
    const text = await retryWithBackoff(() =>
      chatCompletion(C5_ANALYSIS_SYSTEM_PROMPT, userPrompt)
    );
    return parseC5Analysis(text);
  } catch (error) {
    console.error("[AI] C5 analysis failed after retries:", error);
    return {
      vocabularyLevel: 2,
      vocabularyNotes: "Unable to analyze vocabulary — defaulting to Level 2.",
      fluencyLevel: 2,
      fluencyNotes: "Unable to analyze fluency — defaulting to Level 2.",
      contentRelevance: "Unable to assess content relevance.",
    };
  }
}

// ---------- Character Feedback ----------

export async function generateFeedback(params: {
  characterPrompt: string;
  component: number;
  questionText: string;
  userAnswer: string;
  pronunciationScore?: number;
  isCorrect: boolean;
  playerMemory?: string;
}) {
  const systemPrompt = `You ARE the following character. Stay fully in character at all times — use their speech patterns, catchphrases, metaphors, and personality traits in every response. Never break character.

${params.characterPrompt}

${params.playerMemory ? `${params.playerMemory}\n` : ''}CONTEXT: The student is practicing for the PSC (Putonghua Proficiency Test), Component ${params.component}.
RULES:
- Respond in a mix of Chinese and English, staying fully in character.
- Keep responses to 2-4 sentences. Be concise but expressive.
- Use the character's unique vocabulary, metaphors, and mannerisms every time.
- Weave actionable pronunciation or study advice into the character's voice.`;

  const userPrompt = params.pronunciationScore !== undefined
    ? `The student was asked to pronounce: "${params.questionText}"
Their pronunciation score was ${params.pronunciationScore}/100.
${params.isCorrect ? "They did well!" : "They need improvement."}
Respond in character with specific feedback on their pronunciation.`
    : `The question was: "${params.questionText}"
The student answered: "${params.userAnswer}"
${params.isCorrect ? "They got it right!" : "They got it wrong."}
Respond in character with feedback.`;

  try {
    return await retryWithBackoff(() =>
      chatCompletion(systemPrompt, userPrompt)
    );
  } catch (error) {
    console.error("[AI] Feedback generation failed after retries:", error);
    return getFallbackMessage(params.isCorrect);
  }
}

// ---------- Multi-Turn Conversation (Companion Chat) ----------

export interface ChatTurnMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponseEnvelope {
  type: "reply" | "redirect";
  content: string;
}

export function parseChatResponse(text: string): ChatResponseEnvelope {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (
        (parsed.type === "reply" || parsed.type === "redirect") &&
        typeof parsed.content === "string"
      ) {
        return { type: parsed.type, content: parsed.content };
      }
    }
  } catch {
    // JSON parse failed — treat as plain text
  }
  return { type: "reply", content: text };
}

export async function chatConversation(
  messages: ChatTurnMessage[],
): Promise<ChatResponseEnvelope> {
  try {
    const raw = await retryWithBackoff(async () => {
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
    return parseChatResponse(raw);
  } catch (error) {
    console.error("[AI] Chat conversation failed after retries:", error);
    return { type: "reply", content: "抱歉，我现在有点走神了。你刚才说什么？" };
  }
}

// ---------- Personalized Learning Path ----------

export interface CurriculumInput {
  scores: Record<string, number>;
  daysRemaining: number;
  availableQuestionIds: Record<number, string[]>;
  recentQuestionTexts: string[];
  previousCheckpoints?: {
    scores: Record<string, number>;
    completedNodes: { component: number; focusArea: string }[];
  }[];
}

export interface CurriculumNode {
  component: number;
  focusArea: string;
  focusDescription: string;
  questionIds: string[];
  estimatedMinutes: number;
}

export interface CurriculumPhase {
  phase: number;
  nodes: CurriculumNode[];
}

export interface CurriculumOutput {
  phases: CurriculumPhase[];
  totalNodes: number;
}

export interface CheckpointFeedbackInput {
  originalScores: Record<string, number>;
  currentScores: Record<string, number>;
  completedNodes: { component: number; focusArea: string }[];
  phaseNumber: number;
}

const COMPONENT_LABELS: Record<number, string> = {
  1: "C1 单音节字词 (Single-syllable words)",
  2: "C2 多音节词语 (Multi-syllable words)",
  3: "C3 朗读短文 (Passage reading)",
  4: "C4 选择判断 (Multiple choice)",
  5: "C5 命题说话 (Prompted speaking)",
  6: "C6 声调辨识 (Tone identification)",
  7: "C7 拼音拼读 (Pinyin reading)",
};

export function buildCurriculumPrompt(input: CurriculumInput): string {
  const recommendedNodes = Math.min(60, Math.max(8, Math.round(input.daysRemaining * 1.5)));

  const scoreLines = Object.entries(input.scores)
    .map(([key, val]) => `  - ${key}: ${val}/100`)
    .join("\n");

  const availableLines = Object.entries(input.availableQuestionIds)
    .map(([comp, ids]) => `  - Component ${comp} (${COMPONENT_LABELS[Number(comp)] ?? `C${comp}`}): ${ids.length} questions available`)
    .join("\n");

  const recentSection = input.recentQuestionTexts.length > 0
    ? `\nRecently practiced (avoid repeating these):\n${input.recentQuestionTexts.map(t => `  - "${t}"`).join("\n")}`
    : "";

  const checkpointSection = input.previousCheckpoints && input.previousCheckpoints.length > 0
    ? `\nPrevious checkpoint history:\n${input.previousCheckpoints.map((cp, i) => {
        const cpScores = Object.entries(cp.scores).map(([k, v]) => `${k}: ${v}`).join(", ");
        const cpNodes = cp.completedNodes.map(n => `C${n.component}/${n.focusArea}`).join(", ");
        return `  Phase ${i + 1}: Scores [${cpScores}], Completed [${cpNodes}]`;
      }).join("\n")}`
    : "";

  return `You are a PSC (Putonghua Proficiency Test) curriculum designer AI.

Given the student's current diagnostic scores and available question bank, generate a personalized learning curriculum.

Student's current scores:
${scoreLines}

Days remaining until test: ${input.daysRemaining}
Recommended total nodes: ${recommendedNodes}

Available question bank:
${availableLines}
${recentSection}${checkpointSection}

RULES:
1. Create a phased curriculum. Each phase should have 3-6 nodes. A checkpoint will automatically follow each phase.
2. Prioritize components with the lowest scores — these need the most practice.
3. Each node must specify: component (1-7), focusArea (short label), focusDescription (1 sentence), questionIds (pick from available), estimatedMinutes (5-15).
4. Distribute questionIds from the available bank. Each node should have 3-8 questions.
5. Do NOT repeat questionIds across nodes.
6. Total nodes across all phases should be approximately ${recommendedNodes}.
7. Later phases should focus on maintaining strengths and revisiting weaknesses found in earlier phases.

Respond with ONLY a valid JSON object (no markdown, no code fences):
{
  "phases": [
    {
      "phase": 1,
      "nodes": [
        {
          "component": 1,
          "focusArea": "tone_accuracy",
          "focusDescription": "Practice first and second tone distinctions",
          "questionIds": ["id1", "id2", "id3"],
          "estimatedMinutes": 10
        }
      ]
    }
  ],
  "totalNodes": ${recommendedNodes}
}`;
}

export function buildCheckpointFeedbackPrompt(input: CheckpointFeedbackInput): string {
  const deltaLines = Object.keys(input.currentScores).map((key) => {
    const original = input.originalScores[key] ?? 0;
    const current = input.currentScores[key] ?? 0;
    const delta = current - original;
    const sign = delta >= 0 ? "+" : "";
    return `  - ${key}: ${original} → ${current} (${sign}${delta})`;
  }).join("\n");

  const completedLines = input.completedNodes
    .map(n => `  - Component ${n.component} (${COMPONENT_LABELS[n.component] ?? `C${n.component}`}): ${n.focusArea}`)
    .join("\n");

  return `You are a PSC (Putonghua Proficiency Test) learning coach.

The student has completed Phase ${input.phaseNumber} of their personalized learning path. Provide encouraging, actionable feedback.

Score changes since the learning path began:
${deltaLines}

Nodes completed in this phase:
${completedLines}

RULES:
1. Respond in a mix of Chinese and English (bilingual feedback).
2. Keep the response to 3-5 sentences.
3. Highlight the biggest improvements and areas still needing work.
4. Suggest what to focus on in the next phase.
5. Be encouraging but honest about remaining weaknesses.

Respond with plain text feedback (no JSON, no markdown).`;
}

function parseCurriculumOutput(text: string): CurriculumOutput {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in curriculum response");

  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed.phases)) {
    throw new Error("Invalid curriculum format: missing phases array");
  }

  const phases: CurriculumPhase[] = parsed.phases.map((p: Record<string, unknown>) => ({
    phase: Number(p.phase),
    nodes: (p.nodes as Record<string, unknown>[]).map((n: Record<string, unknown>) => ({
      component: Number(n.component),
      focusArea: String(n.focusArea || "general"),
      focusDescription: String(n.focusDescription || ""),
      questionIds: Array.isArray(n.questionIds) ? n.questionIds.map(String) : [],
      estimatedMinutes: Number(n.estimatedMinutes) || 10,
    })),
  }));

  const totalNodes = phases.reduce((sum, p) => sum + p.nodes.length, 0);

  return { phases, totalNodes };
}

export async function generateCurriculum(input: CurriculumInput): Promise<CurriculumOutput> {
  const systemPrompt = buildCurriculumPrompt(input);
  const userPrompt = "Generate the personalized learning curriculum based on the above analysis.";

  const text = await retryWithBackoff(() =>
    chatCompletion(systemPrompt, userPrompt)
  );
  return parseCurriculumOutput(text);
}

export async function generateCheckpointFeedback(input: CheckpointFeedbackInput): Promise<string> {
  const systemPrompt = buildCheckpointFeedbackPrompt(input);
  const userPrompt = "Provide checkpoint feedback for this student based on the above data.";

  try {
    return await retryWithBackoff(() =>
      chatCompletion(systemPrompt, userPrompt)
    );
  } catch (error) {
    console.error("[AI] Checkpoint feedback generation failed after retries:", error);
    return "评估完成。请继续努力练习，加油！";
  }
}
