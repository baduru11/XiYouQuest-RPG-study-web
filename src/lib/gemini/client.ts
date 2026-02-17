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

