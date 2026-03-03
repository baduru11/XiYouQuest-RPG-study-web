"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
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
  Star,
  Trophy,
  Target,
  Loader2,
  AlertTriangle,
  BarChart3,
  Mic,
  BookOpen,
} from "lucide-react";
import { AudioRecorder, type AudioRecorderHandle } from "@/components/practice/audio-recorder";
import { randomizeAnswerPositions } from "@/lib/utils";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { useAchievementToast } from "@/components/shared/achievement-toast";
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
  | "node_session"
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

/** Map self-assessment 1-5 rating to a 0-100 score */
function selfAssessToScore(rating: number): number {
  const map: Record<number, number> = { 1: 40, 2: 55, 3: 70, 4: 85, 5: 95 };
  return map[rating] ?? 70;
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

  // Node session state
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [nodeSessionData, setNodeSessionData] = useState<{
    nodeType: string;
    component: number;
    focusArea: string;
    questions: unknown[];
  } | null>(null);
  const [nodeLoading, setNodeLoading] = useState(false);

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

  // ---- Start a node session ----
  const startNodeSession = useCallback(async (nodeId: string) => {
    setActiveNodeId(nodeId);
    setNodeLoading(true);
    setNodeSessionData(null);
    setView("node_session");

    try {
      const res = await fetchWithRetry("/api/learning/node/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      if (!res.ok) throw new Error("Failed to start node");
      const data = await res.json();
      setNodeSessionData(data);
    } catch {
      setNodeSessionData(null);
    } finally {
      setNodeLoading(false);
    }
  }, []);

  // ---- Complete a node ----
  const completeNode = useCallback(async (score: number) => {
    if (!activeNodeId) return;
    try {
      const res = await fetchWithRetry("/api/learning/node/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: activeNodeId,
          score: Math.round(score),
          xpEarned: Math.round(score * 0.5),
        }),
      });
      if (!res.ok) throw new Error("Failed to complete node");
      const data = await res.json();

      // Show achievement toasts if any were unlocked
      if (data.newAchievements?.length > 0) {
        showAchievementToasts(data.newAchievements as UnlockedAchievement[]);
      }

      // Check if checkpoint is ready
      if (data.isCheckpointReady) {
        const node = nodes.find((n) => n.id === activeNodeId);
        setCheckpointNumber(node?.phase ?? 1);
        setCheckpointScores({});
        await refetchPlan();
        setView("checkpoint");
      } else if (data.isLastPhase && data.allPhaseComplete) {
        await refetchPlan();
        setView("final_report");
      } else {
        await refetchPlan();
        setView("roadmap");
      }
    } catch {
      await refetchPlan();
      setView("roadmap");
    }
  }, [activeNodeId, nodes, refetchPlan, showAchievementToasts]);

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
        />
      );

    case "node_session":
      return (
        <NodeSessionView
          node={nodes.find((n) => n.id === activeNodeId) ?? null}
          sessionData={nodeSessionData}
          loading={nodeLoading}
          assessmentData={assessmentData}
          onComplete={completeNode}
          onCancel={() => setView("roadmap")}
        />
      );

    case "checkpoint":
      return (
        <CheckpointView
          checkpointNumber={checkpointNumber}
          assessmentData={assessmentData}
          loading={checkpointLoading}
          onComplete={(scores) => {
            setCheckpointScores(scores);
            submitCheckpoint(scores);
          }}
          onCancel={() => setView("roadmap")}
        />
      );

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
    <div className="pixel-border chinese-corner bg-card p-6 space-y-6">
      <div className="text-center space-y-3">
        <GraduationCap className="h-12 w-12 mx-auto text-primary" />
        <h2 className="font-pixel text-sm text-primary pixel-glow leading-relaxed">
          Personalized Learning Path
        </h2>
        <p className="font-chinese text-lg text-foreground">
          个性化学习计划
        </p>
        <div className="space-y-2 text-sm text-muted-foreground max-w-md mx-auto">
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
          className="pixel-btn bg-primary text-primary-foreground font-pixel text-sm leading-relaxed px-8"
        >
          <Play className="h-4 w-4 mr-2" />
          Start Assessment
          <span className="font-chinese ml-2 opacity-80">开始测评</span>
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// 2. Assessment View (simplified: C3 quiz + self-assessment)
// ============================================================

type AssessmentStep = "c1" | "c2" | "c3" | "c4" | "c5";

const ASSESSMENT_STEPS: AssessmentStep[] = ["c1", "c2", "c3", "c4", "c5"];

function AssessmentView({
  assessmentData,
  onComplete,
}: {
  assessmentData: LearningPathClientProps["assessmentData"];
  onComplete: (scores: Record<string, number>) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const step = ASSESSMENT_STEPS[stepIndex];

  // Randomize quiz answers once
  const randomizedQuiz = useMemo(() => {
    return (assessmentData.quizQuestions ?? []).map(randomizeAnswerPositions);
  }, [assessmentData.quizQuestions]);

  const handleStepComplete = useCallback((key: string, score: number) => {
    const newScores = { ...scores, [key]: score };
    setScores(newScores);

    if (stepIndex + 1 >= ASSESSMENT_STEPS.length) {
      onComplete(newScores);
    } else {
      setStepIndex(stepIndex + 1);
    }
  }, [scores, stepIndex, onComplete]);

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Assessment: Step {stepIndex + 1} of {ASSESSMENT_STEPS.length}</span>
        <Progress value={((stepIndex) / ASSESSMENT_STEPS.length) * 100} className="flex-1 h-2" />
      </div>

      <p className="text-xs text-muted-foreground italic">
        For more accurate pronunciation scores, complete a Mock Exam first.
      </p>

      {step === "c3" ? (
        <QuizAssessment
          questions={randomizedQuiz}
          onComplete={(score) => handleStepComplete("c3", score)}
        />
      ) : (
        <SelfAssessment
          componentKey={step}
          componentNumber={parseInt(step.replace("c", ""))}
          onComplete={(score) => handleStepComplete(step, score)}
        />
      )}
    </div>
  );
}

// ---- Self-Assessment for pronunciation components ----
function SelfAssessment({
  componentNumber,
  onComplete,
}: {
  componentKey: string;
  componentNumber: number;
  onComplete: (score: number) => void;
}) {
  const [rating, setRating] = useState(3);
  const info = COMPONENT_INFO[componentNumber];

  const RATING_LABELS: Record<number, string> = {
    1: "Beginner — I struggle significantly",
    2: "Below Average — I make frequent errors",
    3: "Average — I'm okay with some mistakes",
    4: "Good — I'm fairly confident",
    5: "Excellent — I rarely make mistakes",
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div className="text-center space-y-1">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {info?.short}: {info?.name}
          </Badge>
          <p className="font-chinese text-sm text-muted-foreground">{info?.chineseName}</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-center text-muted-foreground">
            Rate your current ability for this component:
          </p>

          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => setRating(r)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border transition-all ${
                  rating === r
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:border-primary/50 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < r ? "text-yellow-500 fill-yellow-500" : "text-muted"}`}
                      />
                    ))}
                  </div>
                  <span className="text-sm">{RATING_LABELS[r]}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          Estimated score: <span className={`font-bold ${scoreColor(selfAssessToScore(rating))}`}>
            {selfAssessToScore(rating)}
          </span>
        </div>

        <div className="flex justify-center">
          <Button onClick={() => onComplete(selfAssessToScore(rating))} size="lg">
            Confirm & Continue
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
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
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const q = questions[currentQ];

  const handleSelect = (index: number) => {
    if (showResult) return;
    setSelected(index);
    setShowResult(true);

    const newAnswers = [...answers, index];
    setAnswers(newAnswers);

    // Auto-advance after 1.5s
    setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        // Calculate score
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
        setSelected(null);
        setShowResult(false);
      }
    }, 1500);
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
          <Badge variant="outline">C3: Vocabulary & Grammar</Badge>
          <span className="text-sm text-muted-foreground">
            {currentQ + 1} / {questions.length}
          </span>
        </div>
        <Progress value={((currentQ) / questions.length) * 100} className="h-1.5" />

        <p className="font-chinese text-lg text-center py-2">{q.prompt}</p>

        <div className="space-y-2">
          {q.options.map((opt, i) => {
            let style = "border-border hover:border-primary/50";
            if (showResult) {
              if (i === q.correctIndex) {
                style = "border-green-500 bg-green-50 dark:bg-green-950/30";
              } else if (i === selected && i !== q.correctIndex) {
                style = "border-red-500 bg-red-50 dark:bg-red-950/30";
              }
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
          <p className="text-sm text-muted-foreground text-center">
            {q.explanation}
          </p>
        )}
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
    <div className="pixel-border chinese-corner bg-card p-6 space-y-6">
      <div className="text-center space-y-2">
        <BarChart3 className="h-10 w-10 mx-auto text-primary" />
        <h2 className="font-pixel text-sm text-primary leading-relaxed">Assessment Results</h2>
        <p className="font-chinese text-muted-foreground">测评结果</p>
      </div>

      {/* Overall score */}
      <div className="text-center py-3">
        <p className={`text-4xl font-bold ${scoreColor(weightedScore)}`}>
          {Math.round(weightedScore)}
        </p>
        <p className="text-sm text-muted-foreground">Weighted Score</p>
        <Badge
          variant={weightedScore >= 80 ? "default" : weightedScore >= 60 ? "secondary" : "destructive"}
          className="mt-2 text-base px-3 py-0.5"
        >
          {gradeInfo.grade}
        </Badge>
        <p className="text-xs text-muted-foreground mt-1">{gradeInfo.description}</p>
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
                <p className="font-medium text-sm">{info?.short}: {info?.name}</p>
                <p className="text-xs text-muted-foreground font-chinese">{info?.chineseName}</p>
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
    <div className="pixel-border chinese-corner bg-card p-6 space-y-6">
      <div className="text-center space-y-2">
        <Calendar className="h-10 w-10 mx-auto text-primary" />
        <h2 className="font-pixel text-sm text-primary leading-relaxed">Set Your Exam Date</h2>
        <p className="font-chinese text-muted-foreground">设置考试日期</p>
        <p className="text-sm text-muted-foreground">
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
            <span className="font-pixel text-sm text-foreground leading-relaxed">
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
          className="pixel-btn bg-primary text-primary-foreground font-pixel text-sm leading-relaxed px-8"
        >
          <Target className="h-4 w-4 mr-2" />
          Generate My Study Plan
          <span className="font-chinese ml-2 opacity-80">生成计划</span>
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

  // Trigger generation on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

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
        onSuccess(data.newAchievements);
      } catch (err) {
        onError((err as Error).message);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="pixel-border bg-card p-6 space-y-4">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
          <h2 className="font-pixel text-sm text-destructive leading-relaxed">Generation Failed</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
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
    <div className="pixel-border chinese-corner bg-card p-6 space-y-6">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
        <h2 className="font-pixel text-sm text-primary leading-relaxed">Generating Your Study Plan</h2>
        <p className="font-chinese text-muted-foreground">正在生成学习计划...</p>
        <p className="text-sm text-muted-foreground">
          Our AI is analyzing your scores and creating a personalized curriculum.
          This may take up to 30 seconds.
        </p>
        <div className="max-w-xs mx-auto">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-pulse rounded-full" style={{ width: "60%" }} />
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
}: {
  plan: LearningPlan | null;
  nodes: LearningNode[];
  checkpoints: LearningCheckpoint[];
  onStartNode: (nodeId: string) => void;
  onStartCheckpoint: (cpNum: number) => void;
}) {
  if (!plan) {
    return (
      <div className="pixel-border bg-card p-6 text-center">
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

  // Calculate stats
  const completedCount = nodes.filter((n) => n.status === "completed").length;
  const totalCount = nodes.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const daysLeft = daysUntil(plan.exam_date);

  // Which checkpoints exist
  const completedCheckpoints = new Set(checkpoints.map((cp) => cp.checkpoint_number));

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="pixel-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span className="font-pixel text-sm text-foreground leading-relaxed">
              Phase {plan.current_phase} of 4
            </span>
          </div>
          <Badge variant="outline" className="font-pixel text-xs">
            {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
          </Badge>
        </div>
        <Progress value={progressPercent} className="h-3" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedCount}/{totalCount} nodes completed</span>
          <span>{progressPercent}% complete</span>
        </div>
      </div>

      {/* Roadmap timeline */}
      <div className="overflow-x-auto pb-4">
        <div className="flex items-center gap-2 min-w-max px-2">
          {phaseNumbers.map((phaseNum, phaseIdx) => {
            const phaseNodes = phases[phaseNum];
            const isCheckpointPhase = phaseNum < 4;
            const allPhaseComplete = phaseNodes.every((n) => n.status === "completed");
            const checkpointReady = isCheckpointPhase && allPhaseComplete && !completedCheckpoints.has(phaseNum);
            const checkpointDone = completedCheckpoints.has(phaseNum);

            return (
              <div key={phaseNum} className="flex items-center gap-2">
                {/* Phase label */}
                {phaseIdx > 0 && (
                  <div className="w-px h-8 bg-border mx-1" />
                )}

                {/* Phase nodes */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-pixel text-muted-foreground leading-relaxed mr-1 whitespace-nowrap">
                    P{phaseNum}
                  </span>
                  {phaseNodes.map((node) => (
                    <NodeCircle
                      key={node.id}
                      node={node}
                      onClick={() => {
                        if (node.status === "available") onStartNode(node.id);
                      }}
                    />
                  ))}
                </div>

                {/* Checkpoint diamond (after phases 1-3) */}
                {isCheckpointPhase && (
                  <CheckpointDiamond
                    number={phaseNum}
                    ready={checkpointReady}
                    done={checkpointDone}
                    onClick={() => {
                      if (checkpointReady) onStartCheckpoint(phaseNum);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed node list grouped by phase */}
      {phaseNumbers.map((phaseNum) => {
        const phaseNodes = phases[phaseNum];
        return (
          <div key={phaseNum} className="space-y-2">
            <h3 className="font-pixel text-xs text-muted-foreground leading-relaxed">
              Phase {phaseNum}
            </h3>
            {phaseNodes.map((node) => (
              <NodeListItem
                key={node.id}
                node={node}
                onStart={() => onStartNode(node.id)}
              />
            ))}

            {/* Checkpoint indicator */}
            {phaseNum < 4 && (
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="h-px flex-1 bg-border" />
                {completedCheckpoints.has(phaseNum) ? (
                  <Badge variant="default" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Checkpoint {phaseNum} Complete
                  </Badge>
                ) : (
                  <Badge
                    variant={
                      phaseNodes.every((n) => n.status === "completed") ? "default" : "secondary"
                    }
                    className={`text-xs ${
                      phaseNodes.every((n) => n.status === "completed")
                        ? "cursor-pointer hover:brightness-110"
                        : "opacity-50"
                    }`}
                    onClick={() => {
                      if (phaseNodes.every((n) => n.status === "completed")) {
                        onStartCheckpoint(phaseNum);
                      }
                    }}
                  >
                    <Target className="h-3 w-3 mr-1" />
                    Checkpoint {phaseNum}
                  </Badge>
                )}
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Node Circle (timeline dot) ----
function NodeCircle({ node, onClick }: { node: LearningNode; onClick: () => void }) {
  const info = COMPONENT_INFO[node.component];
  const isCompleted = node.status === "completed";
  const isAvailable = node.status === "available";
  const isLocked = node.status === "locked";

  return (
    <button
      onClick={onClick}
      disabled={!isAvailable}
      className="flex flex-col items-center gap-0.5 group"
      title={`${info?.short}: ${node.focus_area}`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
          isCompleted
            ? "bg-green-500 border-green-600 text-white"
            : isAvailable
            ? "bg-primary border-primary text-primary-foreground cursor-pointer hover:scale-110"
            : "bg-muted border-muted-foreground/30 text-muted-foreground"
        }`}
      >
        {isCompleted ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isLocked ? (
          <Lock className="h-3 w-3" />
        ) : (
          info?.short
        )}
      </div>
      <span className="text-[8px] text-muted-foreground max-w-[50px] text-center truncate leading-tight">
        {node.focus_area.length > 12 ? node.focus_area.slice(0, 12) + "..." : node.focus_area}
      </span>
      {isCompleted && node.score !== null && (
        <Badge variant="default" className="text-[8px] px-1 py-0 h-3.5">
          {node.score}
        </Badge>
      )}
    </button>
  );
}

// ---- Checkpoint Diamond ----
function CheckpointDiamond({
  number,
  ready,
  done,
  onClick,
}: {
  number: number;
  ready: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!ready}
      className="flex flex-col items-center gap-0.5 mx-1"
      title={`Checkpoint ${number}`}
    >
      <div
        className={`w-8 h-8 rotate-45 flex items-center justify-center border-2 transition-all ${
          done
            ? "bg-green-500 border-green-600"
            : ready
            ? "bg-primary border-primary cursor-pointer hover:scale-110 animate-pulse"
            : "bg-muted border-muted-foreground/30"
        }`}
      >
        <span className={`-rotate-45 text-[10px] font-bold ${
          done || ready ? "text-white" : "text-muted-foreground"
        }`}>
          {done ? "✓" : number}
        </span>
      </div>
      <span className="text-[8px] text-muted-foreground whitespace-nowrap">CP{number}</span>
    </button>
  );
}

// ---- Node List Item (detailed) ----
function NodeListItem({ node, onStart }: { node: LearningNode; onStart: () => void }) {
  const info = COMPONENT_INFO[node.component];
  const isCompleted = node.status === "completed";
  const isAvailable = node.status === "available";

  return (
    <div
      className={`pixel-border bg-card px-4 py-2.5 flex items-center gap-3 ${
        isAvailable ? "hover:pixel-border-primary cursor-pointer" : ""
      } ${isCompleted ? "opacity-75" : ""}`}
      onClick={isAvailable ? onStart : undefined}
    >
      {/* Status icon */}
      <div className={`shrink-0 ${
        isCompleted ? "text-green-500" : isAvailable ? "text-primary" : "text-muted-foreground"
      }`}>
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : isAvailable ? (
          <Play className="h-5 w-5" />
        ) : (
          <Lock className="h-5 w-5" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {info?.short}: {node.focus_area}
        </p>
        <p className="text-xs text-muted-foreground">
          {node.node_type === "mock_exam" ? "Mock Exam" : "Drill"} &middot;{" "}
          {info?.chineseName}
        </p>
      </div>

      {/* Score / action */}
      {isCompleted && node.score !== null && (
        <Badge
          variant={node.score >= 80 ? "default" : node.score >= 60 ? "secondary" : "destructive"}
        >
          {node.score}
        </Badge>
      )}
      {isAvailable && (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
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
      <div className="pixel-border bg-card p-6 space-y-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading practice session...</p>
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
      <div className="pixel-border chinese-corner bg-card p-6 space-y-5">
        <div className="text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-sm text-foreground leading-relaxed">
            Mock Exam Node
          </h2>
          <p className="text-sm text-muted-foreground">
            This node requires completing a full or partial mock exam for
            {" "}{COMPONENT_INFO[sessionData.component]?.short}: {COMPONENT_INFO[sessionData.component]?.name}.
          </p>
          <p className="text-xs text-muted-foreground">
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
    <div className="pixel-border bg-card p-6 space-y-4 text-center">
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
      <div className="pixel-border bg-card p-6 space-y-4 text-center">
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
      <div className="pixel-border chinese-corner bg-card p-6 space-y-5">
        <div className="text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
          <h2 className="font-pixel text-sm text-foreground leading-relaxed">Drill Complete!</h2>
          <p className={`text-4xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</p>
          <p className="text-sm text-muted-foreground">Score</p>
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
        <Badge variant="outline">{info?.short} Drill</Badge>
      </div>
      <p className="text-xs text-muted-foreground">Focus: {focusArea}</p>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
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
            <p className="text-sm text-muted-foreground text-center">{q.explanation}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Pronunciation Drill Session (C1/C2/C6) ----
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
  const [assessing, setAssessing] = useState(false);
  const [done, setDone] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const info = COMPONENT_INFO[component];

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setAssessing(true);

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
      const score = data.pronunciationScore ?? 0;
      setFinalScore(Math.round(score));
    } catch {
      // Fallback to a reasonable score
      setFinalScore(65);
    } finally {
      setAssessing(false);
      setDone(true);
    }
  }, [component, items]);

  if (done) {
    return (
      <div className="pixel-border chinese-corner bg-card p-6 space-y-5">
        <div className="text-center space-y-2">
          <Mic className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-sm text-foreground leading-relaxed">Drill Complete!</h2>
          <p className={`text-4xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</p>
          <p className="text-sm text-muted-foreground">Pronunciation Score</p>
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
      <div className="pixel-border bg-card p-6 text-center space-y-4">
        <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Assessing your pronunciation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Badge variant="outline">{info?.short} Pronunciation Drill</Badge>
      </div>
      <p className="text-xs text-muted-foreground">Focus: {focusArea}</p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm text-center text-muted-foreground">
            Read the following items aloud in a single recording:
          </p>

          {/* Display items */}
          <div className={`grid gap-2 ${component === 1 ? "grid-cols-5" : "grid-cols-3"} max-h-[300px] overflow-y-auto rounded-lg border bg-muted/30 p-3`}>
            {items.map((item, i) => (
              <div
                key={i}
                className="text-center rounded border bg-card p-2"
              >
                <span className={`font-chinese ${component === 1 ? "text-xl" : "text-base"}`}>
                  {item}
                </span>
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
      <div className="pixel-border bg-card p-6 space-y-4 text-center">
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
      <div className="pixel-border chinese-corner bg-card p-6 space-y-5">
        <div className="text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-sm text-foreground leading-relaxed">Passage Reading Complete!</h2>
          <p className={`text-4xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</p>
          <p className="text-sm text-muted-foreground">Score</p>
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
      <div className="pixel-border bg-card p-6 text-center space-y-4">
        <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Assessing your reading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Badge variant="outline">C4 Passage Reading</Badge>
      </div>
      <p className="text-xs text-muted-foreground">Focus: {focusArea}</p>

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
      <div className="pixel-border chinese-corner bg-card p-6 space-y-5">
        <div className="text-center space-y-2">
          <Mic className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-sm text-foreground leading-relaxed">Speaking Complete!</h2>
          <p className={`text-4xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</p>
          <p className="text-sm text-muted-foreground">Score</p>
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
      <div className="pixel-border bg-card p-6 text-center space-y-4">
        <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Analyzing your speaking...</p>
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
          <Badge variant="outline">C5 Speaking</Badge>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-center text-muted-foreground">
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
        <Badge variant="outline">C5 Speaking</Badge>
      </div>
      <p className="text-xs text-muted-foreground">Focus: {focusArea}</p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Your topic:</p>
            <p className="font-chinese text-xl font-bold text-foreground py-2">{selectedTopic}</p>
            <p className="text-xs text-muted-foreground">Speak for 2-3 minutes</p>
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
  assessmentData,
  loading,
  onComplete,
  onCancel,
}: {
  checkpointNumber: number;
  assessmentData: LearningPathClientProps["assessmentData"];
  loading: boolean;
  onComplete: (scores: Record<string, number>) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const steps: AssessmentStep[] = ["c1", "c2", "c3", "c4", "c5"];

  const randomizedQuiz = useMemo(() => {
    return (assessmentData.quizQuestions ?? []).map(randomizeAnswerPositions);
  }, [assessmentData.quizQuestions]);

  const handleStepComplete = useCallback((key: string, score: number) => {
    const newScores = { ...scores, [key]: score };
    setScores(newScores);

    if (step + 1 >= steps.length) {
      onComplete(newScores);
    } else {
      setStep(step + 1);
    }
  }, [scores, step, steps.length, onComplete]);

  if (loading) {
    return (
      <div className="pixel-border bg-card p-6 space-y-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Submitting checkpoint results...</p>
        </div>
      </div>
    );
  }

  const currentStep = steps[step];

  return (
    <div className="space-y-3">
      {/* Checkpoint header */}
      <div className="pixel-border bg-card p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <span className="font-pixel text-sm text-foreground leading-relaxed">
            Checkpoint {checkpointNumber} of 3
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Step {step + 1} of {steps.length}</span>
        <Progress value={(step / steps.length) * 100} className="flex-1 h-2" />
      </div>

      <p className="text-xs text-muted-foreground italic">
        Quick assessment to track your progress since Phase {checkpointNumber}.
      </p>

      {currentStep === "c3" ? (
        <QuizAssessment
          questions={randomizedQuiz}
          onComplete={(score) => handleStepComplete("c3", score)}
        />
      ) : (
        <SelfAssessment
          componentKey={currentStep}
          componentNumber={parseInt(currentStep.replace("c", ""))}
          onComplete={(score) => handleStepComplete(currentStep, score)}
        />
      )}
    </div>
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
      <div className="pixel-border chinese-corner bg-card p-6 space-y-5">
        <div className="text-center space-y-2">
          <Trophy className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-pixel text-sm text-primary leading-relaxed">
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
                  <p className="font-medium text-sm">{info?.short}: {info?.name}</p>
                  <p className="text-xs text-muted-foreground font-chinese">{info?.chineseName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${scoreColor(s)}`}>{s}</span>
                  {delta !== 0 && (
                    <Badge
                      variant={delta > 0 ? "default" : "destructive"}
                      className="text-xs"
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
            <p className="text-sm text-muted-foreground">Predicted PSC Grade:</p>
            <Badge variant="default" className="text-lg px-4 py-1 mt-1">
              {result.predictedGrade}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              Weighted: {Math.round(weightedScore)}
            </p>
          </div>
        )}

        {/* LLM Feedback */}
        {result?.feedback && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <h3 className="text-sm font-bold text-muted-foreground mb-2">AI Feedback</h3>
            <p className="text-sm text-foreground whitespace-pre-line">{result.feedback}</p>
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
      <div className="pixel-border chinese-corner bg-card p-6 space-y-5">
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
          <p className={`text-5xl font-bold ${scoreColor(finalWeighted)}`}>
            {Math.round(finalWeighted)}
          </p>
          <p className="text-sm text-muted-foreground">Final Predicted Score</p>
          <Badge variant="default" className="text-lg px-4 py-1 mt-2">
            {gradeInfo.grade}
          </Badge>
          <p className="text-xs text-muted-foreground mt-1">{gradeInfo.description}</p>
        </div>

        {/* Growth trajectory */}
        <div className="space-y-2">
          <h3 className="font-pixel text-xs text-muted-foreground leading-relaxed">Growth Trajectory</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
        <div className="grid grid-cols-2 gap-3">
          <div className="pixel-border bg-muted p-3 text-center">
            <p className="text-2xl font-bold text-primary">
              {reportData?.completedNodes?.length ?? plan?.total_nodes ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">Nodes Completed</p>
          </div>
          <div className="pixel-border bg-muted p-3 text-center">
            <p className="text-2xl font-bold text-primary">
              {loading ? "..." : `${Math.round((reportData?.totalStudyMinutes ?? 0) / 60)}h`}
            </p>
            <p className="text-xs text-muted-foreground">Est. Study Time</p>
          </div>
          <div className="pixel-border bg-muted p-3 text-center">
            <p className={`text-2xl font-bold ${finalWeighted > initialWeighted ? "text-green-600" : "text-red-600"}`}>
              {finalWeighted > initialWeighted ? "+" : ""}{Math.round(finalWeighted - initialWeighted)}
            </p>
            <p className="text-xs text-muted-foreground">Score Change</p>
          </div>
          <div className="pixel-border bg-muted p-3 text-center">
            <p className="text-2xl font-bold text-primary">{checkpoints.length}</p>
            <p className="text-xs text-muted-foreground">Checkpoints</p>
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
