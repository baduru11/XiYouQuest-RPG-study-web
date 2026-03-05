import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quickCompletion } from "@/lib/gemini/client";
import { z } from "zod";

const schema = z.object({
  componentResults: z.array(z.object({
    componentNumber: z.number().int().min(1).max(5),
    score: z.number().min(0).max(100),
    wordScores: z.array(z.object({
      word: z.string(),
      score: z.number().nullable(),
    })).optional(),
    quizResults: z.array(z.object({
      question: z.string(),
      isCorrect: z.boolean(),
    })).optional(),
    sentenceScores: z.array(z.object({
      sentence: z.string(),
      score: z.number(),
    })).optional(),
    c5Detail: z.object({
      totalScore: z.number(),
      pronunciation: z.object({ score: z.number(), notes: z.string() }),
      vocabGrammar: z.object({ score: z.number(), notes: z.string() }),
      fluency: z.object({ score: z.number(), notes: z.string() }),
      transcript: z.string(),
    }).optional(),
  })).min(1).max(5),
  totalScore: z.number().min(0).max(100),
  grade: z.string().max(20),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { componentResults, totalScore, grade } = parsed.data;

    const systemPrompt = `You are an expert PSC (Putonghua Proficiency Test) coach giving personalized feedback after a mock exam. Write a concise, actionable analysis in English.

Structure your response in exactly 3 sections with these headers (use ** for bold):

**Strengths**
1-2 sentences on what went well. Reference specific components and scores.

**Areas for Improvement**
2-3 sentences identifying the weakest areas. Be specific — mention problem words, question types, or pronunciation patterns. If word scores are provided, call out the lowest-scoring ones.

**Study Plan**
2-3 sentences with a prioritized action plan. Suggest specific drills (e.g. "practice tone pairs for C1", "review measure words for C3"). Focus on what will improve the PSC grade the most.

Rules:
- English only. No emojis. No bullet points within sections.
- Reference components by name: C1=Monosyllabic Characters, C2=Multisyllabic Words, C3=Vocabulary & Grammar, C4=Passage Reading, C5=Prompted Speaking.
- Keep it tight — every sentence must add value. Total response under 200 words.
- Be encouraging but honest.`;

    // Build a condensed data summary for the prompt
    const summary = componentResults.map((cr) => {
      const parts: string[] = [`C${cr.componentNumber}: ${cr.score}/100`];
      if (cr.wordScores?.length) {
        const weak = cr.wordScores
          .filter((w) => w.score !== null && w.score < 70)
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
        if (weakSentences.length) parts.push(`weak passages: ${weakSentences.join(", ")}`);
      }
      if (cr.c5Detail) {
        parts.push(`pronunciation:${cr.c5Detail.pronunciation.score} vocab:${cr.c5Detail.vocabGrammar.score} fluency:${cr.c5Detail.fluency.score}`);
        if (cr.c5Detail.pronunciation.notes) parts.push(`notes: ${cr.c5Detail.pronunciation.notes}`);
      }
      return parts.join(" | ");
    });

    const userPrompt = `Mock exam results — Total: ${totalScore}/100, Grade: ${grade}\n${summary.join("\n")}`;

    const feedback = await quickCompletion(systemPrompt, userPrompt, 500);

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Mock exam feedback error:", error instanceof Error ? error.message : error);
    return NextResponse.json({
      feedback: null,
    });
  }
}
