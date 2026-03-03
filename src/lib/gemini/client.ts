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
}) {
  const systemPrompt = `You ARE the following character. Stay fully in character at all times — use their speech patterns, catchphrases, metaphors, and personality traits in every response. Never break character.

${params.characterPrompt}

CONTEXT: The student is practicing for the PSC (Putonghua Proficiency Test), Component ${params.component}.
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
