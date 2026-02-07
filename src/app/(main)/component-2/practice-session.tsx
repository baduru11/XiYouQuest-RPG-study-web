"use client";

import { useState, useCallback, useMemo } from "react";
import { CharacterDisplay } from "@/components/character/character-display";
import { DialogueBox } from "@/components/character/dialogue-box";
import { AudioRecorder } from "@/components/practice/audio-recorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import type { ExpressionName } from "@/types/character";
import type { QuestionResult } from "@/types/practice";

interface PracticeSessionProps {
  questions: string[];
  character: {
    name: string;
    personalityPrompt: string;
    voiceId: string;
    expressions: Record<string, string>;
  };
}

type SessionPhase = "ready" | "listening" | "recording" | "assessing" | "feedback" | "complete";

// Detect tricky phonetic elements in multisyllabic words
function detectTrickyElements(word: string): string[] {
  const elements: string[] = [];

  // Erhua (儿化) detection - words ending with 儿
  if (word.includes("儿") && word.indexOf("儿") > 0) {
    elements.push("儿化 (Erhua)");
  }

  // Tone sandhi (变调) - common patterns
  // "一" and "不" change tones depending on context
  if (word.includes("一")) {
    elements.push("变调 (Tone sandhi: 一)");
  }
  if (word.includes("不")) {
    elements.push("变调 (Tone sandhi: 不)");
  }

  // Common neutral tone (轻声) indicators
  const neutralToneSuffixes = ["子", "头", "面", "么", "的", "了", "着", "过", "吗", "呢", "吧", "啊"];
  for (const suffix of neutralToneSuffixes) {
    if (word.endsWith(suffix) && word.length > 1) {
      elements.push("轻声 (Neutral tone)");
      break;
    }
  }

  return elements;
}

export function PracticeSession({ questions, character }: PracticeSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("ready");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState(`Let's practice multisyllabic words! Pay attention to tone changes and natural flow.`);
  const [score, setScore] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showPinyin, setShowPinyin] = useState(false);

  const currentQuestion = questions[currentIndex];
  const progressPercent = questions.length > 0 ? Math.round((currentIndex / questions.length) * 100) : 0;

  // Detect tricky elements for the current word
  const trickyElements = useMemo(() => detectTrickyElements(currentQuestion), [currentQuestion]);

  const playCharacterVoice = useCallback(async () => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    setPhase("listening");
    setExpression("happy");
    setDialogue(`Listen carefully: "${currentQuestion}"`);

    try {
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: character.voiceId,
          text: currentQuestion,
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          setIsPlayingAudio(false);
          setPhase("ready");
          setExpression("encouraging");
          setDialogue("Now it's your turn! Try to say the word naturally.");
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          setIsPlayingAudio(false);
          setPhase("ready");
          setExpression("encouraging");
          setDialogue("Audio unavailable, but give it a try anyway!");
        };
        await audio.play();
      } else {
        setIsPlayingAudio(false);
        setPhase("ready");
        setExpression("neutral");
        setDialogue("Could not load audio. Try pronouncing it on your own!");
      }
    } catch {
      setIsPlayingAudio(false);
      setPhase("ready");
      setExpression("neutral");
      setDialogue("Audio service unavailable. Try pronouncing it!");
    }
  }, [currentQuestion, character.voiceId, isPlayingAudio]);

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setPhase("assessing");
    setExpression("thinking");
    setDialogue("Let me listen to your pronunciation...");

    try {
      // Send audio to speech assessment API
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("referenceText", currentQuestion);

      const assessResponse = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      let pronunciationScore = 0;
      if (assessResponse.ok) {
        const assessResult = await assessResponse.json();
        pronunciationScore = assessResult.pronunciationScore ?? 0;
      }

      setScore(pronunciationScore);

      // Determine result quality
      const isGood = pronunciationScore >= 60;
      const isPerfect = pronunciationScore >= 90;

      // Calculate XP
      const newStreak = isGood ? streak + 1 : 0;
      setStreak(newStreak);

      const xpResult = calculateXP({
        pronunciationScore,
        isCorrect: isGood,
        currentStreak: newStreak,
      });
      setTotalXPEarned((prev) => prev + xpResult.totalXP);

      // Get AI character feedback
      setPhase("feedback");

      try {
        const feedbackResponse = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterPrompt: character.personalityPrompt,
            component: 2,
            questionText: currentQuestion,
            userAnswer: currentQuestion,
            pronunciationScore,
            isCorrect: isGood,
          }),
        });

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          setFeedbackText(feedbackData.feedback);
          setDialogue(feedbackData.feedback);
        } else {
          const fallback = isPerfect
            ? `Excellent! Your pronunciation of "${currentQuestion}" was perfect! Great tones and flow!`
            : isGood
            ? `Good job on "${currentQuestion}"! Keep practicing the tone transitions.`
            : `"${currentQuestion}" needs more practice. Pay attention to the tone changes between syllables.`;
          setFeedbackText(fallback);
          setDialogue(fallback);
        }
      } catch {
        const fallback = isPerfect
          ? `Excellent! Score: ${pronunciationScore}/100!`
          : isGood
          ? `Not bad! Score: ${pronunciationScore}/100. Keep it up!`
          : `Score: ${pronunciationScore}/100. Let's try to improve!`;
        setFeedbackText(fallback);
        setDialogue(fallback);
      }

      // Set expression based on score
      if (isPerfect) {
        setExpression("excited");
      } else if (isGood) {
        setExpression("happy");
      } else {
        setExpression("encouraging");
      }

      // Store result
      setResults((prev) => [
        ...prev,
        {
          questionText: currentQuestion,
          userAnswer: currentQuestion,
          isCorrect: isGood,
          pronunciationScore,
          feedback: feedbackText || "",
          xpEarned: xpResult.totalXP,
        },
      ]);
    } catch {
      setPhase("feedback");
      setExpression("surprised");
      setDialogue("Hmm, something went wrong with the assessment. Let's try the next one!");
      setScore(null);

      setResults((prev) => [
        ...prev,
        {
          questionText: currentQuestion,
          userAnswer: null,
          isCorrect: false,
          pronunciationScore: null,
          feedback: "Assessment failed",
          xpEarned: 0,
        },
      ]);
    }
  }, [currentQuestion, character.personalityPrompt, streak, feedbackText]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setPhase("complete");
      setExpression("proud");
      setDialogue("Amazing work! You've completed all the words. Let's see your results!");
    } else {
      setCurrentIndex((prev) => prev + 1);
      setPhase("ready");
      setScore(null);
      setFeedbackText("");
      setShowPinyin(false);
      setExpression("neutral");
      setDialogue("Ready for the next word? Listen first, then try it yourself!");
    }
  }, [currentIndex, questions.length]);

  // Completion screen
  if (phase === "complete") {
    const totalQuestions = results.length;
    const correctCount = results.filter((r) => r.isCorrect).length;
    const averageScore =
      totalQuestions > 0
        ? Math.round(
            results.reduce((sum, r) => sum + (r.pronunciationScore ?? 0), 0) / totalQuestions
          )
        : 0;
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression="proud"
          />
          <DialogueBox
            text={dialogue}
            characterName={character.name}
          />
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-xl font-bold text-center">Practice Complete!</h2>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{totalQuestions}</p>
                <p className="text-xs text-muted-foreground">Words</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{correctCount}</p>
                <p className="text-xs text-muted-foreground">Good (60+)</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{averageScore}</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">+{totalXPEarned}</p>
                <p className="text-xs text-muted-foreground">XP Earned</p>
              </div>
            </div>

            <Progress value={accuracy} className="h-3" />
            <p className="text-center text-sm text-muted-foreground">
              {accuracy}% accuracy
            </p>

            {/* Individual results */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <span className="text-lg font-medium">{result.questionText}</span>
                  <div className="flex items-center gap-2">
                    {result.pronunciationScore !== null ? (
                      <Badge
                        variant={
                          result.pronunciationScore >= 90
                            ? "default"
                            : result.pronunciationScore >= 60
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {result.pronunciationScore}
                      </Badge>
                    ) : (
                      <Badge variant="outline">N/A</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      +{result.xpEarned} XP
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={() => window.location.reload()}>
                Practice Again
              </Button>
              <Button variant="outline" asChild>
                <a href="/dashboard">Back to Dashboard</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main practice UI
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            Word {currentIndex + 1} of {questions.length}
          </span>
          <span className="flex items-center gap-2">
            {streak > 0 && (
              <Badge variant="secondary">
                Streak: {streak}
              </Badge>
            )}
            <Badge variant="outline">+{totalXPEarned} XP</Badge>
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Main content area */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left side: Character (30%) */}
        <div className="space-y-3 lg:w-[30%]">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression={expression}
          />
          <DialogueBox
            text={dialogue}
            characterName={character.name}
          />
        </div>

        {/* Right side: Practice area (70%) */}
        <div className="flex-1 lg:w-[70%]">
          <Card className="h-full">
            <CardContent className="flex flex-col items-center justify-center gap-6 py-8">
              {/* Show Pinyin toggle */}
              <div className="flex items-center gap-2">
                <Button
                  variant={showPinyin ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPinyin(!showPinyin)}
                >
                  {showPinyin ? "Hide Pinyin" : "Show Pinyin"}
                </Button>
              </div>

              {/* Large word display */}
              <div className="text-center">
                <p className="text-6xl font-bold leading-tight sm:text-7xl">
                  {currentQuestion}
                </p>
                {showPinyin && (
                  <p className="mt-2 text-lg text-muted-foreground italic">
                    (Pinyin will appear when available)
                  </p>
                )}
              </div>

              {/* Tricky element highlights */}
              {trickyElements.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {trickyElements.map((element, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {element}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Score display (after assessment) */}
              {score !== null && phase === "feedback" && (
                <div className="text-center space-y-1">
                  <p
                    className={`text-4xl font-bold ${
                      score >= 90
                        ? "text-green-600"
                        : score >= 60
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    {score}/100
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {score >= 90
                      ? "Excellent!"
                      : score >= 60
                      ? "Good effort!"
                      : "Needs improvement"}
                  </p>
                </div>
              )}

              {/* Loading state */}
              {phase === "assessing" && (
                <div className="text-center space-y-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-sm text-muted-foreground">Analyzing pronunciation...</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col items-center gap-3">
                {(phase === "ready" || phase === "listening") && (
                  <>
                    <Button
                      onClick={playCharacterVoice}
                      disabled={isPlayingAudio}
                      variant="outline"
                      size="lg"
                    >
                      {isPlayingAudio ? "Playing..." : "Listen"}
                    </Button>
                    <AudioRecorder
                      onRecordingComplete={handleRecordingComplete}
                      disabled={isPlayingAudio}
                    />
                  </>
                )}

                {phase === "feedback" && (
                  <Button onClick={handleNext} size="lg">
                    {currentIndex + 1 >= questions.length ? "See Results" : "Next Word"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
