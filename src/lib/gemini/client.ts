import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY } from "@/lib/env";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
      console.warn(`[Gemini] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
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
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const userPrompt = `Topic: "${params.topic}"

Transcript of the student's 3-minute prompted speaking:
"""
${params.transcript}
"""

Analyze this speaking sample according to the PSC C5 rubric.`;

  try {
    const result = await retryWithBackoff(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: C5_ANALYSIS_SYSTEM_PROMPT,
      })
    );
    return parseC5Analysis(result.response.text());
  } catch (error) {
    console.error("[Gemini] C5 analysis failed after retries:", error);
    // Fallback to Level 2 defaults
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
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const systemPrompt = `${params.characterPrompt}

You are helping a student practice for the PSC (Putonghua Proficiency Test), Component ${params.component}.
Respond in a mix of Chinese and English as appropriate. Keep responses under 3 sentences.
Include the character's personality in your response.`;

  const userPrompt = params.pronunciationScore !== undefined
    ? `The student was asked to pronounce: "${params.questionText}"
Their pronunciation score was ${params.pronunciationScore}/100.
${params.isCorrect ? "They did well!" : "They need improvement."}
Give brief, specific feedback on their pronunciation.`
    : `The question was: "${params.questionText}"
The student answered: "${params.userAnswer}"
${params.isCorrect ? "They got it right!" : "They got it wrong."}
Give brief feedback.`;

  try {
    const result = await retryWithBackoff(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: systemPrompt,
      })
    );
    return result.response.text();
  } catch (error) {
    console.error("[Gemini] Feedback generation failed after retries:", error);
    return getFallbackMessage(params.isCorrect);
  }
}

