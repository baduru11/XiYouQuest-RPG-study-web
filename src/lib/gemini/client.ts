import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY } from "@/lib/env";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: systemPrompt,
    });
    return result.response.text();
  } catch (error) {
    console.error("[Gemini] Feedback generation failed:", error);
    return params.isCorrect
      ? "做得好！继续加油！ Nice work, keep it up!"
      : "再试一次吧！Practice makes perfect!";
  }
}

export async function generateQuestions(params: {
  component: number;
  count: number;
  difficulty?: string;
}) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Generate ${params.count} PSC (Putonghua Proficiency Test) practice questions for Component ${params.component}.
${params.difficulty ? `Difficulty: ${params.difficulty}` : ""}
Return as JSON array. Each item should have: content (the word/sentence), pinyin (if applicable).
Only return valid JSON, no markdown.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      // Strip markdown code fences if present
      const jsonText = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      return JSON.parse(jsonText);
    } catch (error) {
      console.error(`[Gemini] Question generation attempt ${attempt + 1} failed:`, error);
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error("Question generation failed after 3 attempts");
}
