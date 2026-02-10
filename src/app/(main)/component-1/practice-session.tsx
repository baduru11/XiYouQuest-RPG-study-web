"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { CharacterDisplay } from "@/components/character/character-display";
import { DialogueBox } from "@/components/character/dialogue-box";
import { AudioRecorder } from "@/components/practice/audio-recorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import { lookupPinyinDisplay } from "@/lib/pinyin";
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
  characterId?: string;
  component: 1 | 2 | 3 | 4 | 5;
}

type SessionPhase = "ready" | "listening" | "recording" | "assessing" | "feedback" | "complete";

interface WordScore {
  word: string;
  score: number | null;
}

interface GroupResult {
  words: string[];
  wordScores: WordScore[];
  groupXP: number;
}

export function PracticeSession({ questions, character, characterId, component }: PracticeSessionProps) {
  const [wordGroups, setWordGroups] = useState<string[][]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("ready");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState(`Let's practice some monosyllabic characters! I'll help you along the way.`);
  const [wordScores, setWordScores] = useState<WordScore[]>([]);
  const [streak, setStreak] = useState(0);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [groupResults, setGroupResults] = useState<GroupResult[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isPlayingCompanion, setIsPlayingCompanion] = useState(false);
  const [, setFeedbackText] = useState("");
  const [showPinyin, setShowPinyin] = useState(false);
  const hasPlayedGreeting = useRef(false);

  // Initialize word groups (shuffle questions into groups of 5)
  useEffect(() => {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    const groups: string[][] = [];
    for (let i = 0; i < shuffled.length; i += 5) {
      groups.push(shuffled.slice(i, i + 5));
    }
    setWordGroups(groups);
  }, [questions]);

  const currentWords = wordGroups[currentGroupIndex] || [];
  const progressPercent = wordGroups.length > 0 ? Math.round((currentGroupIndex / wordGroups.length) * 100) : 0;

  const speakWithBrowserTTS = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 0.9;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const playCompanionVoice = useCallback(async (text: string, companionExpression: ExpressionName) => {
    if (isPlayingCompanion || isPlayingAudio) return;
    setIsPlayingCompanion(true);
    try {
      const response = await fetch("/api/tts/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: character.voiceId,
          text,
          expression: companionExpression,
        }),
      });
      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          setIsPlayingCompanion(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          setIsPlayingCompanion(false);
        };
        await audio.play();
      } else {
        setIsPlayingCompanion(false);
      }
    } catch {
      setIsPlayingCompanion(false);
    }
  }, [character.voiceId, isPlayingCompanion, isPlayingAudio]);

  // Greeting on mount
  useEffect(() => {
    if (!hasPlayedGreeting.current) {
      hasPlayedGreeting.current = true;
      // Schedule after mount to avoid setState-in-effect lint warning
      const id = setTimeout(() => {
        playCompanionVoice(
          "Let's practice some monosyllabic characters! I'll help you along the way.",
          "neutral"
        );
      }, 300);
      return () => clearTimeout(id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save progress when session completes
  useEffect(() => {
    if (phase !== "complete" || !characterId) return;

    const saveProgress = async () => {
      const allScores = groupResults.flatMap(g =>
        g.wordScores.filter(ws => ws.score !== null).map(ws => ws.score!)
      );
      const avgScore = allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0;

      try {
        await fetch("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component,
            score: avgScore,
            xpEarned: totalXPEarned,
            durationSeconds: 0,
            questionsAttempted: 1,
            questionsCorrect: avgScore >= 60 ? 1 : 0,
            bestStreak: streak,
          }),
        });
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    };

    saveProgress();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const playCharacterVoice = useCallback(async () => {
    if (isPlayingAudio || currentWords.length === 0) return;
    setIsPlayingAudio(true);
    setPhase("listening");
    setExpression("happy");
    setDialogue(`Listen carefully to all ${currentWords.length} characters...`);

    const onFinished = () => {
      setIsPlayingAudio(false);
      setPhase("ready");
      setExpression("encouraging");
      setDialogue("Now it's your turn! Try to pronounce all of them in sequence.");
    };

    try {
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: character.voiceId,
          words: currentWords,
          pauseMs: 750,
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          onFinished();
        };
        audio.onerror = async () => {
          URL.revokeObjectURL(audioUrl);
          await speakWithBrowserTTS(currentWords.join("，"));
          onFinished();
        };
        await audio.play();
      } else {
        await speakWithBrowserTTS(currentWords.join("，"));
        onFinished();
      }
    } catch {
      try {
        await speakWithBrowserTTS(currentWords.join("，"));
      } catch { /* ignore */ }
      onFinished();
    }
  }, [currentWords, character.voiceId, isPlayingAudio, speakWithBrowserTTS]);

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setPhase("assessing");
    setExpression("thinking");
    setDialogue("Let me check all your characters...");

    try {
      // Send all 5 words as reference text (space-separated for Azure)
      const referenceText = currentWords.join(" ");

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("referenceText", referenceText);

      const assessResponse = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      const assessResult = await assessResponse.json();

      // Extract per-word scores — match by text content, not index,
      // because Azure may segment Chinese words differently than expected
      const usedIndices = new Set<number>();
      const scores = currentWords.map((word) => {
        const idx = assessResult.words?.findIndex(
          (w: { word: string }, i: number) => w.word === word && !usedIndices.has(i)
        ) ?? -1;
        if (idx >= 0) usedIndices.add(idx);
        const wordData = idx >= 0 ? assessResult.words[idx] : null;
        return {
          word,
          score: wordData?.accuracyScore ?? null,
        };
      });
      setWordScores(scores);

      // Calculate group average for XP
      const validScores = scores
        .map(w => w.score)
        .filter((s): s is number => s !== null);
      const avgScore = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 0;

      // Calculate XP based on average
      const isGood = avgScore >= 60;
      const newStreak = isGood ? streak + 1 : 0;
      setStreak(newStreak);

      const xpResult = calculateXP({
        pronunciationScore: avgScore,
        isCorrect: isGood,
        currentStreak: newStreak,
      });
      setTotalXPEarned((prev) => prev + xpResult.totalXP);

      // Get AI feedback for the group
      setPhase("feedback");

      let spokenFeedback = "";
      try {
        const feedbackResponse = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterPrompt: character.personalityPrompt,
            component: 1,
            questionText: currentWords.join(", "),
            userAnswer: currentWords.join(" "),
            pronunciationScore: avgScore,
            isCorrect: isGood,
          }),
        });

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          spokenFeedback = feedbackData.feedback;
        } else {
          spokenFeedback = avgScore >= 90
            ? "Excellent! All characters were perfect!"
            : avgScore >= 60
            ? "Good work! Most characters were clear."
            : "Keep practicing. Try to match the tones for each character.";
        }
      } catch {
        spokenFeedback = avgScore >= 90
          ? "Excellent! All characters were perfect!"
          : avgScore >= 60
          ? "Good work! Most characters were clear."
          : "Keep practicing. Try to match the tones for each character.";
      }

      setFeedbackText(spokenFeedback);
      setDialogue(spokenFeedback);

      // Determine expression based on avg score
      const feedbackExpression: ExpressionName =
        avgScore >= 90 ? "excited" : avgScore >= 60 ? "happy" : "encouraging";
      setExpression(feedbackExpression);

      if (spokenFeedback) {
        playCompanionVoice(spokenFeedback, feedbackExpression);
      }

      // Store group result
      setGroupResults(prev => [
        ...prev,
        {
          words: currentWords,
          wordScores: scores,
          groupXP: xpResult.totalXP,
        },
      ]);
    } catch {
      setPhase("feedback");
      setExpression("surprised");
      setDialogue("Hmm, something went wrong with the assessment. Let's try the next one!");

      setGroupResults(prev => [
        ...prev,
        {
          words: currentWords,
          wordScores: currentWords.map(w => ({ word: w, score: null })),
          groupXP: 0,
        },
      ]);
    }
  }, [currentWords, character.personalityPrompt, streak, playCompanionVoice]);

  const handleSkip = useCallback(() => {
    // Store empty result for skipped group
    setGroupResults(prev => [
      ...prev,
      {
        words: currentWords,
        wordScores: currentWords.map(w => ({ word: w, score: null })),
        groupXP: 0,
      },
    ]);

    if (currentGroupIndex + 1 >= wordGroups.length) {
      setPhase("complete");
      setExpression("proud");
      setDialogue("Practice complete! Let's see your results!");
    } else {
      setCurrentGroupIndex(prev => prev + 1);
      setPhase("ready");
      setWordScores([]);
      setFeedbackText("");
      setShowPinyin(false);
      setExpression("neutral");
      setDialogue("Skipped! Ready for the next group?");
    }
  }, [currentWords, currentGroupIndex, wordGroups.length]);

  const handleNext = useCallback(() => {
    if (currentGroupIndex + 1 >= wordGroups.length) {
      setPhase("complete");
      setExpression("proud");
      const completionMsg = "Amazing! You completed all the groups!";
      setDialogue(completionMsg);
      playCompanionVoice(completionMsg, "proud");
    } else {
      setCurrentGroupIndex(prev => prev + 1);
      setPhase("ready");
      setWordScores([]);
      setFeedbackText("");
      setShowPinyin(false);
      setExpression("neutral");
      setDialogue("Ready for the next group? Listen first!");
    }
  }, [currentGroupIndex, wordGroups.length, playCompanionVoice]);

  // Completion screen
  if (phase === "complete") {
    const totalGroups = groupResults.length;
    const totalCharacters = groupResults.reduce((sum, g) => sum + g.words.length, 0);

    // Calculate average across all individual word scores
    let allScores: number[] = [];
    groupResults.forEach(g => {
      g.wordScores.forEach(ws => {
        if (ws.score !== null) allScores.push(ws.score);
      });
    });

    const averageScore = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;
    const correctCount = allScores.filter(s => s >= 60).length;
    const accuracy = totalCharacters > 0 ? Math.round((correctCount / totalCharacters) * 100) : 0;

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
                <p className="text-3xl font-bold">{totalCharacters}</p>
                <p className="text-sm text-muted-foreground">Characters</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{correctCount}</p>
                <p className="text-sm text-muted-foreground">Good (60+)</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{averageScore}</p>
                <p className="text-sm text-muted-foreground">Avg Score</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-600">+{totalXPEarned}</p>
                <p className="text-sm text-muted-foreground">XP Earned</p>
              </div>
            </div>

            <Progress value={accuracy} className="h-3" />
            <p className="text-center text-sm text-muted-foreground">
              {accuracy}% accuracy
            </p>

            {/* Results by group */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {groupResults.map((result, groupIdx) => (
                <div key={groupIdx} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Group {groupIdx + 1}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        Avg: {Math.round(
                          result.wordScores
                            .map(w => w.score ?? 0)
                            .reduce((a, b) => a + b, 0) / result.wordScores.length
                        )}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        +{result.groupXP} XP
                      </span>
                    </div>
                  </div>

                  {/* Per-word scores */}
                  <div className="flex gap-2 text-sm flex-wrap">
                    {result.wordScores.map((ws, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <span>{ws.word}</span>
                        <Badge
                          variant={
                            ws.score === null ? "outline" :
                            ws.score >= 90 ? "default" :
                            ws.score >= 60 ? "secondary" : "destructive"
                          }
                        >
                          {ws.score ?? "N/A"}
                        </Badge>
                      </div>
                    ))}
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
            Group {currentGroupIndex + 1} of {wordGroups.length}
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
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Left side: Character (30%) */}
        <div className="space-y-3 md:w-[30%]">
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
        <div className="flex-1 md:w-[70%]">
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

              {/* 5-word grid display */}
              <div className="grid grid-cols-5 gap-3 w-full max-w-4xl">
                {currentWords.map((word, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-center rounded-lg border-2 border-muted p-4 hover:border-primary transition-colors">
                      <p className="text-4xl font-bold font-chinese">{word}</p>
                    </div>
                    {showPinyin && (
                      <p className="text-center text-2xl text-muted-foreground italic">
                        {lookupPinyinDisplay(word) ?? "—"}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Score display (after assessment) */}
              {wordScores.length > 0 && phase === "feedback" && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4 w-full max-w-4xl">
                  {/* Individual word scores */}
                  <div className="grid grid-cols-5 gap-3">
                    {wordScores.map((item, idx) => (
                      <div key={idx} className="text-center space-y-1">
                        <p className="text-2xl font-bold font-chinese">{item.word}</p>
                        {item.score !== null ? (
                          <p className={`text-lg font-bold ${
                            item.score >= 90 ? "text-green-600" :
                            item.score >= 60 ? "text-yellow-600" : "text-red-600"
                          }`}>
                            {item.score}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">--</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Average score */}
                  <div className="text-center">
                    <p className="text-lg text-muted-foreground">Group Average</p>
                    <p className="text-4xl font-bold text-primary">
                      {Math.round(
                        wordScores
                          .map(w => w.score ?? 0)
                          .reduce((a, b) => a + b, 0) / wordScores.length
                      )}/100
                    </p>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {phase === "assessing" && (
                <div className="text-center space-y-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-sm font-medium">Analyzing pronunciation...</p>
                  <p className="text-xs text-muted-foreground">Checking tones, accuracy, and fluency</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col items-center gap-3">
                {(phase === "ready" || phase === "listening") && (
                  <>
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={playCharacterVoice}
                        disabled={isPlayingAudio}
                        variant="outline"
                        size="lg"
                        className="hover:scale-[1.02] transition-transform"
                      >
                        {isPlayingAudio ? "Playing..." : "Listen"}
                      </Button>
                      <Button
                        onClick={handleSkip}
                        disabled={isPlayingAudio}
                        variant="ghost"
                        size="lg"
                        className="hover:scale-[1.02] transition-transform"
                      >
                        Skip
                      </Button>
                    </div>
                    <AudioRecorder
                      onRecordingComplete={handleRecordingComplete}
                      disabled={isPlayingAudio}
                    />
                  </>
                )}

                {phase === "feedback" && (
                  <Button onClick={handleNext} size="lg">
                    {currentGroupIndex + 1 >= wordGroups.length ? "See Results" : "Next Group"}
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
