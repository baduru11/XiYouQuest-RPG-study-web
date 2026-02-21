"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import { randomizeAnswerPositions } from "@/lib/utils";
import { encodeWAV } from "@/lib/audio-utils";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/practice/audio-recorder";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { useAchievementToast } from "@/components/shared/achievement-toast";
import type { QuizQuestion } from "@/types/practice";
import type { UnlockedAchievement } from "@/lib/achievements/types";

// ============================================================
// Hardcoded question subsets for the mock exam
// ============================================================

// C3: 25 questions — 10 word-choice + 10 measure-word + 5 sentence-order (matches real PSC)
const EXAM_QUIZ_QUESTIONS: QuizQuestion[] = [
  // Part A: Word Selection (词语判断) — 10 items, 0.25 pts each
  { id: "wc1", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["工作", "返工"], correctIndex: 0, explanation: "'工作' is standard Putonghua. '返工' is Cantonese." },
  { id: "wc2", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["现在", "而家"], correctIndex: 0, explanation: "'现在' is standard. '而家' is Cantonese for 'now'." },
  { id: "wc3", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["不要", "唔好"], correctIndex: 0, explanation: "'不要' is standard. '唔好' is Cantonese." },
  { id: "wc4", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["聊天", "吹水"], correctIndex: 0, explanation: "'聊天' is standard. '吹水' is Cantonese slang." },
  { id: "wc5", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["下雨", "落雨"], correctIndex: 0, explanation: "'下雨' is standard. '落雨' is dialectal." },
  { id: "wc6", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["喜欢", "中意"], correctIndex: 0, explanation: "'喜欢' is standard. '中意' is Cantonese/dialectal for 'like'." },
  { id: "wc7", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["明天", "听日"], correctIndex: 0, explanation: "'明天' is standard. '听日' is Cantonese for 'tomorrow'." },
  { id: "wc8", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["怎么", "点解"], correctIndex: 0, explanation: "'怎么' is standard. '点解' is Cantonese for 'why'." },
  { id: "wc9", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["快点", "快啲"], correctIndex: 0, explanation: "'快点' is standard. '快啲' is Cantonese." },
  { id: "wc10", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["东西", "嘢"], correctIndex: 0, explanation: "'东西' is standard. '嘢' is Cantonese for 'thing'." },
  // Part B: Measure Words (量词搭配) — 10 items, 0.5 pts each
  { id: "mw1", type: "measure-word", prompt: "一___桌子", options: ["张", "个", "把", "条"], correctIndex: 0, explanation: "桌子 uses 张 as its measure word (flat surfaces)." },
  { id: "mw2", type: "measure-word", prompt: "一___书", options: ["本", "张", "个", "片"], correctIndex: 0, explanation: "书 uses 本 as its measure word (books/volumes)." },
  { id: "mw3", type: "measure-word", prompt: "一___椅子", options: ["把", "个", "张", "条"], correctIndex: 0, explanation: "椅子 uses 把 as its measure word (objects with handles)." },
  { id: "mw4", type: "measure-word", prompt: "三___狗", options: ["只", "个", "头", "条"], correctIndex: 0, explanation: "狗 uses 只 as its measure word (small animals)." },
  { id: "mw5", type: "measure-word", prompt: "两___纸", options: ["张", "个", "片", "本"], correctIndex: 0, explanation: "纸 uses 张 as its measure word (flat objects)." },
  { id: "mw6", type: "measure-word", prompt: "一___花", options: ["朵", "个", "支", "片"], correctIndex: 0, explanation: "花 uses 朵 as its measure word (flowers/clouds)." },
  { id: "mw7", type: "measure-word", prompt: "一___车", options: ["辆", "个", "台", "部"], correctIndex: 0, explanation: "车 uses 辆 as its measure word (vehicles)." },
  { id: "mw8", type: "measure-word", prompt: "五___房间", options: ["间", "个", "座", "栋"], correctIndex: 0, explanation: "房间 uses 间 as its measure word (rooms)." },
  { id: "mw9", type: "measure-word", prompt: "一___衣服", options: ["件", "个", "条", "套"], correctIndex: 0, explanation: "衣服 uses 件 as its measure word (items of clothing)." },
  { id: "mw10", type: "measure-word", prompt: "一___马", options: ["匹", "只", "头", "个"], correctIndex: 0, explanation: "马 uses 匹 as its measure word (horses)." },
  // Part C: Grammar (语序判断) — 5 items, 0.5 pts each
  { id: "so1", type: "sentence-order", prompt: "Which sentence is correct?", options: ["我把书放在桌子上。", "我放在桌子上把书。"], correctIndex: 0, explanation: "The 把 structure requires: Subject + 把 + Object + Verb + Complement." },
  { id: "so2", type: "sentence-order", prompt: "Which sentence is correct?", options: ["因为下雨，所以我没去。", "虽然下雨，所以我没去。"], correctIndex: 0, explanation: "'因为...所以...' is the correct paired conjunction." },
  { id: "so3", type: "sentence-order", prompt: "Which sentence is correct?", options: ["虽然很累，但是我还得工作。", "虽然很累，所以我还得工作。"], correctIndex: 0, explanation: "'虽然...但是...' is the correct concessive conjunction pair." },
  { id: "so4", type: "sentence-order", prompt: "Which sentence is correct?", options: ["我喝了一杯茶。", "我喝茶了一杯。"], correctIndex: 0, explanation: "Verb + 了 + quantity + object is the correct word order." },
  { id: "so5", type: "sentence-order", prompt: "Which sentence is correct?", options: ["他是一个很好的医生。", "他是一个医生很好。"], correctIndex: 0, explanation: "Adjective + 的 + noun is the correct attributive structure." },
];

const EXAM_PASSAGE = {
  id: "1",
  title: "\u7236\u4EB2\u7684\u7231",
  content: "\u5728\u6211\u7684\u8BB0\u5FC6\u4E2D\uFF0C\u7236\u4EB2\u662F\u4E00\u4E2A\u4E25\u8083\u800C\u6C89\u9ED8\u7684\u4EBA\u3002\u4ED6\u5F88\u5C11\u8BF4\u8BDD\uFF0C\u4F46\u4ED6\u7528\u884C\u52A8\u8868\u8FBE\u4ED6\u5BF9\u6211\u4EEC\u7684\u5173\u7231\u3002\u8BB0\u5F97\u6709\u4E00\u6B21\uFF0C\u6211\u5728\u5B66\u6821\u91CC\u611F\u5230\u5F88\u6CA5\u4E27\uFF0C\u56E0\u4E3A\u6211\u7684\u6210\u7EE9\u4E0D\u592A\u7406\u60F3\u3002\u6211\u6709\u70B9\u513F\u5BB3\u6015\u544A\u8BC9\u7236\u4EB2\u8FD9\u4E2A\u574F\u6D88\u606F\u3002\u4F46\u662F\uFF0C\u5F53\u6211\u9F13\u8D77\u52C7\u6C14\u5411\u4ED6\u5766\u767D\u65F6\uFF0C\u4ED6\u6CA1\u6709\u8D23\u9A82\u6211\uFF0C\u53CD\u800C\u7ED9\u4E86\u6211\u9F13\u52B1\u548C\u652F\u6301\u3002\u4ED6\u8BF4\uFF1A\u201C\u4E00\u65F6\u7684\u5931\u8D25\u4E0D\u4EE3\u8868\u6C38\u4E45\u7684\u5931\u8D25\uFF0C\u91CD\u8981\u7684\u662F\u4F60\u8981\u5B66\u4F1A\u4ECE\u5931\u8D25\u4E2D\u7AD9\u8D77\u6765\u3002\u201D\u8FD9\u4E2A\u6559\u8BAD\u6211\u4E00\u76F4\u8BB0\u5F97\u3002\u4ECE\u90A3\u4EE5\u540E\uFF0C\u6BCF\u5F53\u6211\u9047\u5230\u56F0\u96BE\u7684\u65F6\u5019\uFF0C\u6211\u90FD\u4F1A\u60F3\u8D77\u7236\u4EB2\u8BF4\u8FC7\u7684\u8BDD\u3002\u4ED6\u6559\u4F1A\u4E86\u6211\u575A\u5F3A\u548C\u52C7\u6562\u3002\u867D\u7136\u4ED6\u4E0D\u5584\u4E8E\u7528\u8BED\u8A00\u8868\u8FBE\u611F\u60C5\uFF0C\u4F46\u4ED6\u7684\u7231\u4E00\u76F4\u5728\u6211\u8EAB\u8FB9\u3002\u7236\u4EB2\u7528\u4ED6\u81EA\u5DF1\u7684\u65B9\u5F0F\u544A\u8BC9\u6211\uFF1A\u771F\u6B63\u7684\u529B\u91CF\u4E0D\u5728\u4E8E\u4ECE\u4E0D\u8DCC\u5012\uFF0C\u800C\u5728\u4E8E\u6BCF\u6B21\u8DCC\u5012\u540E\u90FD\u80FD\u91CD\u65B0\u7AD9\u8D77\u6765\u3002\u73B0\u5728\u6211\u957F\u5927\u4E86\uFF0C\u8D8A\u6765\u8D8A\u7406\u89E3\u7236\u4EB2\u5F53\u5E74\u7684\u7528\u5FC3\u3002\u6211\u60F3\u5BF9\u4ED6\u8BF4\u4E00\u58F0\uFF1A\u8C22\u8C22\u60A8\uFF0C\u7238\u7238\u3002",
};

const EXAM_TOPICS = [
  "我的家庭", "我的一位朋友", "我尊敬的人", "我最喜欢的季节",
  "我最喜欢的运动", "我的一次难忘旅行", "我的一次失败经历",
  "我学习普通话的体会", "我的一天", "我的家乡",
];

// ============================================================
// Component config
// ============================================================

interface ComponentConfig {
  number: 1 | 2 | 3 | 4 | 5;
  name: string;
  chineseName: string;
  timeLimitSeconds: number;
  weight: number;
  points: number;
}

const COMPONENTS: ComponentConfig[] = [
  { number: 1, name: "Monosyllabic Characters", chineseName: "读单音节字词", timeLimitSeconds: 210, weight: 0.10, points: 10 },
  { number: 2, name: "Multisyllabic Words", chineseName: "读多音节词语", timeLimitSeconds: 150, weight: 0.20, points: 20 },
  { number: 3, name: "Vocabulary & Grammar", chineseName: "选择判断", timeLimitSeconds: 180, weight: 0.10, points: 10 },
  { number: 4, name: "Passage Reading", chineseName: "朗读短文", timeLimitSeconds: 240, weight: 0.30, points: 30 },
  { number: 5, name: "Prompted Speaking", chineseName: "命题说话", timeLimitSeconds: 180, weight: 0.30, points: 30 },
];

// ============================================================
// PSC Grade mapping
// ============================================================

function getPSCGrade(score: number): { grade: string; description: string } {
  if (score >= 97) return { grade: "一级甲等", description: "First Class, Grade A" };
  if (score >= 92) return { grade: "一级乙等", description: "First Class, Grade B" };
  if (score >= 87) return { grade: "二级甲等", description: "Second Class, Grade A" };
  if (score >= 80) return { grade: "二级乙等", description: "Second Class, Grade B" };
  if (score >= 70) return { grade: "三级甲等", description: "Third Class, Grade A" };
  if (score >= 60) return { grade: "三级乙等", description: "Third Class, Grade B" };
  return { grade: "不达标", description: "Below Standard" };
}

// ============================================================
// Timer hook
// ============================================================

function useExamTimer(totalSeconds: number, onTimeUp: () => void, autoStart = true) {
  const [timeRemaining, setTimeRemaining] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (!isRunning) return;

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsRunning(false);
          setTimeout(() => onTimeUpRef.current(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const formatTime = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return { timeRemaining, formatTime, stop, start, isRunning };
}

// ============================================================
// 3-tier score matching (reused for C1/C2 assessment)
// ============================================================

function matchWordScores(
  items: string[],
  words: Array<{ word: string; accuracyScore: number; errorType: string }>
): { word: string; score: number | null }[] {
  const filteredWords = words.filter(
    (w) => w.errorType !== "Insertion" && w.errorType !== "Omission"
  );

  const usedIndices = new Set<number>();
  let searchFrom = 0;

  return items.map((word) => {
    // Strategy 1: exact match (forward search)
    let idx = -1;
    for (let i = searchFrom; i < filteredWords.length; i++) {
      if (filteredWords[i].word === word && !usedIndices.has(i)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      idx = filteredWords.findIndex(
        (w, i) => w.word === word && !usedIndices.has(i)
      );
    }
    if (idx >= 0) {
      usedIndices.add(idx);
      searchFrom = idx + 1;
      return { word, score: filteredWords[idx]?.accuracyScore ?? null };
    }

    // Strategy 2: character-level aggregation for multi-char words
    if (word.length > 1 && filteredWords.length > 0) {
      const charScores: number[] = [];
      let charSearchFrom = searchFrom;
      for (const char of word) {
        let charIdx = -1;
        for (let i = charSearchFrom; i < filteredWords.length; i++) {
          if (filteredWords[i].word === char && !usedIndices.has(i)) {
            charIdx = i;
            break;
          }
        }
        if (charIdx >= 0) {
          usedIndices.add(charIdx);
          charSearchFrom = charIdx + 1;
          charScores.push(filteredWords[charIdx].accuracyScore ?? 0);
        }
      }
      if (charScores.length > 0) {
        searchFrom = charSearchFrom;
        return {
          word,
          score: Math.round(charScores.reduce((a, b) => a + b, 0) / charScores.length),
        };
      }
    }

    return { word, score: null };
  });
}

// ============================================================
// Main ExamRunner
// ============================================================

type ExamPhase = "start" | "component" | "transition" | "assessing" | "results";

// Raw data collected during exam (no scoring)
interface ComponentRawData {
  componentNumber: 1 | 2 | 3 | 4 | 5;
  audioBlob?: Blob;
  referenceText?: string;
  items?: string[];
  quizAnswers?: number[];
  selectedTopic?: string;
  spokenDurationSeconds?: number;
}

// Detailed results computed after exam
interface ComponentResult {
  componentNumber: 1 | 2 | 3 | 4 | 5;
  score: number;
  xpEarned: number;
  wordScores?: { word: string; score: number | null }[];
  quizResults?: { question: QuizQuestion; selectedIndex: number; isCorrect: boolean }[];
  sentenceScores?: { sentence: string; score: number }[];
  c5Detail?: {
    totalScore: number;
    pronunciation: { score: number; deduction: number; level: number; label: string; notes: string };
    vocabGrammar: { score: number; deduction: number; level: number; label: string; notes: string };
    fluency: { score: number; deduction: number; level: number; label: string; notes: string };
    timePenalty: number;
    transcript: string;
    errorCount: number;
  };
}

// Split passage into sentences by Chinese punctuation (same as reading-session.tsx)
function splitIntoSentences(content: string): string[] {
  return content.split(/(?<=[。！？；])/g).filter((s) => s.trim().length > 0);
}

// Compute sentence-by-sentence scores from word-level data (same as reading-session.tsx)
function computeSentenceScores(
  passageContent: string,
  words: Array<{ word: string; accuracyScore: number; errorType: string }>
): { sentence: string; score: number }[] {
  const sentences = splitIntoSentences(passageContent);
  let wordIndex = 0;
  return sentences.map((sentence) => {
    const rawSentence = sentence.replace(/[。！？；，、：\u201C\u201D\u2018\u2019（）《》\s]/g, "");
    let consumed = 0;
    let sentenceTotal = 0;
    let sentenceWordCount = 0;
    while (consumed < rawSentence.length && wordIndex < words.length) {
      const w = words[wordIndex];
      if (consumed + w.word.length > rawSentence.length + 1) break;
      consumed += w.word.length;
      sentenceTotal += w.accuracyScore ?? 0;
      sentenceWordCount++;
      wordIndex++;
    }
    return { sentence, score: sentenceWordCount > 0 ? Math.round(sentenceTotal / sentenceWordCount) : 0 };
  });
}

interface ExamRunnerProps {
  character: {
    id: string;
    name: string;
    personalityPrompt: string;
    voiceId: string;
    expressions: Record<string, string>;
  };
  characters: string[];
  words: string[];
  quizQuestions?: QuizQuestion[];
  passage?: { id: string; title: string; content: string };
  topics?: string[];
}

export function ExamRunner({ character, characters, words, quizQuestions, passage, topics }: ExamRunnerProps) {
  const { showAchievementToasts } = useAchievementToast();
  // Randomize answer positions on client side
  const activeQuizQuestions = useMemo(() => {
    const questions = quizQuestions ?? EXAM_QUIZ_QUESTIONS;
    return questions.map(randomizeAnswerPositions);
  }, [quizQuestions]);

  const activePassage = passage ?? EXAM_PASSAGE;
  const activeTopics = topics ?? EXAM_TOPICS;
  const [examPhase, setExamPhase] = useState<ExamPhase>("start");
  const [currentComponentIndex, setCurrentComponentIndex] = useState(0);
  const [rawDataList, setRawDataList] = useState<ComponentRawData[]>([]);
  const [componentResults, setComponentResults] = useState<ComponentResult[]>([]);
  const [assessmentProgress, setAssessmentProgress] = useState(0);
  const [examStartTime] = useState<number>(Date.now());
  const [mockExamAchChecked, setMockExamAchChecked] = useState(false);
  const hasSavedRef = useRef(false);

  // ---- Save progress for each component to persist XP ----
  const saveAllProgress = useCallback(async (results: ComponentResult[]) => {
    if (hasSavedRef.current) return;
    hasSavedRef.current = true;

    const savePromises = results
      .filter((r) => r.score > 0 || r.xpEarned > 0)
      .map((r) =>
        fetchWithRetry("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            component: r.componentNumber,
            score: Math.round(r.score),
            xpEarned: r.xpEarned,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      );

    const responses = await Promise.allSettled(savePromises);

    // Collect any new achievements from progress saves
    const allNewAchievements: UnlockedAchievement[] = [];
    for (const r of responses) {
      if (r.status === "fulfilled" && r.value?.newAchievements?.length > 0) {
        allNewAchievements.push(...r.value.newAchievements);
      }
    }
    if (allNewAchievements.length > 0) {
      showAchievementToasts(allNewAchievements);
    }
  }, [character.id, showAchievementToasts]);

  // ---- Assess all components after exam ----
  const runAllAssessments = useCallback(async (allRawData: ComponentRawData[]) => {
    const results: ComponentResult[] = [];
    let completed = 0;

    // Helper to assess audio via API
    async function assessAudio(
      blob: Blob,
      referenceText: string,
      category: string = "read_word"
    ): Promise<{ pronunciationScore: number; words: Array<{ word: string; accuracyScore: number; errorType: string }> }> {
      const formData = new FormData();
      formData.append("audio", blob, "recording.wav");
      formData.append("referenceText", referenceText);
      formData.append("category", category);

      const response = await fetchWithRetry("/api/speech/assess", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error("[MockExam] Assessment API error:", response.status, errBody);
        throw new Error(`Assessment failed (${response.status})`);
      }
      return await response.json();
    }

    // Process all components in parallel
    const promises = allRawData.map(async (raw) => {
      let result: ComponentResult;

      if (raw.componentNumber === 3) {
        // C3: Quiz scoring (no API call needed)
        const answers = raw.quizAnswers ?? [];
        const quizResults = activeQuizQuestions.map((q, i) => ({
          question: q,
          selectedIndex: answers[i] ?? -1,
          isCorrect: answers[i] === q.correctIndex,
        }));

        // Weighted scoring
        let rawScore = 0;
        activeQuizQuestions.forEach((q, i) => {
          if (quizResults[i].isCorrect) {
            rawScore += q.type === "word-choice" ? 0.25 : 0.5;
          }
        });
        const score = (rawScore / 10) * 100;

        const xpResult = calculateXP({
          isCorrect: score >= 60,
          currentStreak: score >= 60 ? 1 : 0,
        });

        result = {
          componentNumber: 3,
          score,
          xpEarned: xpResult.totalXP,
          quizResults,
        };
      } else if ((raw.componentNumber === 1 || raw.componentNumber === 2) && raw.audioBlob && raw.items) {
        // C1/C2: Pronunciation with word-by-word matching
        try {
          const category = raw.componentNumber === 1 ? "read_syllable" : "read_word";
          const apiResult = await assessAudio(raw.audioBlob, raw.referenceText ?? "", category);
          const wordScores = matchWordScores(raw.items, apiResult.words ?? []);
          const validScores = wordScores.map(w => w.score).filter((s): s is number => s !== null);
          const avgScore = validScores.length > 0
            ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
            : 0;

          const xpResult = calculateXP({
            pronunciationScore: avgScore,
            isCorrect: avgScore >= 60,
            currentStreak: avgScore >= 60 ? 1 : 0,
          });

          result = {
            componentNumber: raw.componentNumber,
            score: avgScore,
            xpEarned: xpResult.totalXP,
            wordScores,
          };
        } catch {
          result = {
            componentNumber: raw.componentNumber,
            score: 0,
            xpEarned: 0,
            wordScores: raw.items.map(w => ({ word: w, score: null })),
          };
        }
      } else if (raw.componentNumber === 4 && raw.audioBlob) {
        // C4: Passage reading — sentence-by-sentence scores
        try {
          const apiResult = await assessAudio(raw.audioBlob, raw.referenceText ?? "", "read_chapter");
          const score = apiResult.pronunciationScore ?? 0;
          const sentenceScores = computeSentenceScores(raw.referenceText ?? "", apiResult.words ?? []);
          const xpResult = calculateXP({
            pronunciationScore: score,
            isCorrect: score >= 60,
            currentStreak: score >= 60 ? 1 : 0,
          });

          result = {
            componentNumber: 4,
            score,
            xpEarned: xpResult.totalXP,
            sentenceScores,
          };
        } catch {
          result = {
            componentNumber: 4,
            score: 0,
            xpEarned: 0,
            sentenceScores: splitIntoSentences(raw.referenceText ?? "").map(s => ({ sentence: s, score: 0 })),
          };
        }
      } else if (raw.componentNumber === 5 && raw.audioBlob) {
        // C5: Prompted speaking — 3-step pipeline via /api/speech/c5-assess
        try {
          const formData = new FormData();
          formData.append("audio", raw.audioBlob, "recording.wav");
          formData.append("topic", raw.selectedTopic ?? "");
          formData.append("spokenDurationSeconds", String(raw.spokenDurationSeconds ?? 0));

          const c5Response = await fetchWithRetry("/api/speech/c5-assess", {
            method: "POST",
            body: formData,
          });
          if (!c5Response.ok) {
            throw new Error(`C5 assessment failed (${c5Response.status})`);
          }
          const c5Result = await c5Response.json();
          const score = c5Result.normalizedScore ?? 0;

          const xpResult = calculateXP({
            pronunciationScore: score,
            isCorrect: score >= 60,
            currentStreak: score >= 60 ? 1 : 0,
          });

          result = {
            componentNumber: 5,
            score,
            xpEarned: xpResult.totalXP,
            c5Detail: {
              totalScore: c5Result.totalScore ?? 0,
              pronunciation: c5Result.pronunciation,
              vocabGrammar: c5Result.vocabGrammar,
              fluency: c5Result.fluency,
              timePenalty: c5Result.timePenalty ?? 0,
              transcript: c5Result.transcript ?? "",
              errorCount: c5Result.errorCount ?? 0,
            },
          };
        } catch {
          result = {
            componentNumber: 5,
            score: 0,
            xpEarned: 0,
          };
        }
      } else {
        // No data (time expired without recording)
        result = {
          componentNumber: raw.componentNumber,
          score: 0,
          xpEarned: 0,
        };
      }

      completed++;
      setAssessmentProgress(Math.round((completed / allRawData.length) * 100));
      return result;
    });

    const allResults = await Promise.all(promises);
    // Sort by component number
    allResults.sort((a, b) => a.componentNumber - b.componentNumber);
    results.push(...allResults);

    setComponentResults(results);
    saveAllProgress(results);
    setExamPhase("results");
  }, [activeQuizQuestions, saveAllProgress]);

  // ---- Component complete handler ----
  const handleComponentDone = useCallback((rawData: ComponentRawData) => {
    const newRawList = [...rawDataList, rawData];
    setRawDataList(newRawList);

    if (currentComponentIndex + 1 >= COMPONENTS.length) {
      // All components done — start assessment
      setExamPhase("assessing");
      setAssessmentProgress(0);
      runAllAssessments(newRawList);
    } else {
      setCurrentComponentIndex(currentComponentIndex + 1);
      setExamPhase("transition");
    }
  }, [rawDataList, currentComponentIndex, runAllAssessments]);

  // ---- Check mock exam achievements when results phase begins ----
  useEffect(() => {
    if (examPhase === "results" && !mockExamAchChecked) {
      setMockExamAchChecked(true);
      fetch("/api/achievements/mock-exam", { method: "POST" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.newAchievements?.length > 0) {
            showAchievementToasts(data.newAchievements);
          }
        })
        .catch(() => {});
    }
  }, [examPhase, mockExamAchChecked, showAchievementToasts]);

  // ---- Start Screen ----
  if (examPhase === "start") {
    const totalTime = COMPONENTS.reduce((sum, c) => sum + c.timeLimitSeconds, 0);
    const totalMinutes = Math.ceil(totalTime / 60);

    return (
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-pixel text-sm">Mock PSC Examination</h2>
            <p className="text-muted-foreground">
              Complete all 5 components to receive your estimated PSC grade.
            </p>
            <p className="text-sm text-muted-foreground">
              Estimated total time: ~{totalMinutes} minutes
            </p>
          </div>

          <div className="space-y-3">
            {COMPONENTS.map((comp) => (
              <div key={comp.number} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">
                    Component {comp.number}: {comp.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{comp.chineseName}</p>
                </div>
                <div className="text-right">
                  <Badge variant="outline">
                    {Math.floor(comp.timeLimitSeconds / 60)}:{String(comp.timeLimitSeconds % 60).padStart(2, "0")}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {comp.points} pts
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={() => {
                setExamPhase("component");
                setCurrentComponentIndex(0);
              }}
            >
              Start Mock Exam
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Transition Screen (no scores) ----
  if (examPhase === "transition") {
    const lastRaw = rawDataList[rawDataList.length - 1];
    const nextIndex = currentComponentIndex;
    const nextComp = COMPONENTS[nextIndex];

    return (
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="text-center space-y-2">
            <Badge variant="default" className="text-lg px-4 py-1">
              Component {lastRaw.componentNumber} Complete
            </Badge>
          </div>

          {nextComp && (
            <div className="text-center space-y-4">
              <div className="border-t pt-4">
                <p className="text-muted-foreground">Up next:</p>
                <p className="text-xl font-bold">
                  Component {nextComp.number}: {nextComp.name}
                </p>
                <p className="text-sm text-muted-foreground">{nextComp.chineseName}</p>
                <p className="text-sm text-muted-foreground">
                  Time limit: {Math.floor(nextComp.timeLimitSeconds / 60)}:{String(nextComp.timeLimitSeconds % 60).padStart(2, "0")} &middot; {nextComp.points} pts
                </p>
              </div>

              <Button
                size="lg"
                onClick={() => setExamPhase("component")}
              >
                Continue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Assessing Screen ----
  if (examPhase === "assessing") {
    return (
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="text-center space-y-4">
            <h2 className="font-pixel text-sm">Grading Your Exam</h2>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-muted-foreground">
              Analyzing your pronunciation and answers...
            </p>
            <Progress value={assessmentProgress} className="h-3 max-w-xs mx-auto" />
            <p className="text-sm text-muted-foreground">{assessmentProgress}% complete</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Results Screen ----
  if (examPhase === "results") {
    const weightedTotal = componentResults.reduce((sum, cr) => {
      const config = COMPONENTS.find((c) => c.number === cr.componentNumber);
      return sum + cr.score * (config?.weight ?? 0);
    }, 0);

    const totalXP = componentResults.reduce((sum, cr) => sum + cr.xpEarned, 0);
    const gradeInfo = getPSCGrade(weightedTotal);
    const totalDuration = Math.round((Date.now() - examStartTime) / 1000);

    return (
      <div className="space-y-4">
        {/* Overall results card */}
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-pixel text-sm">Mock Exam Results</h2>
              <p className="text-muted-foreground">
                Total exam time: {Math.floor(totalDuration / 60)}m {totalDuration % 60}s
              </p>
            </div>

            {/* PSC Grade */}
            <div className="text-center space-y-1 py-4">
              <p className="text-5xl font-bold">{Math.round(weightedTotal * 10) / 10}</p>
              <p className="text-sm text-muted-foreground">Total Score (out of 100)</p>
              <div className="mt-2">
                <Badge
                  variant={weightedTotal >= 80 ? "default" : weightedTotal >= 60 ? "secondary" : "destructive"}
                  className="text-lg px-4 py-1"
                >
                  {gradeInfo.grade}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">{gradeInfo.description}</p>
              </div>
            </div>

            {/* Component breakdown — PSC point format */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-muted-foreground uppercase">Component Scores</h3>
              {componentResults.map((cr) => {
                const config = COMPONENTS.find((c) => c.number === cr.componentNumber);
                const pscPoints = cr.score * (config?.weight ?? 0);
                const maxPoints = config?.points ?? 0;
                return (
                  <div key={cr.componentNumber} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">
                        C{cr.componentNumber}: {config?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {config?.chineseName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        pscPoints >= maxPoints * 0.9 ? "text-green-600" :
                        pscPoints >= maxPoints * 0.6 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {Math.round(pscPoints * 10) / 10}/{maxPoints} pts
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total XP */}
            <div className="text-center rounded-lg border bg-muted/50 p-4">
              <p className="text-3xl font-bold text-yellow-600">+{totalXP} XP</p>
              <p className="text-base text-muted-foreground">Total XP Earned</p>
            </div>

            {/* Grade scale reference */}
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-muted-foreground uppercase">PSC Grade Scale</h3>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div className="rounded border p-1.5"><span className="font-medium">一级甲等:</span> 97+</div>
                <div className="rounded border p-1.5"><span className="font-medium">一级乙等:</span> 92-96.9</div>
                <div className="rounded border p-1.5"><span className="font-medium">二级甲等:</span> 87-91.9</div>
                <div className="rounded border p-1.5"><span className="font-medium">二级乙等:</span> 80-86.9</div>
                <div className="rounded border p-1.5"><span className="font-medium">三级甲等:</span> 70-79.9</div>
                <div className="rounded border p-1.5"><span className="font-medium">三级乙等:</span> 60-69.9</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed results per component */}
        {componentResults.map((cr) => (
          <DetailedResultCard key={cr.componentNumber} result={cr} />
        ))}

        <div className="flex justify-center pb-8">
          <Button asChild size="lg">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ---- Active Component ----
  const currentComp = COMPONENTS[currentComponentIndex];

  return (
    <div className="space-y-2">
      {/* Exam progress bar */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Component {currentComp.number} of 5</span>
        <Progress value={(currentComponentIndex / 5) * 100} className="flex-1 h-2" />
        <Badge variant="outline">{currentComp.name}</Badge>
      </div>

      {currentComp.number === 1 && (
        <PronunciationComponent
          componentNumber={1}
          items={characters}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          componentLabel="Monosyllabic Characters"
          onComplete={handleComponentDone}
        />
      )}
      {currentComp.number === 2 && (
        <PronunciationComponent
          componentNumber={2}
          items={words}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          componentLabel="Multisyllabic Words"
          onComplete={handleComponentDone}
        />
      )}
      {currentComp.number === 3 && (
        <QuizComponent
          questions={activeQuizQuestions}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          onComplete={handleComponentDone}
        />
      )}
      {currentComp.number === 4 && (
        <PassageComponent
          passage={activePassage}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          onComplete={handleComponentDone}
        />
      )}
      {currentComp.number === 5 && (
        <SpeakingComponent
          topics={activeTopics}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          onComplete={handleComponentDone}
        />
      )}
    </div>
  );
}

// ============================================================
// Detailed Result Card (shown per component on results screen)
// ============================================================

function DetailedResultCard({ result }: { result: ComponentResult }) {
  const [expanded, setExpanded] = useState(false);
  const config = COMPONENTS.find((c) => c.number === result.componentNumber);

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between cursor-pointer"
        >
          <div className="text-left">
            <p className="font-medium">
              C{result.componentNumber}: {config?.name}
            </p>
            <p className="text-xs text-muted-foreground">{config?.chineseName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={result.score >= 90 ? "default" : result.score >= 60 ? "secondary" : "destructive"}>
              {Math.round(result.score)}/100
            </Badge>
            <span className="text-muted-foreground text-sm">{expanded ? "▲" : "▼"}</span>
          </div>
        </button>

        {expanded && (
          <div className="border-t pt-3">
            {/* C1/C2: Word-by-word scores */}
            {result.wordScores && (
              <div className="max-h-[400px] overflow-y-auto rounded-lg border bg-muted/30 p-3">
                <div className={`grid gap-1.5 ${
                  result.componentNumber === 1 ? "grid-cols-10" : "grid-cols-5"
                }`}>
                  {result.wordScores.map((ws, idx) => (
                    <div key={idx} className="text-center space-y-0.5">
                      <div className={`flex items-center justify-center rounded border p-1.5 ${
                        ws.score !== null
                          ? ws.score >= 90 ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                          : ws.score >= 60 ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30"
                          : "border-red-500 bg-red-50 dark:bg-red-950/30"
                        : "border-muted bg-muted/20"
                      }`}>
                        <p className={`font-bold font-chinese ${
                          result.componentNumber === 1 ? "text-lg" : "text-base"
                        }`}>{ws.word}</p>
                      </div>
                      <p className={`text-[10px] font-bold ${
                        ws.score === null ? "text-muted-foreground" :
                        ws.score >= 90 ? "text-green-600" :
                        ws.score >= 60 ? "text-yellow-600" : "text-red-600"
                      }`}>{ws.score !== null ? ws.score : "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C3: Question-by-question results */}
            {result.quizResults && (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {result.quizResults.map((qr, idx) => {
                  const showSubsection = idx === 0 ||
                    result.quizResults![idx].question.type !== result.quizResults![idx - 1].question.type;
                  return (
                    <div key={idx}>
                      {showSubsection && (
                        <div className="text-center py-1">
                          <Badge variant="secondary" className="text-xs">
                            {qr.question.type === "word-choice"
                              ? "Part A: Word Selection (\u8BCD\u8BED\u5224\u65AD)"
                              : qr.question.type === "measure-word"
                              ? "Part B: Measure Words (\u91CF\u8BCD\u642D\u914D)"
                              : "Part C: Grammar (\u8BED\u5E8F\u5224\u65AD)"}
                          </Badge>
                        </div>
                      )}
                      <div className={`rounded-lg border p-2.5 ${
                        qr.isCorrect
                          ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                          : "border-red-500 bg-red-50 dark:bg-red-950/30"
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{idx + 1}. {qr.question.prompt}</p>
                            <p className="text-xs mt-0.5">
                              <span className="text-muted-foreground">Your answer: </span>
                              <span className={qr.isCorrect ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                {qr.selectedIndex >= 0 ? qr.question.options[qr.selectedIndex] : "(no answer)"}
                              </span>
                              {!qr.isCorrect && (
                                <>
                                  <span className="text-muted-foreground"> | Correct: </span>
                                  <span className="text-green-600 font-medium">
                                    {qr.question.options[qr.question.correctIndex]}
                                  </span>
                                </>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{qr.question.explanation}</p>
                          </div>
                          <span className="text-lg">{qr.isCorrect ? "✓" : "✗"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* C4: Sentence-by-sentence breakdown */}
            {result.sentenceScores && result.sentenceScores.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Sentence-by-sentence breakdown:</p>
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {result.sentenceScores.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between rounded-md border p-2.5 ${
                        item.score >= 90 ? "border-green-500 bg-green-50 dark:bg-green-950/30" :
                        item.score >= 60 ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30" :
                        "border-red-500 bg-red-50 dark:bg-red-950/30"
                      }`}
                    >
                      <span className="text-sm flex-1 min-w-0 font-chinese leading-relaxed">{item.sentence}</span>
                      <Badge
                        variant={
                          item.score >= 90 ? "default" :
                          item.score >= 60 ? "secondary" : "destructive"
                        }
                        className="ml-2 shrink-0"
                      >
                        {item.score}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C5: PSC-style score breakdown */}
            {result.c5Detail && (
              <C5DetailCard detail={result.c5Detail} />
            )}

            {/* Fallback: no detailed data available */}
            {!result.wordScores && !result.quizResults && !result.sentenceScores && !result.c5Detail && (
              <div className="text-center py-4">
                <p className={`text-4xl font-bold ${
                  result.score >= 90 ? "text-green-600" :
                  result.score >= 60 ? "text-yellow-600" : "text-red-600"
                }`}>
                  {Math.round(result.score)}/100
                </p>
                <p className="text-sm text-muted-foreground mt-1">Pronunciation Score</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// C5 Detail Card (PSC-style score breakdown)
// ============================================================

function C5DetailCard({ detail }: { detail: NonNullable<ComponentResult["c5Detail"]> }) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="space-y-3">
      {/* Total PSC score */}
      <div className="text-center py-2">
        <p className={`text-3xl font-bold ${
          detail.totalScore >= 25 ? "text-green-600" :
          detail.totalScore >= 18 ? "text-yellow-600" : "text-red-600"
        }`}>
          {detail.totalScore}/30
        </p>
        <p className="text-xs text-muted-foreground">PSC C5 Score (命题说话)</p>
      </div>

      {/* Pronunciation */}
      <div className="rounded-lg border p-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">语音 Pronunciation</span>
            <Badge variant="secondary" className="text-xs">{detail.pronunciation.label}</Badge>
          </div>
          <span className={`font-bold ${
            detail.pronunciation.score >= 17 ? "text-green-600" :
            detail.pronunciation.score >= 14 ? "text-yellow-600" : "text-red-600"
          }`}>
            {detail.pronunciation.score}/20
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{detail.pronunciation.notes}</p>
        <Progress value={(detail.pronunciation.score / 20) * 100} className="h-1.5" />
      </div>

      {/* Vocab/Grammar */}
      <div className="rounded-lg border p-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">词汇语法 Vocab & Grammar</span>
            <Badge variant="secondary" className="text-xs">{detail.vocabGrammar.label}</Badge>
          </div>
          <span className={`font-bold ${
            detail.vocabGrammar.score >= 4 ? "text-green-600" :
            detail.vocabGrammar.score >= 3 ? "text-yellow-600" : "text-red-600"
          }`}>
            {detail.vocabGrammar.score}/5
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{detail.vocabGrammar.notes}</p>
        <Progress value={(detail.vocabGrammar.score / 5) * 100} className="h-1.5" />
      </div>

      {/* Fluency */}
      <div className="rounded-lg border p-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">自然流畅 Fluency</span>
            <Badge variant="secondary" className="text-xs">{detail.fluency.label}</Badge>
          </div>
          <span className={`font-bold ${
            detail.fluency.score >= 4 ? "text-green-600" :
            detail.fluency.score >= 3 ? "text-yellow-600" : "text-red-600"
          }`}>
            {detail.fluency.score}/5
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{detail.fluency.notes}</p>
        <Progress value={(detail.fluency.score / 5) * 100} className="h-1.5" />
      </div>

      {/* Time penalty */}
      {detail.timePenalty > 0 && (
        <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-red-600">时间扣分 Time Penalty</span>
            <span className="font-bold text-red-600">-{detail.timePenalty}</span>
          </div>
        </div>
      )}

      {/* Transcript (collapsible) */}
      {detail.transcript && (
        <div className="space-y-1">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-sm font-medium flex items-center gap-1 cursor-pointer"
          >
            Transcript ({detail.errorCount} pronunciation {detail.errorCount === 1 ? "error" : "errors"})
            <span className="text-muted-foreground">{showTranscript ? "▲" : "▼"}</span>
          </button>
          {showTranscript && (
            <div className="rounded-lg border bg-muted/30 p-2.5 max-h-[200px] overflow-y-auto">
              <p className="text-sm font-chinese leading-relaxed">{detail.transcript}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Component 1 & 2: Pronunciation (record only, no assessment)
// ============================================================

interface PronunciationComponentProps {
  componentNumber: 1 | 2;
  items: string[];
  timeLimitSeconds: number;
  componentLabel: string;
  onComplete: (rawData: ComponentRawData) => void;
}

function PronunciationComponent({ componentNumber, items, timeLimitSeconds, componentLabel, onComplete }: PronunciationComponentProps) {
  const [isDone, setIsDone] = useState(false);
  const isMonosyllabic = items.length > 0 && items[0].length === 1;
  const audioRecorderRef = useRef<AudioRecorderHandle>(null);
  const isDoneRef = useRef(false);

  const handleTimeUp = useCallback(() => {
    if (isDoneRef.current) return;
    // Try to harvest audio from an active recording
    audioRecorderRef.current?.stop();
    // If AudioRecorder wasn't recording, stop() is a no-op and
    // onRecordingComplete won't fire, so fall back to completing with no audio
    setTimeout(() => {
      if (!isDoneRef.current) {
        isDoneRef.current = true;
        setIsDone(true);
        onComplete({ componentNumber });
      }
    }, 50);
  }, [onComplete, componentNumber]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp, false);

  const handleRecordingStart = useCallback(() => {
    timer.start();
  }, [timer]);

  const handleRecordingComplete = useCallback((audioBlob: Blob) => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    setIsDone(true);
    timer.stop();
    onComplete({
      componentNumber,
      audioBlob,
      referenceText: items.join(" "),
      items,
    });
  }, [timer, onComplete, componentNumber, items]);

  if (isDone) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Recording saved. Moving on...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {componentLabel} ({items.length} items)
          </span>
          {timer.isRunning ? (
            <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "outline"}>
              {timer.formatTime}
            </Badge>
          ) : (
            <Badge variant="outline">
              {Math.floor(timeLimitSeconds / 60)}:{String(timeLimitSeconds % 60).padStart(2, "0")}
            </Badge>
          )}
        </div>

        {/* Word grid */}
        <div className="max-h-[400px] overflow-y-auto rounded-lg border bg-muted/30 p-4">
          <div className={`grid gap-2 ${isMonosyllabic ? "grid-cols-10" : "grid-cols-5"}`}>
            {items.map((word, idx) => (
              <div key={idx} className="text-center">
                <div className="flex items-center justify-center rounded border border-muted hover:border-primary p-2 transition-colors">
                  <p className={`font-bold font-chinese ${isMonosyllabic ? "text-xl" : "text-lg"}`}>{word}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            Read all {items.length} {isMonosyllabic ? "characters" : "words"} aloud in one recording.
            {!timer.isRunning && " Timer starts when you begin recording."}
          </p>
          <AudioRecorder
            ref={audioRecorderRef}
            onRecordingComplete={handleRecordingComplete}
            onRecordingStart={handleRecordingStart}
            disabled={false}
          />
          {!timer.isRunning && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => { setIsDone(true); onComplete({ componentNumber }); }}
            >
              Skip Component
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component 3: Quiz (no feedback, just record answers)
// ============================================================

interface QuizComponentProps {
  questions: QuizQuestion[];
  timeLimitSeconds: number;
  onComplete: (rawData: ComponentRawData) => void;
}

function QuizComponent({ questions, timeLimitSeconds, onComplete }: QuizComponentProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [isDone, setIsDone] = useState(false);

  const handleTimeUp = useCallback(() => {
    if (!isDone) {
      // Fill remaining answers as -1 (unanswered)
      const filled = [...answers];
      while (filled.length < questions.length) filled.push(-1);
      setIsDone(true);
      onComplete({ componentNumber: 3, quizAnswers: filled });
    }
  }, [isDone, answers, questions.length, onComplete]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp);

  const currentQuestion = questions[currentIndex];

  const handleAnswer = useCallback((answerIndex: number) => {
    const newAnswers = [...answers, answerIndex];
    setAnswers(newAnswers);

    if (currentIndex + 1 >= questions.length) {
      // Last question — complete
      timer.stop();
      setIsDone(true);
      onComplete({ componentNumber: 3, quizAnswers: newAnswers });
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [answers, currentIndex, questions.length, timer, onComplete]);

  if (isDone) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Answers recorded. Moving on...</p>
        </CardContent>
      </Card>
    );
  }

  // Determine subsection label
  const showSubsectionHeader = currentIndex === 0 ||
    questions[currentIndex].type !== questions[currentIndex - 1].type;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Question {currentIndex + 1}/{questions.length}
          </span>
          <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "outline"}>
            {timer.formatTime}
          </Badge>
        </div>
        <Progress value={(currentIndex / questions.length) * 100} className="h-2" />

        {/* Subsection header */}
        {showSubsectionHeader && (
          <div className="text-center py-1">
            <Badge variant="secondary" className="text-sm">
              {currentQuestion.type === "word-choice"
                ? "Part A: Word Selection (\u8BCD\u8BED\u5224\u65AD)"
                : currentQuestion.type === "measure-word"
                ? "Part B: Measure Words (\u91CF\u8BCD\u642D\u914D)"
                : "Part C: Grammar (\u8BED\u5E8F\u5224\u65AD)"}
            </Badge>
          </div>
        )}

        {/* Question */}
        <div className="text-center py-4">
          <p className={`font-bold ${
            currentQuestion.type === "measure-word" ? "text-3xl" : "text-xl"
          }`}>
            {currentQuestion.prompt}
          </p>
        </div>

        {/* Options — click to answer and immediately advance */}
        <div className={`grid gap-3 ${
          currentQuestion.type === "measure-word" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"
        }`}>
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              className="rounded-lg p-4 text-left border-2 border-border hover:border-primary hover:bg-accent transition-colors cursor-pointer"
            >
              <span className="font-medium">
                {String.fromCharCode(65 + index)}.{" "}
              </span>
              <span className="text-lg font-chinese">{option}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component 4: Passage Reading (record only, no assessment)
// ============================================================

interface PassageComponentProps {
  passage: { id: string; title: string; content: string };
  timeLimitSeconds: number;
  onComplete: (rawData: ComponentRawData) => void;
}

function PassageComponent({ passage, timeLimitSeconds, onComplete }: PassageComponentProps) {
  const [phase, setPhase] = useState<"ready" | "recording">("ready");
  const [isDone, setIsDone] = useState(false);
  // PCM WAV recording refs (replaces MediaRecorder)
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close();
      }
      audioContextRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const handleTimeUp = useCallback(() => {
    if (audioContextRef.current && phase === "recording") {
      if (audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunksRef.current) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      chunksRef.current = [];

      const wavBlob = encodeWAV(merged, 16000);
      setIsDone(true);
      onComplete({
        componentNumber: 4,
        audioBlob: wavBlob,
        referenceText: passage.content,
      });
      return;
    }
    if (!isDone) {
      setIsDone(true);
      onComplete({ componentNumber: 4 });
    }
  }, [phase, isDone, onComplete, passage.content]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp, false);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      setPhase("recording");
      timer.start();
    } catch {
      setIsDone(true);
      timer.stop();
      onComplete({ componentNumber: 4 });
    }
  }, [timer, onComplete]);

  const stopRecording = useCallback(() => {
    if (audioContextRef.current && phase === "recording") {
      if (audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunksRef.current) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      chunksRef.current = [];

      const wavBlob = encodeWAV(merged, 16000);
      timer.stop();
      setIsDone(true);
      onComplete({
        componentNumber: 4,
        audioBlob: wavBlob,
        referenceText: passage.content,
      });
    }
  }, [phase, timer, onComplete, passage.content]);

  if (isDone) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Recording saved. Moving on...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{passage.title}</span>
          {timer.isRunning ? (
            <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "outline"}>
              {timer.formatTime}
            </Badge>
          ) : (
            <Badge variant="outline">
              {Math.floor(timeLimitSeconds / 60)}:{String(timeLimitSeconds % 60).padStart(2, "0")}
            </Badge>
          )}
        </div>

        {/* Passage text */}
        <div className="rounded-lg border bg-muted/30 p-6 leading-relaxed">
          <p className="text-lg leading-loose">{passage.content}</p>
        </div>

        {/* Recording indicator */}
        {phase === "recording" && (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-600 font-medium">Recording...</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col items-center gap-2">
          {phase === "ready" && (
            <>
              <p className="text-sm text-muted-foreground">
                Timer starts when you begin recording.
              </p>
              <Button onClick={startRecording} size="lg">
                Start Reading
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setIsDone(true); onComplete({ componentNumber: 4 }); }}
              >
                Skip Component
              </Button>
            </>
          )}
          {phase === "recording" && (
            <Button onClick={stopRecording} variant="destructive" size="lg">
              Stop Recording
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component 5: Prompted Speaking (follows practice session C5 pattern)
// ============================================================

// Speaking structure template (matches practice session)
const SPEAKING_TEMPLATE = {
  opening: "开头（10-15秒）：我想谈谈……。对我来说……很重要/很有意义。",
  body: [
    "第一，……（原因/现象）+（例子）",
    "第二，……（对比/经历）+（细节）",
    "第三，……（观点/建议）+（总结）",
  ],
  bodyLabel: "主体（2分20秒左右）：",
  closing: "结尾（10-15秒）：总之……。以后我会……，也希望……",
};

interface SpeakingComponentProps {
  topics: string[];
  timeLimitSeconds: number;
  onComplete: (rawData: ComponentRawData) => void;
}

function SpeakingComponent({ topics, timeLimitSeconds, onComplete }: SpeakingComponentProps) {
  const [topicChoices] = useState<string[]>(() => {
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [phase, setPhase] = useState<"choosing" | "prepare" | "countdown" | "recording">("choosing");
  const [isDone, setIsDone] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const elapsedTimeRef = useRef(0);
  const [volume, setVolume] = useState(0);

  // PCM WAV recording refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Volume animation
  const updateVolume = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    setVolume(Math.min(1, rms / 0.3));
    animFrameRef.current = requestAnimationFrame(updateVolume);
  }, []);

  // Time-up handler: auto-stop recording when time limit reached
  const handleTimeUp = useCallback(() => {
    if (audioContextRef.current && phase === "recording") {
      // Stop volume animation
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      setVolume(0);
      analyserRef.current = null;

      // Stop elapsed timer
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunksRef.current) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      chunksRef.current = [];

      const wavBlob = encodeWAV(merged, 16000);
      setIsDone(true);
      onComplete({
        componentNumber: 5,
        audioBlob: wavBlob,
        selectedTopic: selectedTopic ?? undefined,
        spokenDurationSeconds: elapsedTimeRef.current,
      });
      return;
    }
    if (!isDone) {
      setIsDone(true);
      onComplete({
        componentNumber: 5,
        selectedTopic: selectedTopic ?? undefined,
        spokenDurationSeconds: elapsedTimeRef.current,
      });
    }
  }, [phase, isDone, onComplete, selectedTopic]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp, false);

  const handleTopicSelect = useCallback((topic: string) => {
    setSelectedTopic(topic);
    setPhase("prepare");
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Request mic access during countdown
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });
      streamRef.current = stream;

      // 3-second countdown
      setPhase("countdown");
      setCountdown(3);

      await new Promise<void>((resolve) => {
        let remaining = 3;
        const interval = setInterval(() => {
          remaining--;
          if (remaining <= 0) {
            clearInterval(interval);
            countdownIntervalRef.current = null;
            resolve();
          } else {
            setCountdown(remaining);
          }
        }, 1000);
        countdownIntervalRef.current = interval;
      });

      // Set up audio context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Analyser for volume visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // ScriptProcessor for PCM capture
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      // Start volume animation
      animFrameRef.current = requestAnimationFrame(updateVolume);

      // Start elapsed time counter
      setElapsedTime(0);
      elapsedTimeRef.current = 0;
      elapsedTimerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const next = prev + 1;
          elapsedTimeRef.current = next;
          return next;
        });
      }, 1000);

      setPhase("recording");
      timer.start();
    } catch {
      setIsDone(true);
      onComplete({ componentNumber: 5, selectedTopic: selectedTopic ?? undefined, spokenDurationSeconds: 0 });
    }
  }, [timer, onComplete, selectedTopic, updateVolume]);

  const stopRecording = useCallback(() => {
    if (audioContextRef.current && phase === "recording") {
      // Stop volume animation
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      setVolume(0);
      analyserRef.current = null;

      // Stop elapsed timer
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunksRef.current) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      chunksRef.current = [];

      const wavBlob = encodeWAV(merged, 16000);
      timer.stop();
      setIsDone(true);
      onComplete({
        componentNumber: 5,
        audioBlob: wavBlob,
        selectedTopic: selectedTopic ?? undefined,
        spokenDurationSeconds: elapsedTimeRef.current,
      });
    }
  }, [phase, timer, onComplete, selectedTopic]);

  // Format seconds to mm:ss
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  if (isDone) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Recording saved. Finishing exam...</p>
        </CardContent>
      </Card>
    );
  }

  // Topic selection phase
  if (phase === "choosing") {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Prompted Speaking (命题说话)</span>
            <Badge variant="outline">
              {Math.floor(timeLimitSeconds / 60)}:{String(timeLimitSeconds % 60).padStart(2, "0")}
            </Badge>
          </div>
          <p className="text-center text-muted-foreground">Choose one topic to speak about for 3 minutes:</p>
          <div className="grid grid-cols-2 gap-3">
            {topicChoices.map((topic, idx) => (
              <button
                key={idx}
                onClick={() => handleTopicSelect(topic)}
                className="rounded-lg border-2 border-border hover:border-primary hover:bg-accent transition-colors p-4 sm:p-6 text-center cursor-pointer"
              >
                <p className="text-lg sm:text-2xl font-bold font-chinese">{topic}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => { setIsDone(true); onComplete({ componentNumber: 5, spokenDurationSeconds: 0 }); }}
            >
              Skip Component
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare, countdown, and recording phases
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Prompted Speaking (命题说话)</span>
          {phase === "recording" ? (
            <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "outline"}>
              {timer.formatTime}
            </Badge>
          ) : (
            <Badge variant="outline">
              {Math.floor(timeLimitSeconds / 60)}:{String(timeLimitSeconds % 60).padStart(2, "0")}
            </Badge>
          )}
        </div>

        {/* Topic display */}
        <div className="text-center">
          <Badge variant="outline" className="mb-2">Your Topic</Badge>
          <p className="text-2xl sm:text-3xl font-bold font-chinese">{selectedTopic}</p>
        </div>

        {/* Speaking structure guide */}
        {(phase === "prepare" || phase === "countdown") && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              万能结构 Speaking Structure Guide
            </h3>
            <p className="font-medium">{SPEAKING_TEMPLATE.opening}</p>
            <div>
              <p className="font-medium">{SPEAKING_TEMPLATE.bodyLabel}</p>
              <div className="pl-4 space-y-0.5">
                {SPEAKING_TEMPLATE.body.map((point, index) => (
                  <p key={index} className="text-muted-foreground">{point}</p>
                ))}
              </div>
            </div>
            <p className="font-medium">{SPEAKING_TEMPLATE.closing}</p>
          </div>
        )}

        {/* Tips (prepare phase) */}
        {phase === "prepare" && (
          <div className="rounded-lg border p-3 bg-accent/30">
            <h4 className="text-xs font-bold text-muted-foreground uppercase mb-1">Tips</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>Speak naturally and avoid long pauses.</li>
              <li>Use specific examples and personal experiences.</li>
              <li>Aim to fill the full 3 minutes.</li>
              <li>Avoid filler words like 嗯、那个、就是.</li>
            </ul>
          </div>
        )}

        {/* Countdown display */}
        {phase === "countdown" && (
          <div className="text-center space-y-2 py-4">
            <p className="text-6xl font-bold font-mono text-primary animate-pulse">
              {countdown}
            </p>
            <p className="text-sm text-muted-foreground">Get ready to speak...</p>
          </div>
        )}

        {/* Recording: stopwatch + volume meter */}
        {phase === "recording" && (
          <div className="space-y-3">
            {/* Stopwatch */}
            <div className="text-center space-y-1">
              <p className={`text-4xl font-bold font-mono transition-colors ${
                elapsedTime >= timeLimitSeconds ? "text-green-600" : "text-orange-500"
              }`}>
                {formatTime(elapsedTime)}
              </p>
              <Progress
                value={Math.min((elapsedTime / timeLimitSeconds) * 100, 100)}
                className="h-2"
              />
              <p className={`text-xs font-medium ${
                elapsedTime >= timeLimitSeconds ? "text-green-600" : "text-orange-500"
              }`}>
                {elapsedTime >= timeLimitSeconds
                  ? "3 minutes reached! You can stop when ready."
                  : `Speak for at least ${formatTime(timeLimitSeconds - elapsedTime)} more`}
              </p>
            </div>

            {/* Volume visualization */}
            <div className="flex items-end justify-center gap-[3px] h-8">
              {Array.from({ length: 20 }).map((_, i) => {
                const barActive = (i + 1) / 20 <= volume;
                const barColor = barActive
                  ? volume > 0.7 ? "#ef4444" : volume > 0.4 ? "#eab308" : "#22c55e"
                  : "#d1d5db";
                return (
                  <div
                    key={i}
                    className="w-1.5 rounded-full transition-all duration-75"
                    style={{
                      height: barActive ? `${Math.max(4, volume * 32)}px` : "4px",
                      backgroundColor: barColor,
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-2">
          {phase === "prepare" && (
            <>
              <p className="text-sm text-muted-foreground">
                Timer starts after the 3-second countdown.
              </p>
              <Button onClick={startRecording} size="lg">
                Start Speaking
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setIsDone(true); onComplete({ componentNumber: 5, selectedTopic: selectedTopic ?? undefined, spokenDurationSeconds: 0 }); }}
              >
                Skip Component
              </Button>
            </>
          )}
          {phase === "recording" && (
            <Button onClick={stopRecording} variant="destructive" size="lg">
              Stop Recording
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
