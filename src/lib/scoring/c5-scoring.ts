/**
 * PSC Component 5 (命题说话) scoring module.
 *
 * Implements the official PSC C5 rubric:
 *   Total: 30 points = 20 pronunciation + 5 vocab/grammar + 5 fluency - time penalty
 *
 * Pronunciation (20 pts): 6 levels based on error count & dialect presence from ISE
 * Vocab/Grammar (5 pts): 3 levels from Gemini analysis
 * Fluency (5 pts): 3 levels from Gemini analysis
 * Time penalty: based on spoken duration
 */

import type { PronunciationAssessmentResult } from "@/lib/iflytek-speech/client";
import type { GeminiC5Analysis } from "@/lib/gemini/client";

export interface C5AssessmentResult {
  pronunciation: {
    score: number;
    deduction: number;
    level: number;
    label: string;
    notes: string;
  };
  vocabGrammar: {
    score: number;
    deduction: number;
    level: number;
    label: string;
    notes: string;
  };
  fluency: {
    score: number;
    deduction: number;
    level: number;
    label: string;
    notes: string;
  };
  timePenalty: number;
  totalScore: number; // 0-30
  normalizedScore: number; // 0-100
  transcript: string;
  errorCount: number;
}

// ---------- Pronunciation scoring (20 pts) ----------

interface PronLevel {
  level: number;
  label: string;
  deductionRange: [number, number];
}

const PRON_LEVELS: PronLevel[] = [
  { level: 1, label: "一档", deductionRange: [0, 1] },
  { level: 2, label: "二档", deductionRange: [1.5, 2] },
  { level: 3, label: "三档", deductionRange: [3, 4] },
  { level: 4, label: "四档", deductionRange: [5, 6] },
  { level: 5, label: "五档", deductionRange: [7, 9] },
  { level: 6, label: "六档", deductionRange: [10, 12] },
];

/**
 * Determine pronunciation level from error count and dialect indicators.
 * Uses ISE pronunciationScore (0-100) to interpolate within the matched level.
 */
function scorePronunciation(
  iseResult: PronunciationAssessmentResult
): { score: number; deduction: number; level: number; label: string; notes: string } {
  const errorCount = iseResult.words.filter((w) => w.errorType !== "None").length;
  const totalWords = iseResult.words.length;

  // Detect dialect presence via average tone score
  // Low average tone = likely dialect influence
  const toneScores = iseResult.words
    .filter((w) => w.toneScore !== undefined)
    .map((w) => w.toneScore!);
  const avgTone = toneScores.length > 0
    ? toneScores.reduce((a, b) => a + b, 0) / toneScores.length
    : 80;

  const hasDialect = avgTone < 60;
  const hasHeavyDialect = avgTone < 40;

  // Determine level
  let matchedLevel: PronLevel;
  const notes: string[] = [];

  if (errorCount < 3 && !hasDialect) {
    matchedLevel = PRON_LEVELS[0]; // 一档
    notes.push(`${errorCount} errors, no dialect detected`);
  } else if (errorCount < 10 && !hasDialect) {
    matchedLevel = PRON_LEVELS[1]; // 二档
    notes.push(`${errorCount} errors, no obvious dialect`);
  } else if ((errorCount < 10 && hasDialect) || (errorCount >= 10 && errorCount <= 15 && !hasDialect)) {
    matchedLevel = PRON_LEVELS[2]; // 三档
    notes.push(`${errorCount} errors${hasDialect ? ", some dialect detected" : ""}`);
  } else if (errorCount >= 10 && errorCount <= 15 && hasDialect) {
    matchedLevel = PRON_LEVELS[3]; // 四档
    notes.push(`${errorCount} errors, obvious dialect`);
  } else if (errorCount > 15 && !hasHeavyDialect) {
    matchedLevel = PRON_LEVELS[4]; // 五档
    notes.push(`${errorCount} errors, obvious dialect influence`);
  } else {
    matchedLevel = PRON_LEVELS[5]; // 六档
    notes.push(`${errorCount} errors, heavy dialect influence`);
  }

  // Interpolate within level using ISE pronunciationScore (0-100)
  const pronScore = iseResult.pronunciationScore;
  const [minDeduct, maxDeduct] = matchedLevel.deductionRange;

  // Higher ISE score → lower deduction (closer to minDeduct)
  const t = Math.max(0, Math.min(1, pronScore / 100));
  const deduction = Math.round((maxDeduct - (maxDeduct - minDeduct) * t) * 10) / 10;

  if (totalWords > 0) {
    notes.push(`${totalWords} words evaluated`);
  }

  return {
    score: Math.round((20 - deduction) * 10) / 10,
    deduction,
    level: matchedLevel.level,
    label: matchedLevel.label,
    notes: notes.join("; "),
  };
}

// ---------- Vocab/Grammar scoring (5 pts) ----------

function scoreVocabGrammar(
  geminiAnalysis: GeminiC5Analysis
): { score: number; deduction: number; level: number; label: string; notes: string } {
  const level = geminiAnalysis.vocabularyLevel;
  let deduction: number;
  let label: string;

  switch (level) {
    case 1:
      deduction = 0;
      label = "一档";
      break;
    case 2:
      deduction = 1;
      label = "二档";
      break;
    case 3:
      deduction = 3;
      label = "三档";
      break;
    default:
      deduction = 1;
      label = "二档";
  }

  return {
    score: Math.round((5 - deduction) * 10) / 10,
    deduction,
    level,
    label,
    notes: geminiAnalysis.vocabularyNotes,
  };
}

// ---------- Fluency scoring (5 pts) ----------

/**
 * Use ISE's audio-based fluencyScore (0-100) as primary signal.
 * ISE analyses actual pauses, rhythm, and pacing from audio.
 *
 * For C5 free-form speaking, the ASR transcript used as reference text may
 * have artifacts that cause ISE to return fluencyScore=0. In that case,
 * fall back to ISE totalScore (pronunciationScore) as a proxy, or to
 * Gemini's text-based fluency level.
 */
function scoreFluency(
  iseResult: PronunciationAssessmentResult,
  geminiAnalysis: GeminiC5Analysis,
): { score: number; deduction: number; level: number; label: string; notes: string } {
  // Use ISE fluency if available, otherwise fall back to ISE total score
  let effectiveScore = iseResult.fluencyScore;
  let source = "ISE fluency";

  if (effectiveScore <= 0 && iseResult.pronunciationScore > 0) {
    effectiveScore = iseResult.pronunciationScore;
    source = "ISE total (fluency unavailable)";
  }

  // If ISE gives nothing useful, fall back to Gemini
  if (effectiveScore <= 0) {
    const gemLevel = geminiAnalysis.fluencyLevel;
    const deduction = gemLevel === 1 ? 0 : gemLevel === 2 ? 1 : 3;
    return {
      score: Math.round((5 - deduction) * 10) / 10,
      deduction,
      level: gemLevel,
      label: gemLevel === 1 ? "一档" : gemLevel === 2 ? "二档" : "三档",
      notes: `Gemini fluency: ${geminiAnalysis.fluencyNotes}`,
    };
  }

  let score: number;
  if (effectiveScore >= 90) score = 5;
  else if (effectiveScore >= 80) score = 4;
  else if (effectiveScore >= 60) score = 3;
  else if (effectiveScore >= 50) score = 2;
  else if (effectiveScore >= 30) score = 1;
  else score = 0;

  const deduction = 5 - score;

  return {
    score,
    deduction,
    level: deduction === 0 ? 1 : deduction <= 1 ? 2 : 3,
    label: deduction === 0 ? "一档" : deduction <= 1 ? "二档" : "三档",
    notes: `${source}: ${effectiveScore}/100`,
  };
}

// ---------- Time penalty ----------

/** -1 point for each second under 3 minutes, capped at 30 (the total C5 score). */
function calculateTimePenalty(spokenDurationSeconds: number): number {
  if (spokenDurationSeconds >= 180) return 0;
  return Math.min(30, 180 - Math.floor(spokenDurationSeconds));
}

// ---------- Main scoring function ----------

export function calculateC5Score(params: {
  iseResult: PronunciationAssessmentResult;
  geminiAnalysis: GeminiC5Analysis;
  spokenDurationSeconds: number;
  transcript: string;
}): C5AssessmentResult {
  const { iseResult, geminiAnalysis, spokenDurationSeconds, transcript } = params;

  const pronunciation = scorePronunciation(iseResult);
  const vocabGrammar = scoreVocabGrammar(geminiAnalysis);
  const fluency = scoreFluency(iseResult, geminiAnalysis);
  const timePenalty = calculateTimePenalty(spokenDurationSeconds);

  const errorCount = iseResult.words.filter((w) => w.errorType !== "None").length;

  const rawTotal =
    (20 - pronunciation.deduction) +
    (5 - vocabGrammar.deduction) +
    (5 - fluency.deduction) -
    timePenalty;

  const totalScore = Math.round(Math.max(0, Math.min(30, rawTotal)) * 10) / 10;
  const normalizedScore = Math.round((totalScore / 30) * 100);

  return {
    pronunciation,
    vocabGrammar,
    fluency,
    timePenalty,
    totalScore,
    normalizedScore,
    transcript,
    errorCount,
  };
}
