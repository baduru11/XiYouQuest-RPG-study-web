import { z } from "npm:zod";
import {
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { verifyUser } from "../_shared/verify-jwt.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { quickCompletion } from "../_shared/ai-client.ts";
import {
  hasConsistentMockExamTotal,
  normalizeMockExamResult,
} from "../_shared/mock-exam-contract.ts";

const schema = z.object({
  componentResults: z
    .array(
      z.object({
        componentNumber: z.number().int().min(1).max(5),
        score: z.number().min(0).max(100),
    scoreVersion: z.enum(["psc-2021-v2", "psc-2021-v1", "legacy-five-component-v1"]),
        wordScores: z
          .array(
            z.object({
              word: z.string(),
              score: z.number().nullable(),
            }),
          )
          .optional(),
        quizResults: z
          .array(
            z.object({
              question: z.string(),
              isCorrect: z.boolean(),
            }),
          )
          .optional(),
        sentenceScores: z
          .array(
            z.object({
              sentence: z.string(),
              score: z.number(),
            }),
          )
          .optional(),
        c5Detail: z
          .object({
            totalScore: z.number(),
            pronunciation: z.object({
              score: z.number(),
              notes: z.string(),
            }),
            vocabGrammar: z.object({
              score: z.number(),
              notes: z.string(),
            }),
            fluency: z.object({ score: z.number(), notes: z.string() }),
          })
          .strict()
          .optional(),
      }),
    )
    .min(1)
    .max(5),
  totalScore: z.number().min(0).max(100),
  practiceBand: z.string().max(20),
  scoreVersion: z.enum(["psc-2021-v2", "psc-2021-v1", "legacy-five-component-v1"]),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const user = await verifyUser(req);
  if (!user) return errorResponse("Unauthorized", 401);

  const limited = await enforceRateLimit(user.id, "ai-text");
  if (limited) return limited;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input", 400);
    }

    const { componentResults, totalScore, scoreVersion } = parsed.data;
    const normalizedResult = normalizeMockExamResult(scoreVersion, componentResults);
    if (!normalizedResult || !hasConsistentMockExamTotal(totalScore, normalizedResult)) {
      return errorResponse("Invalid scoring contract", 400);
    }
    const practiceBand = getPracticeBand(normalizedResult.totalScore);
    const componentNames = scoreVersion === "psc-2021-v1"
      ? "C1=Monosyllabic Characters, C2=Multisyllabic Words, C3=Passage Reading, C4=Prompted Speaking"
      : "C1=Monosyllabic Characters, C2=Multisyllabic Words, C3=Selection & Judgment, C4=Passage Reading, C5=Prompted Speaking";

    const systemPrompt = `You are a XiYouQuest PSC-aligned practice coach giving personalized feedback after a mock exam. Write a concise, actionable analysis in English.

Structure your response in exactly 3 sections with these headers (use ** for bold):

**Strengths**
1-2 sentences on what went well. Reference specific components and scores.

**Areas for Improvement**
2-3 sentences identifying the weakest areas. Be specific â€” mention problem words, question types, or pronunciation patterns. If word scores are provided, call out the lowest-scoring ones.

**Study Plan**
2-3 sentences with a prioritized action plan. Suggest specific drills (e.g. "practice tone pairs for C1", "review measure words for C3"). Focus on what will improve the learner's XiYouQuest practice performance.

Rules:
- English only. No emojis. No bullet points within sections.
- Reference components by name: ${componentNames}.
- Keep it tight â€” every sentence must add value. Total response under 200 words.
- Be encouraging but honest.
- Treat every score and practice band as XiYouQuest feedback only. Never claim, predict, or imply an official PSC result, grade, certification, eligibility, or policy decision.`;

    const summary = componentResults.map((cr) => {
      const parts: string[] = [`C${cr.componentNumber}: ${cr.score}/100`];
      if (cr.wordScores?.length) {
        const weak = cr.wordScores
          .filter((w) => w.score !== null && w.score! < 70)
          .slice(0, 5)
          .map((w) => `${w.word}(${w.score})`);
        if (weak.length) parts.push(`weak: ${weak.join(", ")}`);
      }
      if (cr.quizResults?.length) {
        const wrong = cr.quizResults.filter((q) => !q.isCorrect).length;
        parts.push(`${wrong}/${cr.quizResults.length} wrong`);
      }
      if (cr.sentenceScores?.length) {
        const weakSentences = cr.sentenceScores
          .filter((s) => s.score < 70)
          .slice(0, 3)
          .map((s) => `"${s.sentence.slice(0, 20)}..."(${s.score})`);
        if (weakSentences.length)
          parts.push(`weak passages: ${weakSentences.join(", ")}`);
      }
      if (cr.c5Detail) {
        parts.push(
          `pronunciation:${cr.c5Detail.pronunciation.score} vocab:${cr.c5Detail.vocabGrammar.score} fluency:${cr.c5Detail.fluency.score}`,
        );
        if (cr.c5Detail.pronunciation.notes)
          parts.push(`notes: ${cr.c5Detail.pronunciation.notes}`);
      }
      return parts.join(" | ");
    });

    const userPrompt = `XiYouQuest mock-practice results â€” Total: ${normalizedResult.totalScore}/100, Practice band: ${practiceBand}\n${summary.join("\n")}`;

    const feedback = await quickCompletion(systemPrompt, userPrompt, 500);

    return jsonResponse({ feedback });
  } catch (error) {
    console.error(
      "[ai-mock-exam-feedback] Error:",
      error instanceof Error ? error.message : error,
    );
    return jsonResponse({ feedback: null });
  }
});

function getPracticeBand(score: number): string {
  if (score >= 97) return "Mastery";
  if (score >= 92) return "Advanced";
  if (score >= 87) return "Strong";
  if (score >= 80) return "Proficient";
  if (score >= 70) return "Developing";
  if (score >= 60) return "Foundation";
  return "Starting point";
}
