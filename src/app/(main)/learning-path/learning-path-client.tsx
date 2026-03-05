"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  GraduationCap,
  Calendar,
  Clock,
  CheckCircle2,
  Lock,
  Play,
  ChevronRight,
  ArrowLeft,
  Trophy,
  Target,
  Loader2,
  AlertTriangle,
  BarChart3,
  Mic,
  BookOpen,
  RotateCcw,
  Sparkles,
  Swords,
  Brain,
  ChevronDown,
  ChevronUp,
  Flag,
  Timer,
} from "lucide-react";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/practice/audio-recorder";
import { encodeWAV } from "@/lib/audio-utils";
import { matchWordScores } from "@/lib/scoring/word-scores";
import { randomizeAnswerPositions } from "@/lib/utils";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { useAchievementToast } from "@/components/shared/achievement-toast";
import { useBGM } from "@/components/shared/bgm-provider";
import { useExamTimer } from "@/hooks/use-exam-timer";
import type { QuizQuestion } from "@/types/practice";
import type { LearningPlan, LearningNode, LearningCheckpoint } from "@/types/database";
import type { UnlockedAchievement } from "@/lib/achievements/types";

// ============================================================
// Types
// ============================================================

interface LearningPathClientProps {
  character: {
    id: string;
    name: string;
    personalityPrompt: string;
    voiceId: string;
    expressions: Record<string, string>;
  };
  activePlan: LearningPlan | null;
  nodes: LearningNode[] | null;
  checkpoints: LearningCheckpoint[] | null;
  assessmentData: {
    characters: string[];
    words: string[];
    quizQuestions?: QuizQuestion[];
    passage?: { id: string; title: string; content: string };
    topics?: string[];
  };
}

type ViewState =
  | "welcome"
  | "assessment"
  | "assessment_results"
  | "time_input"
  | "generating"
  | "roadmap"
  | "checkpoint"
  | "checkpoint_report"
  | "final_report";

// PSC Component info for display
const COMPONENT_INFO: Record<number, { name: string; chineseName: string; short: string }> = {
  1: { name: "Monosyllabic Characters", chineseName: "读单音节字词", short: "C1" },
  2: { name: "Multisyllabic Words", chineseName: "读多音节词语", short: "C2" },
  3: { name: "Vocabulary & Grammar", chineseName: "选择判断", short: "C3" },
  4: { name: "Passage Reading", chineseName: "朗读短文", short: "C4" },
  5: { name: "Prompted Speaking", chineseName: "命题说话", short: "C5" },
  6: { name: "Tone Drills", chineseName: "声调练习", short: "C6" },
  7: { name: "Polyphonic Words", chineseName: "多音字练习", short: "C7" },
};

const PSC_WEIGHTS: Record<string, number> = {
  c1: 0.1, c2: 0.2, c3: 0.1, c4: 0.3, c5: 0.3,
};

function getPSCGrade(score: number): { grade: string; description: string } {
  if (score >= 97) return { grade: "一级甲等", description: "First Class, Grade A" };
  if (score >= 92) return { grade: "一级乙等", description: "First Class, Grade B" };
  if (score >= 87) return { grade: "二级甲等", description: "Second Class, Grade A" };
  if (score >= 80) return { grade: "二级乙等", description: "Second Class, Grade B" };
  if (score >= 70) return { grade: "三级甲等", description: "Third Class, Grade A" };
  if (score >= 60) return { grade: "三级乙等", description: "Third Class, Grade B" };
  return { grade: "不达标", description: "Below Standard" };
}

function calculateWeightedScore(scores: Record<string, number>): number {
  let total = 0;
  for (const [key, weight] of Object.entries(PSC_WEIGHTS)) {
    total += (scores[key] ?? 0) * weight;
  }
  return total;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function scoreBgColor(score: number): string {
  if (score >= 80) return "border-green-500 bg-green-50 dark:bg-green-950/30";
  if (score >= 60) return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30";
  return "border-red-500 bg-red-50 dark:bg-red-950/30";
}

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function formatTimerDisplay(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

// ============================================================
// Assessment Utilities
// ============================================================

interface AssessmentRawData {
  componentNumber: 1 | 2 | 3 | 4 | 5;
  audioBlob?: Blob;
  referenceText?: string;
  items?: string[];
  quizScore?: number;
  selectedTopic?: string;
  spokenDurationSeconds?: number;
}

// useExamTimer is imported from @/hooks/use-exam-timer

function useRawRecording() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const startCapture = useCallback(async (existingStream?: MediaStream) => {
    const stream = existingStream ?? await navigator.mediaDevices.getUserMedia({
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
  }, []);

  const stopAndEncode = useCallback((): Blob | null => {
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
    if (totalLength === 0) return null;

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];
    return encodeWAV(merged, 16000);
  }, []);

  const cleanup = useCallback(() => {
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { audioContextRef, streamRef, startCapture, stopAndEncode, cleanup };
}

/** Grade a single component's recording immediately (fire-and-forget style). */
function gradeComponent(raw: AssessmentRawData): Promise<{ key: string; score: number }> {
  const key = `c${raw.componentNumber}`;

  // Quiz — instant, no API call
  if (raw.quizScore !== undefined) {
    return Promise.resolve({ key, score: raw.quizScore });
  }
  // No audio — 0
  if (!raw.audioBlob) {
    return Promise.resolve({ key, score: 0 });
  }

  // C1 / C2 pronunciation
  if (raw.componentNumber === 1 || raw.componentNumber === 2) {
    return (async () => {
      try {
        const category = raw.componentNumber === 1 ? "read_syllable" : "read_word";
        const formData = new FormData();
        formData.append("audio", raw.audioBlob!, "recording.wav");
        formData.append("referenceText", raw.referenceText ?? "");
        formData.append("category", category);

        const res = await fetchWithRetry("/api/speech/assess", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Assessment failed");
        const data = await res.json();

        if (raw.items && data.words) {
          const wordScores = matchWordScores(raw.items, data.words);
          const validScores = wordScores.filter(w => w.score !== null).map(w => w.score!);
          const score = validScores.length > 0
            ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
            : Math.round(data.pronunciationScore ?? 0);
          return { key, score };
        }
        return { key, score: Math.round(data.pronunciationScore ?? 0) };
      } catch {
        return { key, score: 0 };
      }
    })();
  }

  // C4 passage reading
  if (raw.componentNumber === 4) {
    return (async () => {
      try {
        const formData = new FormData();
        formData.append("audio", raw.audioBlob!, "recording.wav");
        formData.append("referenceText", raw.referenceText ?? "");
        formData.append("category", "read_chapter");

        const res = await fetchWithRetry("/api/speech/assess", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Assessment failed");
        const data = await res.json();
        return { key, score: Math.round(data.pronunciationScore ?? 0) };
      } catch {
        return { key, score: 0 };
      }
    })();
  }

  // C5 prompted speaking
  return (async () => {
    try {
      const formData = new FormData();
      formData.append("audio", raw.audioBlob!, "recording.wav");
      formData.append("topic", raw.selectedTopic ?? "");
      formData.append("spokenDurationSeconds", String(raw.spokenDurationSeconds ?? 0));

      const res = await fetchWithRetry("/api/speech/c5-assess", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("C5 assessment failed");
      const data = await res.json();
      return { key, score: Math.round(data.normalizedScore ?? 0) };
    } catch {
      return { key, score: 0 };
    }
  })();
}

/** Collect all in-flight grading promises and return final scores. */
async function collectGradingResults(
  promises: Promise<{ key: string; score: number }>[],
  setProgress: (p: number) => void,
): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};
  const total = promises.length;
  let completed = 0;

  // Race each promise to update progress as they resolve
  await Promise.all(
    promises.map(p =>
      p.then(({ key, score }) => {
        scores[key] = score;
        completed++;
        setProgress(Math.round((completed / Math.max(total, 1)) * 100));
      })
    )
  );

  for (const c of [1, 2, 3, 4, 5]) {
    if (scores[`c${c}`] === undefined) scores[`c${c}`] = 0;
  }
  setProgress(100);
  return scores;
}

// ============================================================
// Main Component
// ============================================================

export default function LearningPathClient({
  character,
  activePlan: initialPlan,
  nodes: initialNodes,
  checkpoints: initialCheckpoints,
  assessmentData,
}: LearningPathClientProps) {
  const { showAchievementToasts } = useAchievementToast();

  // character is available for future use (TTS, personality-driven feedback)
  void character;

  // Core state
  const [view, setView] = useState<ViewState>(initialPlan ? "roadmap" : "welcome");
  const [plan, setPlan] = useState<LearningPlan | null>(initialPlan);
  const [nodes, setNodes] = useState<LearningNode[]>(initialNodes ?? []);
  const [checkpoints, setCheckpoints] = useState<LearningCheckpoint[]>(initialCheckpoints ?? []);

  // Assessment state
  const [assessmentScores, setAssessmentScores] = useState<Record<string, number>>({});

  // Time input state
  const [examDate, setExamDate] = useState("");

  // Generating state
  const [generateError, setGenerateError] = useState<string | null>(null);


  // Checkpoint state
  const [checkpointNumber, setCheckpointNumber] = useState(1);
  const [checkpointScores, setCheckpointScores] = useState<Record<string, number>>({});
  const [checkpointResult, setCheckpointResult] = useState<{
    feedback: string;
    predictedGrade: string;
    scoreDeltas: Record<string, number>;
  } | null>(null);
  const [checkpointLoading, setCheckpointLoading] = useState(false);

  // ---- Refetch plan data from API ----
  const refetchPlan = useCallback(async () => {
    try {
      const res = await fetchWithRetry("/api/learning/plan");
      if (!res.ok) return;
      const data = await res.json();
      if (data.plan) {
        setPlan(data.plan);
        setNodes(data.nodes ?? []);
        setCheckpoints(data.checkpoints ?? []);
      }
    } catch {
      // Silently fail — stale data is acceptable
    }
  }, []);

  // ---- Start a node session — navigate to practice page ----
  const router = useRouter();
  const startNodeSession = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    router.push(`/component-${node.component}?lpNode=${nodeId}`);
  }, [nodes, router]);

  // ---- Submit checkpoint ----
  const submitCheckpoint = useCallback(async (scores: Record<string, number>) => {
    if (!plan) return;
    setCheckpointLoading(true);
    try {
      const res = await fetchWithRetry("/api/learning/checkpoint/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          checkpointNumber,
          scores,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit checkpoint");
      const data = await res.json();

      // Handle new achievements
      if (data.newAchievements?.length > 0) {
        showAchievementToasts(data.newAchievements as UnlockedAchievement[]);
      }

      setCheckpointResult({
        feedback: data.feedback,
        predictedGrade: data.predictedGrade,
        scoreDeltas: data.scoreDeltas,
      });

      // Update nodes from response
      if (data.updatedNodes) {
        setNodes(data.updatedNodes);
      }

      await refetchPlan();
      setView("checkpoint_report");
    } catch {
      setView("roadmap");
    } finally {
      setCheckpointLoading(false);
    }
  }, [plan, checkpointNumber, refetchPlan, showAchievementToasts]);

  // ---- Render current view ----
  switch (view) {
    case "welcome":
      return (
        <WelcomeScreen
          onStart={() => setView("assessment")}
        />
      );

    case "assessment":
      return (
        <AssessmentView
          assessmentData={assessmentData}
          onComplete={(scores) => {
            setAssessmentScores(scores);
            setView("assessment_results");
          }}
        />
      );

    case "assessment_results":
      return (
        <AssessmentResultsView
          scores={assessmentScores}
          onContinue={() => setView("time_input")}
        />
      );

    case "time_input":
      return (
        <TimeInputView
          examDate={examDate}
          onDateChange={setExamDate}
          onGenerate={() => setView("generating")}
        />
      );

    case "generating":
      return (
        <GeneratingView
          scores={assessmentScores}
          examDate={examDate}
          error={generateError}
          onSuccess={async (achievements) => {
            if (achievements?.length) {
              showAchievementToasts(achievements);
            }
            await refetchPlan();
            setGenerateError(null);
            setView("roadmap");
          }}
          onError={(msg) => setGenerateError(msg)}
          onRetry={() => {
            setGenerateError(null);
            setView("generating");
          }}
        />
      );

    case "roadmap":
      return (
        <CurriculumRoadmap
          plan={plan}
          nodes={nodes}
          checkpoints={checkpoints}
          onStartNode={startNodeSession}
          onStartCheckpoint={(cpNum) => {
            setCheckpointNumber(cpNum);
            setCheckpointScores({});
            setCheckpointResult(null);
            setView("checkpoint");
          }}
          onReset={async () => {
            try {
              const res = await fetchWithRetry("/api/learning/plan/reset", {
                method: "POST",
              });
              if (!res.ok) throw new Error("Reset failed");
              setPlan(null);
              setNodes([]);
              setCheckpoints([]);
              setAssessmentScores({});
              setExamDate("");
              setGenerateError(null);
              setView("welcome");
            } catch {
              // silently fail
            }
          }}
        />
      );

    case "checkpoint": {
      const totalPhases = new Set(nodes.map((n) => n.phase)).size;
      return (
        <CheckpointView
          checkpointNumber={checkpointNumber}
          totalCheckpoints={Math.max(1, totalPhases - 1)}
          assessmentData={assessmentData}
          loading={checkpointLoading}
          onComplete={(scores) => {
            setCheckpointScores(scores);
            submitCheckpoint(scores);
          }}
          onCancel={() => setView("roadmap")}
        />
      );
    }

    case "checkpoint_report":
      return (
        <CheckpointReportView
          checkpointNumber={checkpointNumber}
          scores={checkpointScores}
          result={checkpointResult}
          onContinue={() => setView("roadmap")}
        />
      );

    case "final_report":
      return (
        <FinalReportView
          plan={plan}
          checkpoints={checkpoints}
        />
      );

    default:
      return null;
  }
}

// ============================================================
// 1. Welcome Screen
// ============================================================

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center space-y-3">
        <GraduationCap className="h-12 w-12 mx-auto text-primary" />
        <h2 className="font-pixel text-lg sm:text-xl text-primary pixel-glow leading-relaxed">
          Personalized AI Learning Path
        </h2>
        <p className="font-chinese text-lg text-foreground">
          个性化学习计划
        </p>
        <div className="space-y-2 text-base sm:text-2xl text-muted-foreground max-w-md mx-auto">
          <p>
            Take a quick assessment to gauge your current PSC proficiency, set your exam date,
            and receive an AI-generated study curriculum tailored to your weaknesses.
          </p>
          <p>
            Your plan adapts after each checkpoint with new drills and updated predictions.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={onStart}
          className="pixel-btn bg-primary text-primary-foreground font-pixel text-base sm:text-xl leading-relaxed px-4 sm:px-8"
        >
          <Play className="h-4 w-4 mr-2" />
          Start Assessment
          <span className="font-chinese ml-2 opacity-80 hidden sm:inline">开始测评</span>
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// 2. Assessment View (real mini-exam with audio recording)
// ============================================================

type AssessmentPhase = "c1_recording" | "c2_recording" | "c3_quiz" | "c4_recording" | "c5_recording" | "assessing";

const ASSESSMENT_PHASE_ORDER: AssessmentPhase[] = ["c1_recording", "c2_recording", "c3_quiz", "c4_recording", "c5_recording"];

// ---- Shared mini-exam flow (used by AssessmentView + CheckpointView) ----
function MiniExamFlow({
  assessmentData,
  assessingTitle,
  stepLabel,
  header,
  onComplete,
}: {
  assessmentData: LearningPathClientProps["assessmentData"];
  assessingTitle: string;
  stepLabel: string;
  header?: React.ReactNode;
  onComplete: (scores: Record<string, number>) => void;
}) {
  const { setLearningActive } = useBGM();
  const [phase, setPhase] = useState<AssessmentPhase>("c1_recording");
  const [assessProgress, setAssessProgress] = useState(0);
  const processingRef = useRef(false);
  // Background grading: fire each component's grading immediately when done recording
  const gradingPromisesRef = useRef<Promise<{ key: string; score: number }>[]>([]);

  // Duck BGM during active assessment phases
  useEffect(() => {
    const active = phase !== "assessing";
    setLearningActive(active);
    return () => setLearningActive(false);
  }, [phase, setLearningActive]);

  const randomizedQuiz = useMemo(() => {
    return (assessmentData.quizQuestions ?? []).map(randomizeAnswerPositions);
  }, [assessmentData.quizQuestions]);

  const currentIndex = ASSESSMENT_PHASE_ORDER.indexOf(phase);
  const progressPercent = phase === "assessing" ? 100 : ((currentIndex) / ASSESSMENT_PHASE_ORDER.length) * 100;

  const shouldSkipPhase = useCallback((p: AssessmentPhase): boolean => {
    if (p === "c4_recording" && !assessmentData.passage) return true;
    if (p === "c5_recording" && (!assessmentData.topics || assessmentData.topics.length === 0)) return true;
    return false;
  }, [assessmentData.passage, assessmentData.topics]);

  const advancePhase = useCallback((data: AssessmentRawData) => {
    // Start grading this component immediately in the background
    gradingPromisesRef.current.push(gradeComponent(data));

    setPhase(prev => {
      let idx = ASSESSMENT_PHASE_ORDER.indexOf(prev);
      // Advance to next phase, skipping phases with missing data
      do {
        idx++;
        if (idx >= ASSESSMENT_PHASE_ORDER.length) return "assessing";
      } while (shouldSkipPhase(ASSESSMENT_PHASE_ORDER[idx]));
      return ASSESSMENT_PHASE_ORDER[idx];
    });
  }, [shouldSkipPhase]);

  // When all components done, just wait for any remaining in-flight grading
  useEffect(() => {
    if (phase !== "assessing" || processingRef.current) return;
    processingRef.current = true;
    collectGradingResults(gradingPromisesRef.current, setAssessProgress).then(onComplete);
  }, [phase, onComplete]);

  if (phase === "assessing") {
    return (
      <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
          <h2 className="font-pixel text-lg sm:text-xl text-primary leading-relaxed">{assessingTitle}</h2>
          <p className="font-chinese text-muted-foreground">正在分析测评结果...</p>
          <div className="max-w-xs mx-auto">
            <Progress value={assessProgress} className="h-3" />
            <p className="text-base text-muted-foreground mt-2">{Math.round(assessProgress)}% complete</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}

      <div className="flex items-center gap-2 text-base text-muted-foreground">
        <span>{stepLabel}: Step {currentIndex + 1} of {ASSESSMENT_PHASE_ORDER.length}</span>
        <Progress value={progressPercent} className="flex-1 h-2" />
      </div>

      {phase === "c1_recording" && (
        <MiniExamPronunciation
          componentNumber={1}
          items={assessmentData.characters}
          timeLimitSeconds={90}
          onComplete={(data) => advancePhase(data)}
        />
      )}

      {phase === "c2_recording" && (
        <MiniExamPronunciation
          componentNumber={2}
          items={assessmentData.words}
          timeLimitSeconds={90}
          onComplete={(data) => advancePhase(data)}
        />
      )}

      {phase === "c3_quiz" && (
        <QuizAssessment
          questions={randomizedQuiz}
          onComplete={(score) => advancePhase({ componentNumber: 3, quizScore: score })}
        />
      )}

      {phase === "c4_recording" && assessmentData.passage && (
        <MiniExamPassage
          passage={assessmentData.passage}
          timeLimitSeconds={240}
          onComplete={(data) => advancePhase(data)}
        />
      )}

      {phase === "c5_recording" && assessmentData.topics && assessmentData.topics.length > 0 && (
        <MiniExamSpeaking
          topics={assessmentData.topics}
          timeLimitSeconds={180}
          onComplete={(data) => advancePhase(data)}
        />
      )}
    </div>
  );
}

function AssessmentView({
  assessmentData,
  onComplete,
}: {
  assessmentData: LearningPathClientProps["assessmentData"];
  onComplete: (scores: Record<string, number>) => void;
}) {
  return (
    <MiniExamFlow
      assessmentData={assessmentData}
      assessingTitle="Analyzing Your Results"
      stepLabel="Assessment"
      onComplete={onComplete}
    />
  );
}

// ---- Mini-Exam: Pronunciation Assessment (C1/C2) ----
function MiniExamPronunciation({
  componentNumber,
  items,
  timeLimitSeconds,
  onComplete,
}: {
  componentNumber: 1 | 2;
  items: string[];
  timeLimitSeconds: number;
  onComplete: (data: AssessmentRawData) => void;
}) {
  const info = COMPONENT_INFO[componentNumber];
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const isDoneRef = useRef(false);

  const handleTimeUp = useCallback(() => {
    if (isDoneRef.current) return;
    recorderRef.current?.stop();
    setTimeout(() => {
      if (!isDoneRef.current) {
        isDoneRef.current = true;
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
    timer.stop();
    onComplete({
      componentNumber,
      audioBlob,
      referenceText: items.join(" "),
      items,
    });
  }, [timer, onComplete, componentNumber, items]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-pixel text-base px-3 py-1">
            {info?.short}: {info?.name}
          </Badge>
          <Badge variant={timer.isRunning && timer.timeRemaining <= 10 ? "destructive" : "secondary"} className="text-xl sm:text-3xl px-2 py-1 sm:px-4 sm:py-2">
            {timer.isRunning ? timer.formatTime : formatTimerDisplay(timeLimitSeconds)}
          </Badge>
        </div>
        <p className="font-chinese text-lg sm:text-xl text-center text-muted-foreground">{info?.chineseName}</p>

        <p className="text-base sm:text-xl text-center text-muted-foreground">
          Read all {componentNumber === 1 ? "characters" : "words"} aloud in a single recording:
        </p>

        <div className={`grid gap-2 sm:gap-3 ${componentNumber === 1 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"} w-full max-w-4xl mx-auto`}>
          {items.map((item, i) => (
            <div
              key={i}
              className="w-full flex items-center justify-center rounded-lg border-2 border-muted p-2 sm:p-4"
            >
              <p className="text-2xl sm:text-4xl font-bold font-chinese">{item}</p>
            </div>
          ))}
        </div>

        <AudioRecorder
          ref={recorderRef}
          onRecordingComplete={handleRecordingComplete}
          onRecordingStart={handleRecordingStart}
        />

      </CardContent>
    </Card>
  );
}

// ---- Mini-Exam: Passage Reading (C4) ----
function MiniExamPassage({
  passage,
  timeLimitSeconds,
  onComplete,
}: {
  passage: { id: string; title: string; content: string };
  timeLimitSeconds: number;
  onComplete: (data: AssessmentRawData) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const isDoneRef = useRef(false);
  const { audioContextRef, startCapture, stopAndEncode } = useRawRecording();

  const finishRecording = useCallback(() => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    setIsDone(true);
    const wavBlob = stopAndEncode();
    if (!wavBlob) {
      onComplete({ componentNumber: 4 });
      return;
    }
    onComplete({
      componentNumber: 4,
      audioBlob: wavBlob,
      referenceText: passage.content,
    });
  }, [onComplete, passage.content, stopAndEncode]);

  const handleTimeUp = useCallback(() => {
    if (audioContextRef.current) finishRecording();
    else if (!isDoneRef.current) {
      isDoneRef.current = true;
      setIsDone(true);
      onComplete({ componentNumber: 4 });
    }
  }, [finishRecording, onComplete, audioContextRef]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp, false);

  const startRecording = useCallback(async () => {
    try {
      await startCapture();
      setRecording(true);
      timer.start();
    } catch {
      isDoneRef.current = true;
      setIsDone(true);
      onComplete({ componentNumber: 4 });
    }
  }, [timer, onComplete, startCapture]);

  const stopRecording = useCallback(() => {
    timer.stop();
    setRecording(false);
    finishRecording();
  }, [timer, finishRecording]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-pixel text-base px-3 py-1">
            C4: Passage Reading
          </Badge>
          <Badge variant={timer.isRunning && timer.timeRemaining <= 30 ? "destructive" : "secondary"}>
            {timer.isRunning ? timer.formatTime : formatTimerDisplay(timeLimitSeconds)}
          </Badge>
        </div>
        <p className="font-chinese text-xl text-center text-muted-foreground">朗读短文</p>

        <h3 className="font-chinese text-center text-lg font-bold">{passage.title}</h3>
        <div className="rounded-lg border bg-muted/30 p-4 max-h-[300px] overflow-y-auto">
          <p className="font-chinese text-base leading-relaxed">{passage.content}</p>
        </div>

        <div className="flex justify-center gap-3">
          {!recording ? (
            <Button onClick={startRecording} size="lg">
              <Mic className="h-4 w-4 mr-2" />
              Start Reading
            </Button>
          ) : (
            <Button onClick={stopRecording} variant="destructive" size="lg">
              <Mic className="h-4 w-4 mr-2 animate-pulse" />
              Stop Recording
            </Button>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

// ---- Mini-Exam: Speaking Assessment (C5) ----
function MiniExamSpeaking({
  topics,
  timeLimitSeconds,
  onComplete,
}: {
  topics: string[];
  timeLimitSeconds: number;
  onComplete: (data: AssessmentRawData) => void;
}) {
  const [topicChoices] = useState<string[]>(() => {
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const selectedTopicRef = useRef<string | null>(null);
  const [speakPhase, setSpeakPhase] = useState<"choosing" | "prepare" | "countdown" | "recording">("choosing");
  const [countdown, setCountdown] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const elapsedTimeRef = useRef(0);
  const isDoneRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { audioContextRef, streamRef, startCapture, stopAndEncode } = useRawRecording();

  const finishRecording = useCallback(() => {
    if (isDoneRef.current) return;
    isDoneRef.current = true;

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    const wavBlob = stopAndEncode();
    if (!wavBlob) {
      onComplete({ componentNumber: 5, selectedTopic: selectedTopicRef.current ?? undefined, spokenDurationSeconds: 0 });
      return;
    }
    onComplete({
      componentNumber: 5,
      audioBlob: wavBlob,
      selectedTopic: selectedTopicRef.current ?? undefined,
      spokenDurationSeconds: elapsedTimeRef.current,
    });
  }, [onComplete, stopAndEncode]);

  const handleTimeUp = useCallback(() => {
    if (audioContextRef.current) finishRecording();
    else if (!isDoneRef.current) {
      isDoneRef.current = true;
      onComplete({ componentNumber: 5, selectedTopic: selectedTopicRef.current ?? undefined, spokenDurationSeconds: 0 });
    }
  }, [finishRecording, onComplete, audioContextRef]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp, false);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });
      streamRef.current = stream;

      setSpeakPhase("countdown");
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

      await startCapture(stream);

      setElapsedTime(0);
      elapsedTimeRef.current = 0;
      elapsedTimerRef.current = setInterval(() => {
        setElapsedTime(prev => {
          const next = prev + 1;
          elapsedTimeRef.current = next;
          return next;
        });
      }, 1000);

      setSpeakPhase("recording");
      timer.start();
    } catch {
      isDoneRef.current = true;
      onComplete({ componentNumber: 5, selectedTopic: selectedTopicRef.current ?? undefined, spokenDurationSeconds: 0 });
    }
  }, [timer, onComplete, streamRef, startCapture]);

  const stopRecording = useCallback(() => {
    timer.stop();
    finishRecording();
  }, [timer, finishRecording]);

  const handleTopicSelect = useCallback((topic: string) => {
    setSelectedTopic(topic);
    selectedTopicRef.current = topic;
    setSpeakPhase("prepare");
  }, []);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  if (speakPhase === "countdown") {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4 text-center">
          <Badge variant="outline" className="font-pixel text-base px-3 py-1">C5: Prompted Speaking</Badge>
          <p className="font-chinese text-lg font-bold">{selectedTopic}</p>
          <p className="text-5xl sm:text-6xl font-bold text-primary animate-pulse">{countdown}</p>
          <p className="text-base text-muted-foreground">Get ready to speak...</p>
        </CardContent>
      </Card>
    );
  }

  if (speakPhase === "recording") {
    const mins = Math.floor(elapsedTime / 60);
    const secs = elapsedTime % 60;
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-pixel text-base px-3 py-1">C5: Prompted Speaking</Badge>
            <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "secondary"} className="text-3xl px-4 py-2">
              {timer.formatTime}
            </Badge>
          </div>
          <div className="text-center space-y-2">
            <p className="font-chinese text-lg font-bold">{selectedTopic}</p>
            <div className="flex items-center justify-center gap-2">
              <Mic className="h-5 w-5 text-red-500 animate-pulse" />
              <span className="text-lg font-mono">{mins}:{String(secs).padStart(2, "0")}</span>
            </div>
          </div>
          <div className="flex justify-center">
            <Button onClick={stopRecording} variant="destructive" size="lg">
              <Mic className="h-4 w-4 mr-2" />
              Stop Recording
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (speakPhase === "prepare") {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-pixel text-base px-3 py-1">C5: Prompted Speaking</Badge>
            <Badge variant="secondary" className="text-3xl px-4 py-2">
              {formatTimerDisplay(timeLimitSeconds)}
            </Badge>
          </div>
          <div className="text-center space-y-2">
            <p className="text-base text-muted-foreground">Your topic:</p>
            <p className="font-chinese text-xl font-bold text-foreground">{selectedTopic}</p>
            <p className="text-base text-muted-foreground">Speak for 2-3 minutes. A 3-second countdown will start.</p>
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => { setSelectedTopic(null); selectedTopicRef.current = null; setSpeakPhase("choosing"); }}>
              Change Topic
            </Button>
            <Button onClick={startRecording} size="lg">
              <Mic className="h-4 w-4 mr-2" />
              Start Speaking
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // choosing phase
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-pixel text-base px-3 py-1">C5: Prompted Speaking</Badge>
          <Badge variant="secondary">
            {formatTimerDisplay(timeLimitSeconds)}
          </Badge>
        </div>
        <p className="font-chinese text-lg sm:text-xl text-center text-muted-foreground">命题说话</p>

        <p className="text-base sm:text-xl text-center text-muted-foreground">
          Choose a topic, then speak for 2-3 minutes:
        </p>
        <div className="space-y-2">
          {topicChoices.map((topic, i) => (
            <button
              key={i}
              onClick={() => handleTopicSelect(topic)}
              className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-primary transition-all"
            >
              <span className="font-chinese text-base">{topic}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Interactive Quiz Assessment for C3 ----
function QuizAssessment({
  questions,
  onComplete,
}: {
  questions: QuizQuestion[];
  onComplete: (score: number) => void;
}) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const q = questions[currentQ];

  const handleSelect = (index: number) => {
    const newAnswers = [...answers, index];
    setAnswers(newAnswers);

    if (currentQ + 1 >= questions.length) {
      let correct = 0;
      questions.forEach((question, i) => {
        if (newAnswers[i] === question.correctIndex) correct++;
      });
      const score = questions.length > 0
        ? Math.round((correct / questions.length) * 100)
        : 0;
      onComplete(score);
    } else {
      setCurrentQ(currentQ + 1);
    }
  };

  if (!q) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">No quiz questions available.</p>
          <Button onClick={() => onComplete(70)} className="mt-4">Skip with average score</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-pixel text-base px-3 py-1">C3: Vocabulary & Grammar</Badge>
          <span className="font-pixel text-xl text-muted-foreground">
            {currentQ + 1} / {questions.length}
          </span>
        </div>
        <Progress value={((currentQ) / questions.length) * 100} className="h-2" />

        <p className="font-chinese text-xl sm:text-2xl text-center py-2">{q.prompt}</p>

        <div className="space-y-2 sm:space-y-3">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className="w-full text-left px-3 py-3 sm:px-5 sm:py-4 rounded-lg border-2 border-border hover:border-primary/50 transition-all font-chinese text-base sm:text-xl cursor-pointer"
            >
              {opt}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 3. Assessment Results
// ============================================================

function AssessmentResultsView({
  scores,
  onContinue,
}: {
  scores: Record<string, number>;
  onContinue: () => void;
}) {
  const weightedScore = calculateWeightedScore(scores);
  const gradeInfo = getPSCGrade(weightedScore);

  return (
    <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center space-y-2">
        <BarChart3 className="h-10 w-10 mx-auto text-primary" />
        <h2 className="font-pixel text-lg sm:text-xl text-primary leading-relaxed">Assessment Results</h2>
        <p className="font-chinese text-muted-foreground">测评结果</p>
      </div>

      {/* Overall score */}
      <div className="text-center py-3">
        <p className={`text-3xl sm:text-4xl font-bold ${scoreColor(weightedScore)}`}>
          {Math.round(weightedScore)}
        </p>
        <p className="text-base text-muted-foreground">Weighted Score</p>
        <Badge
          variant={weightedScore >= 80 ? "default" : weightedScore >= 60 ? "secondary" : "destructive"}
          className="mt-2 text-base px-3 py-0.5"
        >
          {gradeInfo.grade}
        </Badge>
        <p className="text-base text-muted-foreground mt-1">{gradeInfo.description}</p>
      </div>

      {/* Per-component scores */}
      <div className="space-y-2">
        {(["c1", "c2", "c3", "c4", "c5"] as const).map((key) => {
          const num = parseInt(key.replace("c", ""));
          const info = COMPONENT_INFO[num];
          const s = scores[key] ?? 0;
          return (
            <div key={key} className={`flex items-center justify-between rounded-lg border p-3 ${scoreBgColor(s)}`}>
              <div>
                <p className="font-medium text-xl">{info?.short}: {info?.name}</p>
                <p className="text-base text-muted-foreground font-chinese">{info?.chineseName}</p>
              </div>
              <span className={`text-lg font-bold ${scoreColor(s)}`}>{s}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button size="lg" onClick={onContinue}>
          <Calendar className="h-4 w-4 mr-2" />
          Set Exam Date
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// 4. Time Input
// ============================================================

function TimeInputView({
  examDate,
  onDateChange,
  onGenerate,
}: {
  examDate: string;
  onDateChange: (date: string) => void;
  onGenerate: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];
  const days = examDate ? daysUntil(examDate) : 0;

  return (
    <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center space-y-2">
        <Calendar className="h-10 w-10 mx-auto text-primary" />
        <h2 className="font-pixel text-lg sm:text-xl text-primary leading-relaxed">Set Your Exam Date</h2>
        <p className="font-chinese text-muted-foreground">设置考试日期</p>
        <p className="text-base text-muted-foreground">
          We will create a study plan tailored to your timeline.
        </p>
      </div>

      <div className="max-w-xs mx-auto space-y-3">
        <input
          type="date"
          value={examDate}
          onChange={(e) => onDateChange(e.target.value)}
          min={minDate}
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-lg"
        />

        {examDate && days > 0 && (
          <div className="text-center pixel-border bg-muted px-4 py-2">
            <Clock className="h-4 w-4 inline-block mr-1 text-primary" />
            <span className="font-pixel text-xl text-foreground leading-relaxed">
              {days} day{days !== 1 ? "s" : ""} remaining
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={onGenerate}
          disabled={!examDate || days <= 0}
          className="pixel-btn bg-primary text-primary-foreground font-pixel text-base sm:text-xl leading-relaxed px-4 sm:px-8"
        >
          <Target className="h-4 w-4 mr-2" />
          Generate My Study Plan
          <span className="font-chinese ml-2 opacity-80 hidden sm:inline">生成计划</span>
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// 5. Generating Screen
// ============================================================

function GeneratingView({
  scores,
  examDate,
  error,
  onSuccess,
  onError,
  onRetry,
}: {
  scores: Record<string, number>;
  examDate: string;
  error: string | null;
  onSuccess: (achievements?: UnlockedAchievement[]) => void;
  onError: (msg: string) => void;
  onRetry: () => void;
}) {
  const hasStarted = useRef(false);
  const [barWidth, setBarWidth] = useState(0);

  // Trigger generation on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Kick off the animated bar from 0 → 90% after first paint
    requestAnimationFrame(() => setBarWidth(90));

    (async () => {
      try {
        const res = await fetchWithRetry("/api/learning/generate-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scores, examDate }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to generate plan");
        }
        const data = await res.json();
        setBarWidth(100);
        onSuccess(data.newAchievements);
      } catch (err) {
        onError((err as Error).message);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 space-y-4">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
          <h2 className="font-pixel text-lg sm:text-xl text-destructive leading-relaxed">Generation Failed</h2>
          <p className="text-base text-muted-foreground">{error}</p>
        </div>
        <div className="flex justify-center">
          <Button onClick={onRetry}>
            Retry Generation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
        <h2 className="font-pixel text-lg sm:text-xl text-primary leading-relaxed">Generating Your Study Plan</h2>
        <p className="font-chinese text-muted-foreground">正在生成学习计划...</p>
        <p className="text-base text-muted-foreground">
          Our AI is analyzing your scores and creating a personalized curriculum.
          This may take up to 30 seconds.
        </p>
        <div className="max-w-xs mx-auto">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-[20s] ease-out"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 6. Curriculum Roadmap (main view)
// ============================================================

function CurriculumRoadmap({
  plan,
  nodes,
  checkpoints,
  onStartNode,
  onStartCheckpoint,
  onReset,
}: {
  plan: LearningPlan | null;
  nodes: LearningNode[];
  checkpoints: LearningCheckpoint[];
  onStartNode: (nodeId: string) => void;
  onStartCheckpoint: (cpNum: number) => void;
  onReset: () => void;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<number | "none" | null>(null);

  if (!plan) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 text-center">
        <p className="text-muted-foreground">No active plan found.</p>
      </div>
    );
  }

  // Group nodes by phase
  const phases: Record<number, LearningNode[]> = {};
  for (const node of nodes) {
    if (!phases[node.phase]) phases[node.phase] = [];
    phases[node.phase].push(node);
  }
  const phaseNumbers = Object.keys(phases).map(Number).sort((a, b) => a - b);

  // Stats
  const completedCount = nodes.filter((n) => n.status === "completed").length;
  const totalCount = nodes.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const daysLeft = daysUntil(plan.exam_date);
  const totalCheckpoints = plan.total_checkpoints ?? 2;
  const totalPhases = totalCheckpoints + 1;
  const completedCheckpoints = new Set(checkpoints.map((cp) => cp.checkpoint_number));

  // Calculate time estimates per phase
  const phaseTimeEstimates: Record<number, number> = {};
  for (const [phaseNum, phaseNodes] of Object.entries(phases)) {
    phaseTimeEstimates[Number(phaseNum)] = phaseNodes.reduce(
      (sum, n) => sum + (n.estimated_minutes || 10), 0
    );
  }

  // Future phases that haven't been generated yet
  const futurePhaseNumbers: number[] = [];
  for (let p = Math.max(...phaseNumbers, 0) + 1; p <= totalPhases; p++) {
    futurePhaseNumbers.push(p);
  }

  // Calculate recommended dates based on workload (~15 min/day practice pace)
  const DAILY_PACE_MIN = 15;
  const phaseDeadlines: Record<number, { date: string; daysNeeded: number }> = {};
  let cumulativeDays = 0;
  for (const pNum of phaseNumbers) {
    const mins = phaseTimeEstimates[pNum] ?? 0;
    // Completed phases: 0 days remaining, incomplete: ceil(remaining mins / daily pace)
    const completedMins = (phases[pNum] ?? [])
      .filter(n => n.status === "completed")
      .reduce((s, n) => s + (n.estimated_minutes || 10), 0);
    const remainingMins = Math.max(0, mins - completedMins);
    const daysNeeded = remainingMins > 0 ? Math.max(1, Math.ceil(remainingMins / DAILY_PACE_MIN)) : 0;
    cumulativeDays += daysNeeded + (daysNeeded > 0 ? 1 : 0); // +1 day buffer for mid-assessment
    const d = new Date();
    d.setDate(d.getDate() + cumulativeDays);
    phaseDeadlines[pNum] = {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      daysNeeded,
    };
  }
  // For future (ungenerated) phases, distribute remaining days evenly
  const usedDays = cumulativeDays;
  const remainingDaysForFuture = Math.max(0, daysLeft - usedDays);
  const futureCount = futurePhaseNumbers.length + 1; // +1 for final exams
  const daysPerFuturePhase = Math.max(1, Math.floor(remainingDaysForFuture / Math.max(1, futureCount)));
  function getFutureDate(idx: number): string {
    const d = new Date();
    d.setDate(d.getDate() + usedDays + (idx + 1) * daysPerFuturePhase);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Auto-expand current phase
  const activePhase = expandedPhase === "none" ? null : (expandedPhase ?? plan.current_phase);

  return (
    <div className="space-y-5">

      {/* ── Hero Stats ── */}
      <div className="pixel-border chinese-corner bg-card p-3 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Progress ring */}
          <div className="relative shrink-0">
            <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90 animate-ring-grow">
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
                className="text-muted/40" />
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
                className="text-primary transition-all duration-700"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - progressPercent / 100)}`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-pixel text-lg text-primary leading-none">{progressPercent}%</span>
            </div>
          </div>

          {/* Stats text */}
          <div className="flex-1 min-w-0 space-y-1">
            <h2 className="font-pixel text-xl text-foreground leading-relaxed">
              Phase {plan.current_phase}
            </h2>
            <p className="text-base text-muted-foreground">
              {completedCount}/{totalCount} drills completed
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="font-pixel text-sm px-2.5 py-0.5">
                <Calendar className="h-3 w-3 mr-1" />
                {daysLeft}d left
              </Badge>
              <Badge variant="outline" className="font-pixel text-sm px-2.5 py-0.5">
                <Target className="h-3 w-3 mr-1" />
                {totalCheckpoints} checkpoints
              </Badge>
              {/* Total estimated time for current phase */}
              {phaseTimeEstimates[plan.current_phase] && (
                <Badge variant="outline" className="font-pixel text-sm px-2.5 py-0.5">
                  <Timer className="h-3 w-3 mr-1" />
                  ~{phaseTimeEstimates[plan.current_phase]}min
                </Badge>
              )}
            </div>
          </div>

          {/* Reset */}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => setShowResetConfirm(true)}
            title="Reset learning path"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Reset confirmation */}
        {showResetConfirm && (
          <div className="mt-4 border border-destructive/50 rounded-lg p-3 bg-destructive/5 space-y-2">
            <p className="text-sm text-destructive font-medium">
              Reset your learning path? All progress will be lost.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={() => { setShowResetConfirm(false); onReset(); }}>
                Reset
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── AI Analysis Card ── */}
      {plan.ai_analysis && (
        <div className="pixel-border bg-linear-to-br from-primary/5 to-transparent p-3 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="font-pixel text-base text-primary leading-relaxed block">
                AI Analysis
              </span>
              <span className="text-sm text-muted-foreground">Phase {plan.current_phase} Focus</span>
            </div>
          </div>
          <p className="text-lg text-foreground leading-relaxed">
            {plan.ai_analysis}
          </p>
        </div>
      )}

      {/* ── Vertical Phase Timeline ── */}
      <div className="relative pb-2">
        {/* Vertical connector line */}
        <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-0">
          {/* ── Existing phases (with nodes) ── */}
          {phaseNumbers.map((phaseNum, phaseIdx) => {
            const phaseNodes = phases[phaseNum];
            const isCheckpointPhase = phaseNum <= totalCheckpoints;
            const allComplete = phaseNodes.every((n) => n.status === "completed");
            const anyAvailable = phaseNodes.some((n) => n.status === "available");
            const isCurrentPhase = phaseNum === plan.current_phase;
            const isExpanded = activePhase === phaseNum;
            const phaseCompletedCount = phaseNodes.filter((n) => n.status === "completed").length;
            const checkpointReady = isCheckpointPhase && allComplete && !completedCheckpoints.has(phaseNum);
            const checkpointDone = completedCheckpoints.has(phaseNum);
            const phaseMinutes = phaseTimeEstimates[phaseNum] ?? 0;

            // Phase status
            const phaseStatus = allComplete ? "completed" : anyAvailable ? "active" : "locked";

            return (
              <div key={phaseNum} className="animate-phase-enter" style={{ animationDelay: `${phaseIdx * 100}ms` }}>
                {/* ── Phase Card ── */}
                <div className="relative pl-12 pb-4">
                  {/* Timeline node */}
                  <div className={`absolute left-[12px] top-3 w-[24px] h-[24px] rounded-full border-[3px] z-10 transition-all ${
                    phaseStatus === "completed"
                      ? "bg-green-500 border-green-400"
                      : phaseStatus === "active"
                      ? "bg-primary border-primary/60 ring-4 ring-primary/20 animate-glow-pulse"
                      : "bg-muted border-muted-foreground/30"
                  }`}>
                    {phaseStatus === "completed" && (
                      <CheckCircle2 className="h-full w-full text-white p-0.5" />
                    )}
                    {phaseStatus === "active" && (
                      <div className="h-full w-full rounded-full bg-primary-foreground/80 scale-[0.4]" />
                    )}
                  </div>

                  {/* Phase header — clickable to expand/collapse */}
                  <button
                    className={`w-full text-left pixel-border p-4 transition-all ${
                      isCurrentPhase
                        ? "bg-card ring-1 ring-primary/30"
                        : "bg-card hover:bg-accent/50"
                    }`}
                    onClick={() => setExpandedPhase(isExpanded ? "none" : phaseNum)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-pixel text-lg text-foreground leading-relaxed">
                              Phase {phaseNum}
                            </span>
                            {isCurrentPhase && (
                              <Badge className="text-sm px-2 py-0.5 bg-primary/20 text-primary border-0">
                                CURRENT
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-base text-muted-foreground">
                              {phaseCompletedCount}/{phaseNodes.length} drills
                            </span>
                            {/* Mini progress dots (sorted by component to match expanded view) */}
                            <div className="flex items-center gap-1">
                              {[...phaseNodes].sort((a, b) => a.component - b.component).map((n) => (
                                <div
                                  key={n.id}
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    n.status === "completed"
                                      ? "bg-green-500"
                                      : n.status === "available"
                                      ? "bg-primary"
                                      : "bg-muted-foreground/30"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          {/* Time estimate & recommended date */}
                          <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                            <Timer className="h-3.5 w-3.5" />
                            <span>~{phaseMinutes}min total</span>
                            {phaseStatus !== "completed" && phaseDeadlines[phaseNum] && (
                              <>
                                <span className="mx-0.5">·</span>
                                <span>~{phaseDeadlines[phaseNum].daysNeeded}d at {DAILY_PACE_MIN}min/day</span>
                                <span className="mx-0.5">·</span>
                                <Calendar className="h-3.5 w-3.5" />
                                <span>by {phaseDeadlines[phaseNum].date}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Expanded component list (grouped by component) */}
                  {isExpanded && (
                    <div className="mt-2 space-y-2 animate-slide-down">
                      {groupNodesByComponent(phaseNodes).map((group, groupIdx) => (
                        <div key={group.component} className="animate-node-card-enter" style={{ animationDelay: `${groupIdx * 60}ms` }}>
                          <ComponentRow
                            component={group.component}
                            nodes={group.nodes}
                            onStart={onStartNode}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Checkpoint Marker ── */}
                {isCheckpointPhase && (
                  <div className="relative pl-12 pb-4">
                    {/* Diamond on timeline */}
                    <div className="absolute left-[8px] top-2 w-8 h-8 z-10">
                      <div className={`w-6 h-6 rotate-45 mx-auto border-2 transition-all ${
                        checkpointDone
                          ? "bg-green-500 border-green-400"
                          : checkpointReady
                          ? "bg-primary border-primary animate-pulse"
                          : "bg-muted border-muted-foreground/30"
                      }`} />
                    </div>

                    {/* Checkpoint card */}
                    <button
                      onClick={() => { if (checkpointReady) onStartCheckpoint(phaseNum); }}
                      disabled={!checkpointReady}
                      className={`w-full text-left rounded-lg border-2 border-dashed p-3 transition-all ${
                        checkpointDone
                          ? "border-green-500/40 bg-green-500/5"
                          : checkpointReady
                          ? "border-primary bg-primary/5 cursor-pointer hover:bg-primary/10 animate-checkpoint-shimmer"
                          : "border-muted-foreground/20 bg-muted/30 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Swords className={`h-5 w-5 shrink-0 ${
                          checkpointDone ? "text-green-500" : checkpointReady ? "text-primary" : "text-muted-foreground"
                        }`} />
                        <div className="flex-1">
                          <span className={`font-pixel text-base leading-relaxed ${
                            checkpointDone ? "text-green-500" : checkpointReady ? "text-primary" : "text-muted-foreground"
                          }`}>
                            Mid-Assessment {phaseNum}
                          </span>
                          <p className="text-base text-muted-foreground">
                            {checkpointDone
                              ? "Completed — scores updated"
                              : checkpointReady
                              ? "Ready! Take assessment to unlock next phase"
                              : "Complete all drills above first"}
                          </p>
                        </div>
                        {checkpointDone && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
                        {checkpointReady && <Sparkles className="h-5 w-5 text-primary shrink-0 animate-pulse" />}
                      </div>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Future phases (not yet generated) ── */}
          {futurePhaseNumbers.map((phaseNum, idx) => {
            const isCheckpointPhase = phaseNum <= totalCheckpoints;
            const delayBase = phaseNumbers.length * 100;
            return (
              <div key={`future-${phaseNum}`} className="animate-phase-enter" style={{ animationDelay: `${delayBase + idx * 100}ms` }}>
                {/* Future phase placeholder */}
                <div className="relative pl-12 pb-4">
                  <div className="absolute left-[12px] top-3 w-[24px] h-[24px] rounded-full border-[3px] z-10 bg-muted border-dashed border-muted-foreground/30" />
                  <div className="w-full pixel-border p-4 bg-card opacity-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-pixel text-lg text-muted-foreground leading-relaxed">
                            Phase {phaseNum}
                          </span>
                          <Badge variant="outline" className="text-sm px-2 py-0.5 text-muted-foreground border-dashed">
                            UPCOMING
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-base text-muted-foreground/70">
                          <Lock className="h-3.5 w-3.5" />
                          <span>Unlocks after Mid-Assessment {phaseNum - 1}</span>
                          <span className="mx-0.5">·</span>
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Target: {getFutureDate(idx)}</span>
                        </div>
                      </div>
                      <Lock className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  </div>
                </div>

                {/* Future checkpoint marker */}
                {isCheckpointPhase && (
                  <div className="relative pl-12 pb-4">
                    <div className="absolute left-[8px] top-2 w-8 h-8 z-10">
                      <div className="w-6 h-6 rotate-45 mx-auto border-2 border-dashed border-muted-foreground/30 bg-muted" />
                    </div>
                    <div className="w-full rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-3 opacity-50">
                      <div className="flex items-center gap-3">
                        <Swords className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                        <div>
                          <span className="font-pixel text-base leading-relaxed text-muted-foreground/70">
                            Mid-Assessment {phaseNum}
                          </span>
                          <p className="text-sm text-muted-foreground/50">Locked</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Final Mock Exams ── */}
          <div className="animate-phase-enter" style={{ animationDelay: `${(phaseNumbers.length + futurePhaseNumbers.length) * 100}ms` }}>
            <div className="relative pl-12 pb-2">
              {/* Flag node on timeline */}
              <div className="absolute left-[12px] top-3 w-[24px] h-[24px] rounded-full border-[3px] z-10 bg-amber-500/20 border-amber-500/40">
                <Flag className="h-full w-full text-amber-500 p-0.5" />
              </div>

              <div className={`w-full pixel-border p-4 bg-linear-to-r from-amber-500/5 to-transparent ${
                plan.current_phase > totalPhases ? "opacity-100" : "opacity-50"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-pixel text-lg text-amber-600 dark:text-amber-400 leading-relaxed">
                    Final Mock Exams
                  </span>
                  <Badge variant="outline" className="text-sm px-2 py-0.5 border-amber-500/40 text-amber-600 dark:text-amber-400">
                    3 EXAMS
                  </Badge>
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((examNum) => (
                    <div key={examNum} className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                      <div className="shrink-0 w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-base font-medium">Mock Exam {examNum}</span>
                        <p className="text-sm text-muted-foreground">
                          Full PSC simulation (C1–C5) · ~30min
                        </p>
                      </div>
                      <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Exam date: {new Date(plan.exam_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Group nodes by component ──
const COMPONENT_COLORS: Record<number, string> = {
  1: "from-red-500/10 to-transparent border-red-500/20",
  2: "from-orange-500/10 to-transparent border-orange-500/20",
  3: "from-yellow-500/10 to-transparent border-yellow-500/20",
  4: "from-blue-500/10 to-transparent border-blue-500/20",
  5: "from-purple-500/10 to-transparent border-purple-500/20",
  6: "from-teal-500/10 to-transparent border-teal-500/20",
  7: "from-pink-500/10 to-transparent border-pink-500/20",
};

const COMPONENT_ACCENT: Record<number, string> = {
  1: "bg-red-500", 2: "bg-orange-500", 3: "bg-yellow-500",
  4: "bg-blue-500", 5: "bg-purple-500", 6: "bg-teal-500", 7: "bg-pink-500",
};

function groupNodesByComponent(nodes: LearningNode[]): { component: number; nodes: LearningNode[] }[] {
  const groups: Record<number, LearningNode[]> = {};
  for (const node of nodes) {
    if (!groups[node.component]) groups[node.component] = [];
    groups[node.component].push(node);
  }
  return Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b)
    .map(c => ({ component: c, nodes: groups[c] }));
}

function ComponentRow({
  component,
  nodes,
  onStart,
}: {
  component: number;
  nodes: LearningNode[];
  onStart: (nodeId: string) => void;
}) {
  const info = COMPONENT_INFO[component];
  const completedCount = nodes.filter(n => n.status === "completed").length;
  const totalCount = nodes.length;
  const allDone = completedCount === totalCount;
  const nextNode = nodes.find(n => n.status === "available");
  const totalMinutes = nodes.reduce((s, n) => s + (n.estimated_minutes || 10), 0);

  // Average score of completed nodes
  const completedScores = nodes
    .filter(n => n.status === "completed" && n.score !== null)
    .map(n => n.score!);
  const avgScore = completedScores.length > 0
    ? Math.round(completedScores.reduce((a, b) => a + b, 0) / completedScores.length)
    : null;

  return (
    <div
      className={`rounded-lg border bg-linear-to-r p-3.5 transition-all ${
        COMPONENT_COLORS[component] ?? ""
      } ${nextNode ? "cursor-pointer hover:scale-[1.01] hover:shadow-md" : ""} ${
        !allDone && !nextNode ? "opacity-50" : ""
      }`}
      onClick={nextNode ? () => onStart(nextNode.id) : undefined}
    >
      <div className="flex items-center gap-3">
        {/* Component badge */}
        <div className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center ${
          allDone ? "bg-green-500" : COMPONENT_ACCENT[component] ?? "bg-muted"
        }`}>
          {allDone ? (
            <CheckCircle2 className="h-5 w-5 text-white" />
          ) : (
            <span className="font-pixel text-sm text-white leading-none">{info?.short}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium truncate">
              {info?.name}
            </span>
            <Badge variant="secondary" className="text-sm px-2 py-0.5 shrink-0">
              {completedCount}/{totalCount}
            </Badge>
          </div>
          <p className="text-base text-muted-foreground">
            <span className="font-chinese">{info?.chineseName}</span>
            <span className="ml-1.5 text-sm text-muted-foreground/60">· ~{totalMinutes}min</span>
          </p>
          {/* Session progress dots */}
          <div className="flex items-center gap-1.5 mt-1">
            {nodes.map(n => (
              <div key={n.id} className="flex items-center gap-0.5">
                <div className={`w-3 h-3 rounded-full ${
                  n.status === "completed"
                    ? "bg-green-500"
                    : n.status === "available"
                    ? "bg-primary"
                    : "bg-muted-foreground/30"
                }`} />
                {n.status === "completed" && n.score !== null && (
                  <span className={`text-xs font-medium ${
                    n.score >= 80 ? "text-green-600" : n.score >= 60 ? "text-yellow-600" : "text-red-500"
                  }`}>{n.score}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right side: avg score or play button */}
        {allDone && avgScore !== null ? (
          <div className={`shrink-0 text-center px-2.5 py-1.5 rounded-lg font-pixel text-base ${
            avgScore >= 80
              ? "bg-green-500/20 text-green-500"
              : avgScore >= 60
              ? "bg-yellow-500/20 text-yellow-600"
              : "bg-red-500/20 text-red-500"
          }`}>
            {avgScore}
          </div>
        ) : nextNode ? (
          <div className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// 7. Node Session View
// ============================================================

function NodeSessionView({
  node,
  sessionData,
  loading,
  assessmentData,
  onComplete,
  onCancel,
}: {
  node: LearningNode | null;
  sessionData: { nodeType: string; component: number; focusArea: string; questions: unknown[] } | null;
  loading: boolean;
  assessmentData: LearningPathClientProps["assessmentData"];
  onComplete: (score: number) => void;
  onCancel: () => void;
}) {
  if (loading || !sessionData || !node) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 space-y-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
          <p className="text-base text-muted-foreground">Loading practice session...</p>
        </div>
        <div className="flex justify-center">
          <Button variant="outline" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Roadmap
          </Button>
        </div>
      </div>
    );
  }

  // Mock exam nodes — link to mock exam page
  if (sessionData.nodeType === "mock_exam") {
    return (
      <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-xl text-foreground leading-relaxed">
            Mock Exam Node
          </h2>
          <p className="text-base text-muted-foreground">
            This node requires completing a full or partial mock exam for
            {" "}{COMPONENT_INFO[sessionData.component]?.short}: {COMPONENT_INFO[sessionData.component]?.name}.
          </p>
          <p className="text-base text-muted-foreground">
            Focus: {sessionData.focusArea}
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button asChild>
            <Link href="/mock-exam">
              Go to Mock Exam
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
        <div className="text-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onComplete(75)}
          >
            Mark as Complete (Estimated Score)
          </Button>
        </div>
      </div>
    );
  }

  // Drill nodes — inline practice
  const component = sessionData.component;
  const questions = sessionData.questions;

  // C3 / C7: Quiz drill
  if (component === 3 || component === 7) {
    const quizQuestions: QuizQuestion[] = (questions as Array<{
      id: string;
      content: string;
      metadata: { type: string; options: string[]; correctIndex: number; explanation: string };
    }>)
      .filter((q) => q.metadata && q.metadata.options)
      .map((q) => ({
        id: q.id,
        type: q.metadata.type as QuizQuestion["type"],
        prompt: q.content,
        options: q.metadata.options,
        correctIndex: q.metadata.correctIndex,
        explanation: q.metadata.explanation,
      }))
      .map(randomizeAnswerPositions);

    if (quizQuestions.length === 0) {
      // Fallback: use assessment quiz questions if no drill questions
      const fallback = (assessmentData.quizQuestions ?? []).map(randomizeAnswerPositions);
      return (
        <DrillQuizSession
          questions={fallback.length > 0 ? fallback : []}
          focusArea={sessionData.focusArea}
          component={component}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
    }

    return (
      <DrillQuizSession
        questions={quizQuestions}
        focusArea={sessionData.focusArea}
        component={component}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    );
  }

  // C1/C2/C6: Pronunciation drill with AudioRecorder
  if (component === 1 || component === 2 || component === 6) {
    const items: string[] = (questions as Array<{ content: string }>).map((q) => q.content);
    return (
      <PronunciationDrillSession
        items={items.length > 0 ? items : (component === 1 ? assessmentData.characters.slice(0, 10) : assessmentData.words.slice(0, 10))}
        component={component}
        focusArea={sessionData.focusArea}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    );
  }

  // C4: Passage reading drill
  if (component === 4) {
    const passageQ = questions[0] as { id: string; content: string; metadata?: { title?: string } } | undefined;
    const passage = passageQ
      ? { id: passageQ.id, title: passageQ.metadata?.title ?? "Passage", content: passageQ.content }
      : assessmentData.passage ?? null;

    return (
      <PassageDrillSession
        passage={passage}
        focusArea={sessionData.focusArea}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    );
  }

  // C5: Speaking drill
  if (component === 5) {
    const topicList = (questions as Array<{ content: string }>).map((q) => q.content);
    const topics = topicList.length > 0 ? topicList : (assessmentData.topics ?? []);
    return (
      <SpeakingDrillSession
        topics={topics}
        focusArea={sessionData.focusArea}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    );
  }

  // Fallback: unknown component
  return (
    <div className="pixel-border bg-card p-4 sm:p-6 space-y-4 text-center">
      <p className="text-muted-foreground">
        Unsupported component type (C{component}).
      </p>
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={onCancel}>Back</Button>
        <Button onClick={() => onComplete(70)}>Complete with Average Score</Button>
      </div>
    </div>
  );
}

// ---- Drill Quiz Session (C3/C7) ----
function DrillQuizSession({
  questions,
  focusArea,
  component,
  onComplete,
  onCancel,
}: {
  questions: QuizQuestion[];
  focusArea: string;
  component: number;
  onComplete: (score: number) => void;
  onCancel: () => void;
}) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [done, setDone] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  const info = COMPONENT_INFO[component];

  if (questions.length === 0) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 space-y-4 text-center">
        <p className="text-muted-foreground">No quiz questions available for this drill.</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onCancel}>Back</Button>
          <Button onClick={() => onComplete(70)}>Complete</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
          <h2 className="font-pixel text-lg sm:text-xl text-foreground leading-relaxed">Drill Complete!</h2>
          <p className={`text-3xl sm:text-4xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</p>
          <p className="text-base text-muted-foreground">Score</p>
        </div>
        <div className="flex justify-center">
          <Button onClick={() => onComplete(finalScore)}>
            Return to Roadmap
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];

  const handleSelect = (index: number) => {
    if (showResult) return;
    setSelected(index);
    setShowResult(true);
    const newAnswers = [...answers, index];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        let correct = 0;
        questions.forEach((question, i) => {
          if (newAnswers[i] === question.correctIndex) correct++;
        });
        const score = Math.round((correct / questions.length) * 100);
        setFinalScore(score);
        setDone(true);
      } else {
        setCurrentQ(currentQ + 1);
        setSelected(null);
        setShowResult(false);
      }
    }, 1200);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Badge variant="outline" className="font-pixel text-base px-3 py-1">{info?.short} Drill</Badge>
      </div>
      <p className="text-base text-muted-foreground">Focus: {focusArea}</p>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between text-base text-muted-foreground">
            <span>Question {currentQ + 1} / {questions.length}</span>
            <Progress value={(currentQ / questions.length) * 100} className="w-32 h-1.5" />
          </div>

          <p className="font-chinese text-lg text-center py-2">{q.prompt}</p>

          <div className="space-y-2">
            {q.options.map((opt, i) => {
              let style = "border-border hover:border-primary/50";
              if (showResult) {
                if (i === q.correctIndex) style = "border-green-500 bg-green-50 dark:bg-green-950/30";
                else if (i === selected && i !== q.correctIndex) style = "border-red-500 bg-red-50 dark:bg-red-950/30";
              } else if (i === selected) {
                style = "border-primary bg-primary/10";
              }
              return (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={showResult}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-all font-chinese text-base ${style}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {showResult && (
            <p className="text-base text-muted-foreground text-center">{q.explanation}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Pronunciation Drill Session (C1/C2/C6) ----
interface WordScoreItem {
  word: string;
  score: number | null;
  toneScore?: number;
}

function PronunciationDrillSession({
  items,
  component,
  focusArea,
  onComplete,
  onCancel,
}: {
  items: string[];
  component: number;
  focusArea: string;
  onComplete: (score: number) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"recording" | "assessing" | "feedback">("recording");
  const [finalScore, setFinalScore] = useState(0);
  const [wordScores, setWordScores] = useState<WordScoreItem[]>([]);
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const info = COMPONENT_INFO[component];

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setPhase("assessing");

    try {
      const category = component === 1 ? "read_syllable" : "read_word";
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("referenceText", items.join(" "));
      formData.append("category", category);

      const res = await fetchWithRetry("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Assessment failed");
      const data = await res.json();

      // Extract per-word scores with tone (same logic as practice session)
      const filteredWords: Array<{ word: string; accuracyScore: number; errorType: string; toneScore?: number }> =
        (data.words ?? []).filter(
          (w: { errorType?: string }) => w.errorType !== "Insertion" && w.errorType !== "Omission"
        );

      const usedIndices = new Set<number>();
      let searchFrom = 0;
      const scores: WordScoreItem[] = items.map((word) => {
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
          return { word, score: filteredWords[idx]?.accuracyScore ?? null, toneScore: filteredWords[idx]?.toneScore };
        }

        // Character-level aggregation for multi-char words
        if (word.length > 1) {
          const charScores: number[] = [];
          const charToneScores: number[] = [];
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
              if (filteredWords[charIdx].toneScore !== undefined) {
                charToneScores.push(filteredWords[charIdx].toneScore!);
              }
            }
          }
          if (charScores.length > 0) {
            searchFrom = charSearchFrom;
            return {
              word,
              score: Math.round(charScores.reduce((a, b) => a + b, 0) / charScores.length),
              toneScore: charToneScores.length > 0
                ? Math.round(charToneScores.reduce((a, b) => a + b, 0) / charToneScores.length)
                : undefined,
            };
          }
        }

        return { word, score: null };
      });

      setWordScores(scores);
      setFinalScore(Math.round(data.pronunciationScore ?? 0));
    } catch {
      setWordScores(items.map((word) => ({ word, score: null })));
      setFinalScore(65);
    } finally {
      setPhase("feedback");
    }
  }, [component, items]);

  if (phase === "feedback") {
    const validScores = wordScores.filter((w) => w.score !== null).map((w) => w.score!);
    const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
    const toneScores = wordScores.filter((w) => w.toneScore !== undefined).map((w) => w.toneScore!);
    const avgTone = toneScores.length > 0 ? Math.round(toneScores.reduce((a, b) => a + b, 0) / toneScores.length) : null;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-pixel text-base px-3 py-1">{info?.short} Pronunciation Drill</Badge>
        </div>

        <Card>
          <CardContent className="pt-4 sm:pt-6 space-y-4 sm:space-y-6">
            {/* Per-word scores */}
            <div className={`grid gap-2 sm:gap-3 ${component === 1 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"} w-full max-w-4xl mx-auto`}>
              {wordScores.map((item, idx) => (
                <div key={idx} className="text-center space-y-1">
                  <p className="text-xl sm:text-2xl font-bold font-chinese">{item.word}</p>
                  {item.score !== null ? (
                    <>
                      <p className={`text-lg font-bold ${
                        item.score >= 90 ? "text-green-600" :
                        item.score >= 60 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {item.score}
                      </p>
                      {item.toneScore !== undefined && (
                        <Badge
                          variant={
                            item.toneScore >= 80 ? "default" :
                            item.toneScore >= 60 ? "secondary" : "destructive"
                          }
                          className="text-base"
                        >
                          声调 {item.toneScore}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <p className="text-xl text-muted-foreground">--</p>
                  )}
                </div>
              ))}
            </div>

            {/* Averages panel */}
            <div className="flex items-center justify-center gap-4 sm:gap-6 rounded-lg border-2 border-primary/20 bg-card p-3 sm:p-4">
              <div className="text-center">
                <p className="font-pixel text-xl text-muted-foreground mb-1">Pronunciation</p>
                <p className={`text-3xl font-bold ${
                  avgScore >= 90 ? "text-green-600" : avgScore >= 60 ? "text-yellow-600" : "text-red-600"
                }`}>
                  {avgScore}
                </p>
              </div>
              {avgTone !== null && (
                <>
                  <div className="h-10 w-px bg-border" />
                  <div className="text-center">
                    <p className="font-pixel text-xl text-muted-foreground mb-1">Tone 声调</p>
                    <p className={`text-3xl font-bold ${
                      avgTone >= 80 ? "text-green-600" : avgTone >= 50 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {avgTone}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-center">
              <Button onClick={() => onComplete(finalScore)}>
                Return to Roadmap
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "assessing") {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 text-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="text-base sm:text-xl font-medium">Analyzing pronunciation...</p>
        <p className="text-base text-muted-foreground">Checking tones, accuracy, and fluency</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Badge variant="outline" className="font-pixel text-base px-3 py-1">{info?.short} Pronunciation Drill</Badge>
      </div>
      <p className="text-base text-muted-foreground">Focus: {focusArea}</p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="text-base sm:text-xl text-center text-muted-foreground">
            Read the following items aloud in a single recording:
          </p>

          {/* Display items */}
          <div className={`grid gap-2 sm:gap-3 ${component === 1 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"} w-full max-w-4xl mx-auto`}>
            {items.map((item, i) => (
              <div
                key={i}
                className="w-full flex items-center justify-center rounded-lg border-2 border-muted p-2 sm:p-4"
              >
                <p className="text-2xl sm:text-4xl font-bold font-chinese">{item}</p>
              </div>
            ))}
          </div>

          {/* Audio recorder */}
          <AudioRecorder
            ref={recorderRef}
            onRecordingComplete={handleRecordingComplete}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Passage Drill Session (C4) ----
function PassageDrillSession({
  passage,
  focusArea,
  onComplete,
  onCancel,
}: {
  passage: { id: string; title: string; content: string } | null;
  focusArea: string;
  onComplete: (score: number) => void;
  onCancel: () => void;
}) {
  const [assessing, setAssessing] = useState(false);
  const [done, setDone] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!passage) return;
    setAssessing(true);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("referenceText", passage.content);
      formData.append("category", "read_chapter");

      const res = await fetchWithRetry("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Assessment failed");
      const data = await res.json();
      setFinalScore(Math.round(data.pronunciationScore ?? 0));
    } catch {
      setFinalScore(65);
    } finally {
      setAssessing(false);
      setDone(true);
    }
  }, [passage]);

  if (!passage) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 space-y-4 text-center">
        <p className="text-muted-foreground">No passage available.</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onCancel}>Back</Button>
          <Button onClick={() => onComplete(70)}>Complete</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-xl text-foreground leading-relaxed">Passage Reading Complete!</h2>
          <p className={`text-3xl sm:text-4xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</p>
          <p className="text-base text-muted-foreground">Score</p>
        </div>
        <div className="flex justify-center">
          <Button onClick={() => onComplete(finalScore)}>
            Return to Roadmap
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (assessing) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 text-center space-y-4">
        <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
        <p className="text-base text-muted-foreground">Assessing your reading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Badge variant="outline" className="font-pixel text-base px-3 py-1">C4 Passage Reading</Badge>
      </div>
      <p className="text-base text-muted-foreground">Focus: {focusArea}</p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-chinese text-center text-lg font-bold">{passage.title}</h3>
          <div className="rounded-lg border bg-muted/30 p-4 max-h-[300px] overflow-y-auto">
            <p className="font-chinese text-base leading-relaxed">{passage.content}</p>
          </div>
          <AudioRecorder onRecordingComplete={handleRecordingComplete} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Speaking Drill Session (C5) ----
function SpeakingDrillSession({
  topics,
  focusArea,
  onComplete,
  onCancel,
}: {
  topics: string[];
  focusArea: string;
  onComplete: (score: number) => void;
  onCancel: () => void;
}) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [done, setDone] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const recordStartRef = useRef<number>(0);

  const handleRecordingStart = useCallback(() => {
    recordStartRef.current = Date.now();
  }, []);

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!selectedTopic) return;
    setAssessing(true);

    const durationSec = Math.round((Date.now() - recordStartRef.current) / 1000);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("topic", selectedTopic);
      formData.append("spokenDurationSeconds", String(durationSec));

      const res = await fetchWithRetry("/api/speech/c5-assess", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("C5 assessment failed");
      const data = await res.json();
      setFinalScore(Math.round(data.normalizedScore ?? 0));
    } catch {
      setFinalScore(65);
    } finally {
      setAssessing(false);
      setDone(true);
    }
  }, [selectedTopic]);

  if (done) {
    return (
      <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="text-center space-y-2">
          <Mic className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-xl text-foreground leading-relaxed">Speaking Complete!</h2>
          <p className={`text-3xl sm:text-4xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</p>
          <p className="text-base text-muted-foreground">Score</p>
        </div>
        <div className="flex justify-center">
          <Button onClick={() => onComplete(finalScore)}>
            Return to Roadmap
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (assessing) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 text-center space-y-4">
        <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
        <p className="text-base text-muted-foreground">Analyzing your speaking...</p>
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Badge variant="outline" className="font-pixel text-base px-3 py-1">C5 Speaking</Badge>
        </div>
        <Card>
          <CardContent className="pt-4 sm:pt-6 space-y-4">
            <p className="text-base sm:text-xl text-center text-muted-foreground">
              Choose a topic and speak for at least 2 minutes:
            </p>
            <div className="space-y-2">
              {topics.slice(0, 6).map((topic, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedTopic(topic)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-primary transition-all"
                >
                  <span className="font-chinese text-base">{topic}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setSelectedTopic(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Change Topic
        </Button>
        <Badge variant="outline" className="font-pixel text-base px-3 py-1">C5 Speaking</Badge>
      </div>
      <p className="text-base text-muted-foreground">Focus: {focusArea}</p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-center">
            <p className="text-base text-muted-foreground">Your topic:</p>
            <p className="font-chinese text-xl font-bold text-foreground py-2">{selectedTopic}</p>
            <p className="text-base text-muted-foreground">Speak for 2-3 minutes</p>
          </div>
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            onRecordingStart={handleRecordingStart}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// 8. Checkpoint View (mini-assessment between phases)
// ============================================================

function CheckpointView({
  checkpointNumber,
  totalCheckpoints,
  assessmentData,
  loading,
  onComplete,
  onCancel,
}: {
  checkpointNumber: number;
  totalCheckpoints: number;
  assessmentData: LearningPathClientProps["assessmentData"];
  loading: boolean;
  onComplete: (scores: Record<string, number>) => void;
  onCancel: () => void;
}) {
  if (loading) {
    return (
      <div className="pixel-border bg-card p-4 sm:p-6 space-y-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
          <p className="text-base text-muted-foreground">Submitting checkpoint results...</p>
        </div>
      </div>
    );
  }

  return (
    <MiniExamFlow
      assessmentData={assessmentData}
      assessingTitle="Analyzing Checkpoint Results"
      stepLabel="Checkpoint"
      header={
        <div className="pixel-border bg-card p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <span className="font-pixel text-xl text-foreground leading-relaxed">
              Checkpoint {checkpointNumber} of {totalCheckpoints}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      }
      onComplete={onComplete}
    />
  );
}

// ============================================================
// 9. Checkpoint Report
// ============================================================

function CheckpointReportView({
  checkpointNumber,
  scores,
  result,
  onContinue,
}: {
  checkpointNumber: number;
  scores: Record<string, number>;
  result: {
    feedback: string;
    predictedGrade: string;
    scoreDeltas: Record<string, number>;
  } | null;
  onContinue: () => void;
}) {
  const weightedScore = calculateWeightedScore(scores);

  return (
    <div className="space-y-4">
      <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="text-center space-y-2">
          <Trophy className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-lg sm:text-xl text-primary leading-relaxed">
            Checkpoint {checkpointNumber} Complete!
          </h2>
          <p className="font-chinese text-muted-foreground">
            阶段{checkpointNumber}测评完成
          </p>
        </div>

        {/* Score table with deltas */}
        <div className="space-y-2">
          {(["c1", "c2", "c3", "c4", "c5"] as const).map((key) => {
            const num = parseInt(key.replace("c", ""));
            const info = COMPONENT_INFO[num];
            const s = scores[key] ?? 0;
            const delta = result?.scoreDeltas?.[key] ?? 0;

            return (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-xl">{info?.short}: {info?.name}</p>
                  <p className="text-base text-muted-foreground font-chinese">{info?.chineseName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${scoreColor(s)}`}>{s}</span>
                  {delta !== 0 && (
                    <Badge
                      variant={delta > 0 ? "default" : "destructive"}
                      className="text-base"
                    >
                      {delta > 0 ? "+" : ""}{delta}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Predicted grade */}
        {result?.predictedGrade && (
          <div className="text-center py-2">
            <p className="text-base text-muted-foreground">Predicted PSC Grade:</p>
            <Badge variant="default" className="text-lg px-4 py-1 mt-1">
              {result.predictedGrade}
            </Badge>
            <p className="text-base text-muted-foreground mt-1">
              Weighted: {Math.round(weightedScore)}
            </p>
          </div>
        )}

        {/* LLM Feedback */}
        {result?.feedback && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <h3 className="text-base sm:text-xl font-bold text-muted-foreground mb-2">AI Feedback</h3>
            <p className="text-base sm:text-xl text-foreground whitespace-pre-line">{result.feedback}</p>
          </div>
        )}

        <div className="flex justify-center">
          <Button size="lg" onClick={onContinue}>
            Continue to Phase {checkpointNumber + 1}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 10. Final Report
// ============================================================

function FinalReportView({
  plan,
  checkpoints,
}: {
  plan: LearningPlan | null;
  checkpoints: LearningCheckpoint[];
}) {
  const [reportData, setReportData] = useState<{
    totalStudyMinutes: number;
    completedNodes: unknown[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  // Fetch full report data
  useEffect(() => {
    if (hasFetched.current || !plan) return;
    hasFetched.current = true;

    (async () => {
      try {
        const res = await fetchWithRetry(`/api/learning/report?planId=${plan.id}`);
        if (res.ok) {
          const data = await res.json();
          setReportData({
            totalStudyMinutes: data.totalStudyMinutes ?? 0,
            completedNodes: data.completedNodes ?? [],
          });
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build growth trajectory
  const initialScores = (plan?.initial_scores ?? {}) as Record<string, number>;
  const sortedCheckpoints = [...checkpoints].sort((a, b) => a.checkpoint_number - b.checkpoint_number);

  // Calculate final weighted
  const latestScores = sortedCheckpoints.length > 0
    ? (sortedCheckpoints[sortedCheckpoints.length - 1].scores as Record<string, number>)
    : initialScores;
  const initialWeighted = calculateWeightedScore(initialScores);
  const finalWeighted = calculateWeightedScore(latestScores);
  const gradeInfo = getPSCGrade(finalWeighted);

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="pixel-border chinese-corner bg-card p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="text-center space-y-3">
          <Trophy className="h-14 w-14 mx-auto text-yellow-500" />
          <h2 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
            Learning Plan Complete!
          </h2>
          <p className="font-chinese text-lg text-foreground">
            学习计划已完成
          </p>
        </div>

        {/* Final grade */}
        <div className="text-center py-3">
          <p className={`text-4xl sm:text-5xl font-bold ${scoreColor(finalWeighted)}`}>
            {Math.round(finalWeighted)}
          </p>
          <p className="text-base text-muted-foreground">Final Predicted Score</p>
          <Badge variant="default" className="text-lg px-4 py-1 mt-2">
            {gradeInfo.grade}
          </Badge>
          <p className="text-base text-muted-foreground mt-1">{gradeInfo.description}</p>
        </div>

        {/* Growth trajectory */}
        <div className="space-y-2">
          <h3 className="font-pixel text-base text-muted-foreground leading-relaxed">Growth Trajectory</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm sm:text-xl">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-2 text-muted-foreground font-medium">Component</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium">Initial</th>
                  {sortedCheckpoints.map((cp) => (
                    <th key={cp.checkpoint_number} className="text-center py-2 px-2 text-muted-foreground font-medium">
                      CP{cp.checkpoint_number}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["c1", "c2", "c3", "c4", "c5"] as const).map((key) => {
                  const num = parseInt(key.replace("c", ""));
                  const info = COMPONENT_INFO[num];
                  return (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium">{info?.short}</td>
                      <td className={`text-center py-2 px-2 font-bold ${scoreColor(initialScores[key] ?? 0)}`}>
                        {initialScores[key] ?? "—"}
                      </td>
                      {sortedCheckpoints.map((cp) => {
                        const cpScores = cp.scores as Record<string, number>;
                        const s = cpScores[key] ?? 0;
                        return (
                          <td key={cp.checkpoint_number} className={`text-center py-2 px-2 font-bold ${scoreColor(s)}`}>
                            {s || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="border-t-2">
                  <td className="py-2 pr-2 font-bold">Weighted</td>
                  <td className={`text-center py-2 px-2 font-bold ${scoreColor(initialWeighted)}`}>
                    {Math.round(initialWeighted)}
                  </td>
                  {sortedCheckpoints.map((cp) => {
                    const cpScores = cp.scores as Record<string, number>;
                    const w = calculateWeightedScore(cpScores);
                    return (
                      <td key={cp.checkpoint_number} className={`text-center py-2 px-2 font-bold ${scoreColor(w)}`}>
                        {Math.round(w)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="pixel-border bg-muted p-2 sm:p-3 text-center">
            <p className="text-xl sm:text-2xl font-bold text-primary">
              {reportData?.completedNodes?.length ?? plan?.total_nodes ?? "—"}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground">Nodes Completed</p>
          </div>
          <div className="pixel-border bg-muted p-2 sm:p-3 text-center">
            <p className="text-xl sm:text-2xl font-bold text-primary">
              {loading ? "..." : `${Math.round((reportData?.totalStudyMinutes ?? 0) / 60)}h`}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground">Est. Study Time</p>
          </div>
          <div className="pixel-border bg-muted p-2 sm:p-3 text-center">
            <p className={`text-xl sm:text-2xl font-bold ${finalWeighted > initialWeighted ? "text-green-600" : "text-red-600"}`}>
              {finalWeighted > initialWeighted ? "+" : ""}{Math.round(finalWeighted - initialWeighted)}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground">Score Change</p>
          </div>
          <div className="pixel-border bg-muted p-2 sm:p-3 text-center">
            <p className="text-xl sm:text-2xl font-bold text-primary">{checkpoints.length}</p>
            <p className="text-sm sm:text-base text-muted-foreground">Checkpoints</p>
          </div>
        </div>

        <div className="flex justify-center">
          <Button size="lg" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
