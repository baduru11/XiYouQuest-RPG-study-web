"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import type { QuizQuestion } from "@/types/practice";

// ============================================================
// Hardcoded question subsets for the mock exam
// ============================================================

const EXAM_CHARACTERS = [
  "八", "把", "百", "办", "半", "包", "北", "本", "比", "边",
];

const EXAM_WORDS = [
  "国王", "今日", "虐待", "花瓶儿", "难怪", "产品", "掉头", "遭受", "露馅儿", "人群",
];

const EXAM_QUIZ_QUESTIONS: QuizQuestion[] = [
  { id: "1", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["工作", "返工"], correctIndex: 0, explanation: "'工作' is standard Putonghua. '返工' is Cantonese." },
  { id: "2", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["现在", "而家"], correctIndex: 0, explanation: "'现在' is standard. '而家' is Cantonese for 'now'." },
  { id: "3", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["不要", "唔好"], correctIndex: 0, explanation: "'不要' is standard. '唔好' is Cantonese." },
  { id: "4", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["聊天", "吹水"], correctIndex: 0, explanation: "'聊天' is standard. '吹水' is Cantonese slang." },
  { id: "5", type: "word-choice", prompt: "Which is more standard Putonghua?", options: ["下雨", "落雨"], correctIndex: 0, explanation: "'下雨' is standard. '落雨' is dialectal." },
  { id: "8", type: "measure-word", prompt: "一___桌子", options: ["张", "个", "把", "条"], correctIndex: 0, explanation: "桌子 uses 张 as its measure word." },
  { id: "9", type: "measure-word", prompt: "一___书", options: ["本", "张", "个", "片"], correctIndex: 0, explanation: "书 uses 本 as its measure word." },
  { id: "15", type: "sentence-order", prompt: "Which sentence is correct?", options: ["我把书放在桌子上。", "我放在桌子上把书。"], correctIndex: 0, explanation: "The 把 structure requires: Subject + 把 + Object + Verb + Complement." },
  { id: "16", type: "sentence-order", prompt: "Which sentence is correct?", options: ["因为下雨，所以我没去。", "虽然下雨，所以我没去。"], correctIndex: 0, explanation: "'因为...所以...' is the correct paired conjunction." },
  { id: "17", type: "sentence-order", prompt: "Which sentence is correct?", options: ["虽然很累，但是我还得工作。", "虽然很累，所以我还得工作。"], correctIndex: 0, explanation: "'虽然...但是...' is the correct concessive conjunction pair." },
];

const EXAM_PASSAGE = {
  id: "1",
  title: "一段不赶的路",
  content: "我以前总以为，做事越快越好。后来我才明白，真正难的不是速度，而是把每一步走稳。那年我第一次独自出门旅行，行李不多，却把自己弄得很狼狈：票没看清，站台跑错，到了车门口儿才发现身份证差点儿掉在口袋外面。那一刻我很慌，心跳得厉害，脑子里全是\u201C来不及\u201D三个字。后来我深呼吸，停下来，把事情一件一件理顺：先确认车次，再找工作人员，再把包里每样东西摸一遍。结果不但赶上了车，心里反而更踏实。现在我遇到麻烦，常提醒自己：别急，先把顺序摆正；不怕慢，就怕乱。",
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
}

const COMPONENTS: ComponentConfig[] = [
  { number: 1, name: "Monosyllabic Characters", chineseName: "读单音节字词", timeLimitSeconds: 210, weight: 0.10 },
  { number: 2, name: "Multisyllabic Words", chineseName: "读多音节词语", timeLimitSeconds: 150, weight: 0.20 },
  { number: 3, name: "Vocabulary & Grammar", chineseName: "选择判断", timeLimitSeconds: 180, weight: 0.10 },
  { number: 4, name: "Passage Reading", chineseName: "朗读短文", timeLimitSeconds: 240, weight: 0.30 },
  { number: 5, name: "Prompted Speaking", chineseName: "命题说话", timeLimitSeconds: 180, weight: 0.30 },
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
// Main ExamRunner
// ============================================================

type ExamPhase = "start" | "component" | "transition" | "results";

interface ComponentScore {
  componentNumber: 1 | 2 | 3 | 4 | 5;
  score: number;
  xpEarned: number;
}

interface ExamRunnerProps {
  character: {
    id: string;
    name: string;
    personalityPrompt: string;
    voiceId: string;
    expressions: Record<string, string>;
  };
}

export function ExamRunner({ character }: ExamRunnerProps) {
  const [examPhase, setExamPhase] = useState<ExamPhase>("start");
  const [currentComponentIndex, setCurrentComponentIndex] = useState(0);
  const [componentScores, setComponentScores] = useState<ComponentScore[]>([]);
  const [examStartTime] = useState<number>(Date.now());

  // ---- Start Screen ----
  if (examPhase === "start") {
    const totalTime = COMPONENTS.reduce((sum, c) => sum + c.timeLimitSeconds, 0);
    const totalMinutes = Math.ceil(totalTime / 60);

    return (
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Mock PSC Examination</h2>
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
                    Weight: {comp.weight * 100}%
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

  // ---- Transition Screen ----
  if (examPhase === "transition") {
    const lastScore = componentScores[componentScores.length - 1];
    const nextIndex = currentComponentIndex;
    const nextComp = COMPONENTS[nextIndex];

    return (
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="text-center space-y-2">
            <Badge variant="default" className="text-lg px-4 py-1">
              Component {lastScore.componentNumber} Complete
            </Badge>
            <p className="text-4xl font-bold mt-4">
              {Math.round(lastScore.score)}/100
            </p>
            <p className="text-base text-muted-foreground">
              +{lastScore.xpEarned} XP earned
            </p>
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
                  Time limit: {Math.floor(nextComp.timeLimitSeconds / 60)}:{String(nextComp.timeLimitSeconds % 60).padStart(2, "0")}
                </p>
              </div>

              <Button
                size="lg"
                onClick={() => setExamPhase("component")}
              >
                Next: Component {nextComp.number}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Results Screen ----
  if (examPhase === "results") {
    const weightedTotal = componentScores.reduce((sum, cs) => {
      const config = COMPONENTS.find((c) => c.number === cs.componentNumber);
      return sum + cs.score * (config?.weight ?? 0);
    }, 0);

    const totalXP = componentScores.reduce((sum, cs) => sum + cs.xpEarned, 0);
    const gradeInfo = getPSCGrade(weightedTotal);
    const totalDuration = Math.round((Date.now() - examStartTime) / 1000);

    return (
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Mock Exam Results</h2>
            <p className="text-muted-foreground">
              Total exam time: {Math.floor(totalDuration / 60)}m {totalDuration % 60}s
            </p>
          </div>

          {/* PSC Grade */}
          <div className="text-center space-y-1 py-4">
            <p className="text-5xl font-bold">{Math.round(weightedTotal * 10) / 10}</p>
            <p className="text-sm text-muted-foreground">Weighted Total Score (out of 100)</p>
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

          {/* Component breakdown */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-muted-foreground uppercase">Component Scores</h3>
            {componentScores.map((cs) => {
              const config = COMPONENTS.find((c) => c.number === cs.componentNumber);
              const weighted = cs.score * (config?.weight ?? 0);
              return (
                <div key={cs.componentNumber} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">
                      C{cs.componentNumber}: {config?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Weight: {(config?.weight ?? 0) * 100}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      cs.score >= 90 ? "text-green-600" :
                      cs.score >= 60 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {Math.round(cs.score)}/100
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Weighted: {Math.round(weighted * 10) / 10}
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

          <div className="flex justify-center">
            <Button asChild size="lg">
              <a href="/dashboard">Back to Dashboard</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Active Component ----
  const currentComp = COMPONENTS[currentComponentIndex];

  const handleComponentComplete = (score: number, xpEarned: number) => {
    const newScore: ComponentScore = {
      componentNumber: currentComp.number,
      score,
      xpEarned,
    };
    const newScores = [...componentScores, newScore];
    setComponentScores(newScores);

    if (currentComponentIndex + 1 >= COMPONENTS.length) {
      setExamPhase("results");
    } else {
      setCurrentComponentIndex(currentComponentIndex + 1);
      setExamPhase("transition");
    }
  };

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
          items={EXAM_CHARACTERS}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          componentLabel="Monosyllabic Characters"
          onComplete={handleComponentComplete}
        />
      )}
      {currentComp.number === 2 && (
        <PronunciationComponent
          items={EXAM_WORDS}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          componentLabel="Multisyllabic Words"
          onComplete={handleComponentComplete}
        />
      )}
      {currentComp.number === 3 && (
        <QuizComponent
          questions={EXAM_QUIZ_QUESTIONS}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          onComplete={handleComponentComplete}
        />
      )}
      {currentComp.number === 4 && (
        <PassageComponent
          passage={EXAM_PASSAGE}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          onComplete={handleComponentComplete}
        />
      )}
      {currentComp.number === 5 && (
        <SpeakingComponent
          topics={EXAM_TOPICS}
          timeLimitSeconds={currentComp.timeLimitSeconds}
          onComplete={handleComponentComplete}
        />
      )}
    </div>
  );
}

// ============================================================
// Shared Timer Hook
// ============================================================

function useExamTimer(timeLimitSeconds: number, onTimeUp: () => void) {
  const [timeRemaining, setTimeRemaining] = useState(timeLimitSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRunning, setIsRunning] = useState(true);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (!isRunning) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          onTimeUpRef.current();
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

  return { timeRemaining, stop, formatTime: formatSeconds(timeRemaining) };
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// ============================================================
// Component 1 & 2: Pronunciation (Characters / Words)
// ============================================================

interface PronunciationComponentProps {
  items: string[];
  timeLimitSeconds: number;
  componentLabel: string;
  onComplete: (score: number, xpEarned: number) => void;
}

function PronunciationComponent({ items, timeLimitSeconds, componentLabel, onComplete }: PronunciationComponentProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [totalXP, setTotalXP] = useState(0);
  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState<"ready" | "recording" | "assessing" | "scored">("ready");
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleTimeUp = useCallback(() => {
    // Score unfinished items as 0
    const remainingCount = items.length - scores.length;
    const finalScores = [...scores, ...Array(remainingCount).fill(0)];
    const avgScore = finalScores.length > 0
      ? finalScores.reduce((a: number, b: number) => a + b, 0) / finalScores.length
      : 0;
    setIsComplete(true);
    onComplete(avgScore, totalXP);
  }, [items.length, scores, totalXP, onComplete]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await assessRecording(blob);
      };

      mediaRecorder.start();
      setPhase("recording");
    } catch {
      // If mic fails, skip with score 0
      handleScored(0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && phase === "recording") {
      mediaRecorderRef.current.stop();
      setPhase("assessing");
    }
  }, [phase]);

  const assessRecording = useCallback(async (blob: Blob) => {
    setPhase("assessing");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.wav");
      formData.append("referenceText", items[currentIndex]);

      const response = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        handleScored(result.pronunciationScore ?? 0);
      } else {
        handleScored(0);
      }
    } catch {
      handleScored(0);
    }
  }, [currentIndex, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScored = useCallback((pronunciationScore: number) => {
    setCurrentScore(pronunciationScore);
    setPhase("scored");

    const isGood = pronunciationScore >= 60;
    const newStreak = isGood ? streak + 1 : 0;
    setStreak(newStreak);

    const xpResult = calculateXP({
      pronunciationScore,
      isCorrect: isGood,
      currentStreak: newStreak,
    });
    setTotalXP((prev) => prev + xpResult.totalXP);
    setScores((prev) => [...prev, pronunciationScore]);
  }, [streak]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= items.length) {
      const allScores = [...scores];
      const avgScore = allScores.length > 0
        ? allScores.reduce((a, b) => a + b, 0) / allScores.length
        : 0;
      timer.stop();
      setIsComplete(true);
      onComplete(avgScore, totalXP);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setCurrentScore(null);
      setPhase("ready");
    }
  }, [currentIndex, items.length, scores, totalXP, timer, onComplete]);

  if (isComplete) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Processing results...</p>
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
            {componentLabel}: {currentIndex + 1}/{items.length}
          </span>
          <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "outline"}>
            {timer.formatTime}
          </Badge>
        </div>
        <Progress value={(currentIndex / items.length) * 100} className="h-2" />

        {/* Character display */}
        <div className="text-center py-6">
          <p className="text-7xl font-bold sm:text-8xl">{items[currentIndex]}</p>
        </div>

        {/* Score display */}
        {currentScore !== null && phase === "scored" && (
          <div className="text-center">
            <p className={`text-3xl font-bold ${
              currentScore >= 90 ? "text-green-600" :
              currentScore >= 60 ? "text-yellow-600" : "text-red-600"
            }`}>
              {currentScore}/100
            </p>
          </div>
        )}

        {/* Assessing spinner */}
        {phase === "assessing" && (
          <div className="text-center space-y-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">Analyzing...</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-3">
          {phase === "ready" && (
            <Button onClick={startRecording} size="lg">Record</Button>
          )}
          {phase === "recording" && (
            <Button onClick={stopRecording} variant="destructive" size="lg">
              Stop Recording
            </Button>
          )}
          {phase === "scored" && (
            <Button onClick={handleNext} size="lg">
              {currentIndex + 1 >= items.length ? "Finish" : "Next"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component 3: Quiz
// ============================================================

interface QuizComponentProps {
  questions: QuizQuestion[];
  timeLimitSeconds: number;
  onComplete: (score: number, xpEarned: number) => void;
}

function QuizComponent({ questions, timeLimitSeconds, onComplete }: QuizComponentProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const handleTimeUp = useCallback(() => {
    const score = questions.length > 0
      ? (correctCount / questions.length) * 100
      : 0;
    setIsComplete(true);
    onComplete(score, totalXP);
  }, [correctCount, questions.length, totalXP, onComplete]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp);

  const currentQuestion = questions[currentIndex];

  const handleAnswer = useCallback((answerIndex: number) => {
    if (showResult) return;
    setSelectedAnswer(answerIndex);
    setShowResult(true);

    const isCorrect = answerIndex === currentQuestion.correctIndex;
    if (isCorrect) setCorrectCount((prev) => prev + 1);

    const newStreak = isCorrect ? streak + 1 : 0;
    setStreak(newStreak);

    const xpResult = calculateXP({
      isCorrect,
      currentStreak: newStreak,
    });
    setTotalXP((prev) => prev + xpResult.totalXP);
  }, [showResult, currentQuestion, streak]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      const finalCorrect = correctCount;
      const score = questions.length > 0 ? (finalCorrect / questions.length) * 100 : 0;
      timer.stop();
      setIsComplete(true);
      onComplete(score, totalXP);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    }
  }, [currentIndex, questions.length, correctCount, totalXP, timer, onComplete]);

  if (isComplete) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Processing results...</p>
        </CardContent>
      </Card>
    );
  }

  function getOptionStyle(index: number): string {
    if (!showResult) {
      return "border-2 border-border hover:border-primary hover:bg-accent transition-colors cursor-pointer";
    }
    if (index === currentQuestion.correctIndex) {
      return "border-2 border-green-500 bg-green-50 dark:bg-green-950/30";
    }
    if (index === selectedAnswer && index !== currentQuestion.correctIndex) {
      return "border-2 border-red-500 bg-red-50 dark:bg-red-950/30";
    }
    return "border-2 border-border opacity-50";
  }

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

        {/* Question */}
        <div className="text-center py-4">
          <Badge variant="outline" className="mb-2">{currentQuestion.type}</Badge>
          <p className={`font-bold ${
            currentQuestion.type === "measure-word" ? "text-3xl" : "text-xl"
          }`}>
            {currentQuestion.prompt}
          </p>
        </div>

        {/* Options */}
        <div className={`grid gap-3 ${
          currentQuestion.type === "measure-word" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"
        }`}>
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={showResult}
              className={`rounded-lg p-3 text-left transition-all ${getOptionStyle(index)} ${
                showResult ? "cursor-default" : ""
              }`}
            >
              <span className={`font-medium ${
                currentQuestion.type === "measure-word" ? "text-2xl" : "text-lg"
              }`}>
                {String.fromCharCode(65 + index)}. {option}
              </span>
            </button>
          ))}
        </div>

        {/* Explanation */}
        {showResult && (
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
          </div>
        )}

        {/* Next */}
        {showResult && (
          <div className="flex justify-center">
            <Button onClick={handleNext} size="lg">
              {currentIndex + 1 >= questions.length ? "Finish" : "Next"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component 4: Passage Reading
// ============================================================

interface PassageComponentProps {
  passage: { id: string; title: string; content: string };
  timeLimitSeconds: number;
  onComplete: (score: number, xpEarned: number) => void;
}

function PassageComponent({ passage, timeLimitSeconds, onComplete }: PassageComponentProps) {
  const [phase, setPhase] = useState<"ready" | "recording" | "assessing" | "done">("ready");
  const [isComplete, setIsComplete] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const handleTimeUp = useCallback(() => {
    // Stop recording if active
    if (mediaRecorderRef.current && phase === "recording") {
      mediaRecorderRef.current.stop();
      return; // onstop handler will assess
    }
    if (!isComplete) {
      setIsComplete(true);
      onComplete(0, 0);
    }
  }, [phase, isComplete, onComplete]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await assessPassage(blob);
      };

      mediaRecorder.start();
      setPhase("recording");
    } catch {
      setIsComplete(true);
      timer.stop();
      onComplete(0, 0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && phase === "recording") {
      mediaRecorderRef.current.stop();
      setPhase("assessing");
    }
  }, [phase]);

  const assessPassage = useCallback(async (blob: Blob) => {
    setPhase("assessing");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.wav");
      formData.append("referenceText", passage.content);
      formData.append("mode", "long");

      const response = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      let pronunciationScore = 0;
      if (response.ok) {
        const result = await response.json();
        pronunciationScore = result.pronunciationScore ?? 0;
      }

      const isGood = pronunciationScore >= 60;
      const xpResult = calculateXP({
        pronunciationScore,
        isCorrect: isGood,
        currentStreak: isGood ? 1 : 0,
      });

      timer.stop();
      setIsComplete(true);
      onComplete(pronunciationScore, xpResult.totalXP);
    } catch {
      timer.stop();
      setIsComplete(true);
      onComplete(0, 0);
    }
  }, [passage.content, timer, onComplete]);

  if (isComplete) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Processing results...</p>
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
          <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "outline"}>
            {timer.formatTime}
          </Badge>
        </div>

        {/* Passage text */}
        <div className="rounded-lg border bg-muted/30 p-6 leading-relaxed">
          <p className="text-lg leading-loose">{passage.content}</p>
        </div>

        {/* Assessing spinner */}
        {phase === "assessing" && (
          <div className="text-center space-y-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">Analyzing your reading...</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-3">
          {phase === "ready" && (
            <Button onClick={startRecording} size="lg">
              Start Reading
            </Button>
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
// Component 5: Prompted Speaking
// ============================================================

interface SpeakingComponentProps {
  topics: string[];
  timeLimitSeconds: number;
  onComplete: (score: number, xpEarned: number) => void;
}

function SpeakingComponent({ topics, timeLimitSeconds, onComplete }: SpeakingComponentProps) {
  const [selectedTopic] = useState<string>(() => {
    const randomIndex = Math.floor(Math.random() * topics.length);
    return topics[randomIndex];
  });
  const [phase, setPhase] = useState<"ready" | "recording" | "assessing" | "done">("ready");
  const [isComplete, setIsComplete] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const handleTimeUp = useCallback(() => {
    if (mediaRecorderRef.current && phase === "recording") {
      mediaRecorderRef.current.stop();
      return; // onstop handler will assess
    }
    if (!isComplete) {
      setIsComplete(true);
      onComplete(0, 0);
    }
  }, [phase, isComplete, onComplete]);

  const timer = useExamTimer(timeLimitSeconds, handleTimeUp);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await assessSpeaking(blob);
      };

      mediaRecorder.start();
      setPhase("recording");
    } catch {
      setIsComplete(true);
      timer.stop();
      onComplete(0, 0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && phase === "recording") {
      mediaRecorderRef.current.stop();
      setPhase("assessing");
    }
  }, [phase]);

  const assessSpeaking = useCallback(async (blob: Blob) => {
    setPhase("assessing");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.wav");
      formData.append("referenceText", selectedTopic);
      formData.append("mode", "long");

      const response = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      let pronunciationScore = 0;
      if (response.ok) {
        const result = await response.json();
        pronunciationScore = result.pronunciationScore ?? 0;
      }

      const isGood = pronunciationScore >= 60;
      const xpResult = calculateXP({
        pronunciationScore,
        isCorrect: isGood,
        currentStreak: isGood ? 1 : 0,
      });

      timer.stop();
      setIsComplete(true);
      onComplete(pronunciationScore, xpResult.totalXP);
    } catch {
      timer.stop();
      setIsComplete(true);
      onComplete(0, 0);
    }
  }, [selectedTopic, timer, onComplete]);

  if (isComplete) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-lg font-medium">Processing results...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Prompted Speaking</span>
          <Badge variant={timer.timeRemaining <= 30 ? "destructive" : "outline"}>
            {timer.formatTime}
          </Badge>
        </div>

        {/* Topic display */}
        <div className="text-center py-6">
          <Badge variant="outline" className="mb-3">Your Topic</Badge>
          <p className="text-3xl font-bold sm:text-4xl">{selectedTopic}</p>
        </div>

        {/* Speaking template */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <p className="font-medium text-muted-foreground">Structure Guide:</p>
          <p>Opening (10-15s): Introduce the topic</p>
          <p>Body (~2m 20s): 2-3 main points with examples</p>
          <p>Closing (10-15s): Summarize your thoughts</p>
        </div>

        {/* Assessing spinner */}
        {phase === "assessing" && (
          <div className="text-center space-y-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">Analyzing your speech...</p>
          </div>
        )}

        {/* Recording indicator */}
        {phase === "recording" && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-2 dark:bg-red-950/30">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300">Recording...</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-3">
          {phase === "ready" && (
            <Button onClick={startRecording} size="lg">
              Start Speaking
            </Button>
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
