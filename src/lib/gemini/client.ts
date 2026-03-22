import { OPENROUTER_API_KEY } from "@/lib/env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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
  fallbackFn?: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) {
        if (fallbackFn) {
          console.log(`[AI] Primary model exhausted ${retries + 1} attempts, trying fallback...`);
          return await fallbackFn();
        }
        throw error;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`[AI] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

const FETCH_TIMEOUT_MS = 120_000;

async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; model?: string },
): Promise<string> {
  const model = options?.model ?? MODEL;
  const start = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: options?.temperature ?? 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  console.log(`[AI] chatCompletion (${model}) responded in ${Date.now() - start}ms, status ${res.status}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from OpenRouter");
  return text;
}

// ---------- Quick Completion (lightweight, no retries) ----------

const FALLBACK_MODEL = "minimax/minimax-m2.5";

async function fetchCompletion(model: string, systemPrompt: string, userPrompt: string, timeoutMs: number, maxTokens = 400): Promise<string> {
  const start = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${model} error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  console.log(`[AI] quickCompletion (${model}) ok in ${Date.now() - start}ms, length=${content.length}`);
  if (!content) console.warn(`[AI] quickCompletion empty response:`, JSON.stringify(data).slice(0, 500));
  return content;
}

export async function quickCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 400,
): Promise<string> {
  // Try primary model twice with 2min timeout, then fallback model once
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchCompletion(MODEL, systemPrompt, userPrompt, 120_000, maxTokens);
    } catch (err) {
      const cause = err instanceof Error && 'cause' in err ? ` cause=${(err.cause as Error)?.message ?? err.cause}` : '';
      console.warn(`[AI] quickCompletion attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : err}${cause}`);
    }
  }
  // Final attempt with fallback model
  try {
    console.log(`[AI] quickCompletion falling back to ${FALLBACK_MODEL}`);
    return await fetchCompletion(FALLBACK_MODEL, systemPrompt, userPrompt, 120_000, maxTokens);
  } catch (err) {
    const cause = err instanceof Error && 'cause' in err ? ` cause=${(err.cause as Error)?.message ?? err.cause}` : '';
    console.warn(`[AI] quickCompletion fallback failed: ${err instanceof Error ? err.message : err}${cause}`);
  }
  throw new Error("All quickCompletion attempts failed");
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
    const text = await retryWithBackoff(
      () => chatCompletion(C5_ANALYSIS_SYSTEM_PROMPT, userPrompt),
      MAX_RETRIES,
      () => chatCompletion(C5_ANALYSIS_SYSTEM_PROMPT, userPrompt, { model: FALLBACK_MODEL }),
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
    return await retryWithBackoff(
      () => chatCompletion(systemPrompt, userPrompt),
      MAX_RETRIES,
      () => chatCompletion(systemPrompt, userPrompt, { model: FALLBACK_MODEL }),
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
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (
        (parsed.type === "reply" || parsed.type === "redirect") &&
        typeof parsed.content === "string"
      ) {
        return { type: parsed.type, content: parsed.content };
      }
    } catch {
      // JSON.parse failed — likely unescaped quotes in content value.
      // Extract content manually by anchoring to the known envelope structure.
      const raw = jsonMatch[0];
      const marker = '"content"';
      const markerIdx = raw.indexOf(marker);
      if (markerIdx !== -1) {
        // Find the opening quote of the value (skip `"content" : "`)
        const openQuote = raw.indexOf('"', markerIdx + marker.length);
        // Find the closing `"}` at the very end
        const closeQuote = raw.lastIndexOf('"}');
        if (openQuote !== -1 && closeQuote > openQuote) {
          const content = raw.substring(openQuote + 1, closeQuote);
          const typeMatch = raw.match(/"type"\s*:\s*"(reply|redirect)"/);
          const type = (typeMatch?.[1] as "reply" | "redirect") ?? "reply";
          return { type, content };
        }
      }
    }
  }
  return { type: "reply", content: text };
}

export async function chatConversation(
  messages: ChatTurnMessage[],
  opts?: { maxTokens?: number },
): Promise<ChatResponseEnvelope> {
  try {
    const doFetch = async (model: string) => {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts?.maxTokens ?? 4096,
          messages,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${body}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from OpenRouter");
      return text;
    };
    const raw = await retryWithBackoff(
      () => doFetch(MODEL),
      MAX_RETRIES,
      () => doFetch(FALLBACK_MODEL),
    );
    return parseChatResponse(raw);
  } catch (error) {
    console.error("[AI] Chat conversation failed after retries:", error);
    return { type: "reply", content: "抱歉，我现在有点走神了。你刚才说什么？" };
  }
}

// ---------- Personalized Learning Path ----------

export interface PhaseGenerationInput {
  scores: Record<string, number>;
  daysRemaining: number;
  phaseNumber: number;
  totalCheckpoints: number;
  availableQuestionCounts: Record<number, number>;
  previousPhases?: {
    phaseNumber: number;
    scores: Record<string, number>;
    completedNodes: { component: number; focusArea: string }[];
  }[];
}

export interface CurriculumNode {
  component: number;
  focusArea: string;
  focusDescription: string;
  questionCount: number;
  estimatedMinutes: number;
}

export interface PhaseGenerationOutput {
  analysis: string;
  nodes: CurriculumNode[];
}

// Legacy aliases for backward compatibility with tests
export type CurriculumInput = PhaseGenerationInput;

const COMPONENT_LABELS: Record<number, string> = {
  1: "C1 单音节字词 (Single-syllable words)",
  2: "C2 多音节词语 (Multi-syllable words)",
  3: "C3 朗读短文 (Passage reading)",
  4: "C4 选择判断 (Multiple choice)",
  5: "C5 命题说话 (Prompted speaking)",
  6: "C6 声调辨识 (Tone identification)",
  7: "C7 拼音拼读 (Pinyin reading)",
};

/** How many mid-assessment checkpoints based on days remaining */
export function calculateTotalCheckpoints(daysRemaining: number): number {
  if (daysRemaining <= 21) return 2;
  return 3;
}

export function buildPhasePrompt(input: PhaseGenerationInput): string {
  const totalPhases = input.totalCheckpoints + 1; // phases = checkpoints + 1 (final phase after last checkpoint)
  // Scale drills to preparation time: ~2 nodes per day of study, split across phases
  // Minimum 6 nodes, maximum 20 per phase to keep each phase substantial but manageable
  const totalNodes = Math.min(60, Math.max(18, Math.round(input.daysRemaining * 2)));
  const nodesPerPhase = Math.min(20, Math.max(6, Math.round(totalNodes / totalPhases)));

  const scoreLines = Object.entries(input.scores)
    .map(([key, val]) => `  - ${key}: ${val}/100`)
    .join("\n");

  const availableLines = Object.entries(input.availableQuestionCounts)
    .map(([comp, count]) => `  - Component ${comp} (${COMPONENT_LABELS[Number(comp)] ?? `C${comp}`}): ${count} questions available`)
    .join("\n");

  const historySection = input.previousPhases && input.previousPhases.length > 0
    ? `\nPrevious phase history:\n${input.previousPhases.map((pp) => {
        const ppScores = Object.entries(pp.scores).map(([k, v]) => `${k}: ${v}`).join(", ");
        const ppNodes = pp.completedNodes.map(n => `C${n.component}/${n.focusArea}`).join(", ");
        return `  Phase ${pp.phaseNumber}: Scores [${ppScores}], Practiced [${ppNodes}]`;
      }).join("\n")}`
    : "";

  const isFirstPhase = input.phaseNumber === 1;
  const contextLine = isFirstPhase
    ? "This is the INITIAL phase. Analyze the student's diagnostic scores to identify weaknesses."
    : `This is Phase ${input.phaseNumber} of ${totalPhases}. The student just completed a mid-assessment. Analyze score changes and adapt the curriculum.`;

  return `You are a PSC (Putonghua Proficiency Test) curriculum designer AI.

${contextLine}

Student's current scores:
${scoreLines}

Days remaining until test: ${input.daysRemaining}
Phase ${input.phaseNumber} of ${totalPhases} total phases (${input.totalCheckpoints} mid-assessments planned).
Target nodes for this phase: ${nodesPerPhase}

Available question bank:
${availableLines}
${historySection}

Generate TWO things:
1. "analysis": An English-only analysis (3-5 sentences) covering:
   - Which components are weakest and need the most focus
   - What this phase's curriculum will target and why
   - Strategy/advice for the student
2. "nodes": An array of ${nodesPerPhase} practice nodes for THIS phase only.

RULES:
- Each node: component (1-7), focusArea (short label), focusDescription (1 sentence), questionCount (5-15).
- Prioritize components with the lowest scores — assign MORE nodes and higher questionCount to weak areas.
- C1 and C2 (pronunciation) should have the most questions since they need repetitive drilling.
- Cover ALL 7 components across the phase — don't skip any component entirely.
- Do NOT exceed available question counts per component.
- After this phase, the student will take a mid-assessment before the next phase is generated.

Respond with ONLY a valid JSON object (no markdown, no code fences):
{
  "analysis": "Your weakest areas are C3 and C1. This phase focuses on improving passage reading fluency and tone accuracy...",
  "nodes": [
    {
      "component": 1,
      "focusArea": "tone_accuracy",
      "focusDescription": "Practice first and second tone distinctions",
      "questionCount": 10
    }
  ]
}`;
}

// Keep old name as alias for tests
export const buildCurriculumPrompt = buildPhasePrompt;

export function buildCheckpointFeedbackPrompt(input: {
  originalScores: Record<string, number>;
  currentScores: Record<string, number>;
  completedNodes: { component: number; focusArea: string }[];
  phaseNumber: number;
}): string {
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

// Seconds per question by component (realistic timing)
const SECS_PER_Q: Record<number, number> = {
  1: 5,   // single char pronunciation
  2: 5,   // multi-syllable words
  3: 15,  // MCQ reading
  4: 30,  // passage reading
  5: 60,  // speaking/topic
  6: 5,   // Cantonese drills
  7: 10,  // tongue twisters
};

function estimateMinutes(component: number, questionCount: number): number {
  const secs = (SECS_PER_Q[component] ?? 10) * questionCount;
  return Math.max(1, Math.ceil(secs / 60));
}

function parsePhaseOutput(text: string): PhaseGenerationOutput {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in phase response");

  const parsed = JSON.parse(jsonMatch[0]);

  const analysis = String(parsed.analysis || "分析生成中... Analysis pending.");
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];

  const nodes: CurriculumNode[] = rawNodes.map((n: Record<string, unknown>) => ({
    component: Math.min(7, Math.max(1, Number(n.component) || 1)),
    focusArea: String(n.focusArea || "general"),
    focusDescription: String(n.focusDescription || ""),
    questionCount: Math.min(15, Math.max(1, Number(n.questionCount) || 8)),
    estimatedMinutes: estimateMinutes(Math.min(7, Math.max(1, Number(n.component) || 1)), Math.min(15, Math.max(1, Number(n.questionCount) || 8))),
  }));

  return { analysis, nodes };
}

export async function generatePhase(input: PhaseGenerationInput): Promise<PhaseGenerationOutput> {
  const systemPrompt = buildPhasePrompt(input);
  const userPrompt = "Generate the analysis and curriculum nodes for this phase.";

  console.log(`[AI] Phase ${input.phaseNumber} prompt size: ${systemPrompt.length} chars`);
  try {
    const text = await retryWithBackoff(
      () => chatCompletion(systemPrompt, userPrompt, { temperature: 0.7 }),
      1,
      () => chatCompletion(systemPrompt, userPrompt, { temperature: 0.7, model: FALLBACK_MODEL }),
    );
    console.log(`[AI] Phase ${input.phaseNumber} response size: ${text.length} chars`);
    return parsePhaseOutput(text);
  } catch (error) {
    console.error("[AI] Phase generation failed:", error instanceof Error ? error.message : error);
    throw new Error("AI curriculum generation temporarily unavailable. Please try again.");
  }
}

export async function generateCheckpointFeedback(input: {
  originalScores: Record<string, number>;
  currentScores: Record<string, number>;
  completedNodes: { component: number; focusArea: string }[];
  phaseNumber: number;
}): Promise<string> {
  const systemPrompt = buildCheckpointFeedbackPrompt(input);
  const userPrompt = "Provide checkpoint feedback for this student based on the above data.";

  try {
    return await retryWithBackoff(
      () => chatCompletion(systemPrompt, userPrompt),
      MAX_RETRIES,
      () => chatCompletion(systemPrompt, userPrompt, { model: FALLBACK_MODEL }),
    );
  } catch (error) {
    console.error("[AI] Checkpoint feedback generation failed after retries:", error);
    return "评估完成。请继续努力练习，加油！";
  }
}
