"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { CharacterDisplay } from "@/components/character/character-display";
import { DialogueBox } from "@/components/character/dialogue-box";
import { AudioRecorder } from "@/components/practice/audio-recorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import { lookupPinyinDisplay } from "@/lib/pinyin";
import { C6_WORDS_PER_GROUP } from "@/lib/constants";
import { fetchWithRetry } from "@/lib/fetch-retry";
import type { ExpressionName } from "@/types/character";
import type { ComponentNumber } from "@/types/practice";

interface CategoryBoundary {
  label: string;
  startIndex: number;
}

interface PracticeSessionProps {
  questions: string[];
  character: {
    name: string;
    personalityPrompt: string;
    voiceId: string;
    expressions: Record<string, string>;
  };
  characterId?: string;
  component: ComponentNumber;
  categoryBoundaries: CategoryBoundary[];
}

type SessionPhase = "ready" | "recording" | "assessing" | "feedback" | "complete";

interface WordScore {
  word: string;
  score: number | null;
  toneScore?: number;
  phoneError?: string;
}

interface GroupResult {
  words: string[];
  wordScores: WordScore[];
  groupXP: number;
}

export function PracticeSession({ questions, character, characterId, component, categoryBoundaries }: PracticeSessionProps) {
  const [wordGroups, setWordGroups] = useState<string[][]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("ready");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState("Let's practice your trouble sounds!");
  const [wordScores, setWordScores] = useState<WordScore[]>([]);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [groupResults, setGroupResults] = useState<GroupResult[]>([]);
  const [showPinyin, setShowPinyin] = useState(false);
  const sessionStartRef = useRef(Date.now());
  const [playingWordIndex, setPlayingWordIndex] = useState<number | null>(null);
  const playingRef = useRef(false);
  const wordAudioCache = useRef<Map<string, string>>(new Map());

  // Split questions into groups of 5 (preserving category order)
  useEffect(() => {
    const groups: string[][] = [];
    for (let i = 0; i < questions.length; i += C6_WORDS_PER_GROUP) {
      groups.push(questions.slice(i, i + C6_WORDS_PER_GROUP));
    }
    setWordGroups(groups);
  }, [questions]);

  const currentWords = wordGroups[currentGroupIndex] || [];
  const progressPercent = wordGroups.length > 0 ? Math.round((currentGroupIndex / wordGroups.length) * 100) : 0;

  // Determine the current category label based on the word index
  const currentCategoryLabel = useMemo(() => {
    const wordIndex = currentGroupIndex * C6_WORDS_PER_GROUP;
    let label = "";
    for (const boundary of categoryBoundaries) {
      if (wordIndex >= boundary.startIndex) {
        label = boundary.label;
      }
    }
    return label;
  }, [currentGroupIndex, categoryBoundaries]);

  // Detect if we're at the start of a new category
  const isNewCategory = useMemo(() => {
    const wordIndex = currentGroupIndex * C6_WORDS_PER_GROUP;
    return categoryBoundaries.some(b => b.startIndex === wordIndex);
  }, [currentGroupIndex, categoryBoundaries]);

  // Computed averages for the feedback score display
  const avgPronunciation = useMemo(() => {
    const valid = wordScores.filter(w => w.score !== null).map(w => w.score!);
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  }, [wordScores]);

  const avgTone = useMemo(() => {
    const tones = wordScores.filter(w => w.toneScore !== undefined).map(w => w.toneScore!);
    return tones.length > 0 ? Math.round(tones.reduce((a, b) => a + b, 0) / tones.length) : null;
  }, [wordScores]);

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
        await fetchWithRetry("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component,
            score: avgScore,
            xpEarned: totalXPEarned,
            durationSeconds: Math.round((Date.now() - sessionStartRef.current) / 1000),
            questionsAttempted: groupResults.filter(g => g.wordScores.some(ws => ws.score !== null)).length,
            questionsCorrect: groupResults.filter(g => {
              const valid = g.wordScores.filter(ws => ws.score !== null).map(ws => ws.score!);
              return valid.length > 0 && Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) >= 60;
            }).length,
            bestStreak: maxStreak,
          }),
        });
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    };

    saveProgress();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup cached audio object URLs on unmount
  useEffect(() => {
    const cache = wordAudioCache.current;
    return () => {
      cache.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const playWordAudio = useCallback(async (word: string, index: number) => {
    if (playingRef.current) return;
    playingRef.current = true;
    setPlayingWordIndex(index);

    try {
      let audioUrl = wordAudioCache.current.get(word);
      if (!audioUrl) {
        const response = await fetchWithRetry("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId: character.voiceId, text: `${word}。` }),
        });
        if (!response.ok) throw new Error("TTS failed");
        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        wordAudioCache.current.set(word, audioUrl);
      }
      const audio = new Audio(audioUrl);
      audio.onended = () => { playingRef.current = false; setPlayingWordIndex(null); };
      audio.onerror = () => { playingRef.current = false; setPlayingWordIndex(null); };
      await audio.play();
    } catch {
      await speakWithBrowserTTS(word);
      playingRef.current = false;
      setPlayingWordIndex(null);
    }
  }, [character.voiceId, speakWithBrowserTTS]);

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setPhase("assessing");
    setExpression("thinking");
    setDialogue("Let me check your pronunciation...");

    try {
      const referenceText = currentWords.join(" ");

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("referenceText", referenceText);
      formData.append("category", "read_word");

      const assessResponse = await fetchWithRetry("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      if (!assessResponse.ok) {
        throw new Error(`Assessment failed (${assessResponse.status})`);
      }

      const assessResult = await assessResponse.json();

      const filteredWords: Array<{ word: string; accuracyScore: number; errorType: string; toneScore?: number; phoneError?: string }> =
        (assessResult.words ?? []).filter(
          (w: { errorType?: string }) => w.errorType !== "Insertion" && w.errorType !== "Omission"
        );

      // Ordered sequential matching (same as C2)
      const usedIndices = new Set<number>();
      let searchFrom = 0;
      const scores = currentWords.map((word) => {
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
          return {
            word,
            score: filteredWords[idx]?.accuracyScore ?? null,
            toneScore: filteredWords[idx]?.toneScore,
            phoneError: filteredWords[idx]?.phoneError,
          };
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

      const validScores = scores
        .map(w => w.score)
        .filter((s): s is number => s !== null);
      const avgScore = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 0;

      const isGood = avgScore >= 60;
      const newStreak = isGood ? streak + 1 : 0;
      setStreak(newStreak);
      setMaxStreak(prev => Math.max(prev, newStreak));

      const xpResult = calculateXP({
        pronunciationScore: avgScore,
        isCorrect: isGood,
        currentStreak: newStreak,
      });
      setTotalXPEarned((prev) => prev + xpResult.totalXP);

      setPhase("feedback");

      let spokenFeedback = "";
      try {
        const feedbackResponse = await fetchWithRetry("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterPrompt: character.personalityPrompt,
            component,
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
            ? "Excellent! Your pronunciation is very clear!"
            : avgScore >= 60
            ? "Good work! Keep focusing on the subtle differences."
            : "Keep practicing — listen carefully to the distinctions.";
        }
      } catch {
        spokenFeedback = avgScore >= 90
          ? "Excellent pronunciation!"
          : avgScore >= 60
          ? "Good work! Keep at it."
          : "Keep practicing the sound distinctions.";
      }

      setDialogue(spokenFeedback);

      const feedbackExpression: ExpressionName =
        avgScore >= 90 ? "excited" : avgScore >= 60 ? "happy" : "encouraging";
      setExpression(feedbackExpression);

      setGroupResults(prev => [
        ...prev,
        { words: currentWords, wordScores: scores, groupXP: xpResult.totalXP },
      ]);
    } catch {
      setPhase("feedback");
      setExpression("surprised");
      setDialogue("Hmm, something went wrong. Let's try the next one!");

      setGroupResults(prev => [
        ...prev,
        { words: currentWords, wordScores: currentWords.map(w => ({ word: w, score: null })), groupXP: 0 },
      ]);
    }
  }, [currentWords, character.personalityPrompt, streak, component]);

  const handleSkip = useCallback(() => {
    setGroupResults(prev => [
      ...prev,
      { words: currentWords, wordScores: currentWords.map(w => ({ word: w, score: null })), groupXP: 0 },
    ]);

    if (currentGroupIndex + 1 >= wordGroups.length) {
      setPhase("complete");
      setExpression("proud");
      setDialogue("Practice complete! Let's see your results!");
    } else {
      setCurrentGroupIndex(prev => prev + 1);
      setPhase("ready");
      setWordScores([]);
      setShowPinyin(false);
      setExpression("neutral");
      setDialogue("Skipped! Ready for the next group?");
    }
  }, [currentWords, currentGroupIndex, wordGroups.length]);

  const handleNext = useCallback(() => {
    if (currentGroupIndex + 1 >= wordGroups.length) {
      setPhase("complete");
      setExpression("proud");
      setDialogue("Amazing! You completed all the groups!");
    } else {
      setCurrentGroupIndex(prev => prev + 1);
      setPhase("ready");
      setWordScores([]);
      setShowPinyin(false);
      setExpression("neutral");
      setDialogue("Ready for the next group? Tap any word to listen!");
    }
  }, [currentGroupIndex, wordGroups.length]);

  // Completion screen
  if (phase === "complete") {
    const allScores: number[] = [];
    groupResults.forEach(g => {
      g.wordScores.forEach(ws => {
        if (ws.score !== null) allScores.push(ws.score);
      });
    });
    const totalScored = allScores.length;
    const averageScore = totalScored > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / totalScored)
      : 0;
    const correctCount = allScores.filter(s => s >= 60).length;
    const accuracy = totalScored > 0 ? Math.round((correctCount / totalScored) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression="proud"
          />
          <DialogueBox text={dialogue} characterName={character.name} />
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="font-pixel text-sm text-center">Practice Complete!</h2>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <p className="text-3xl font-bold">{totalScored}</p>
                <p className="text-sm text-muted-foreground">Words</p>
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
            <p className="text-center text-sm text-muted-foreground">{accuracy}% accuracy</p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {groupResults.map((result, groupIdx) => (
                <div key={groupIdx} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Group {groupIdx + 1}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        Avg: {(() => {
                          const valid = result.wordScores.filter(w => w.score !== null).map(w => w.score!);
                          return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
                        })()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">+{result.groupXP} XP</span>
                    </div>
                  </div>
                  <div className="flex gap-2 text-sm flex-wrap">
                    {result.wordScores.map((ws, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <span className="font-chinese">{ws.word}</span>
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
              <Button onClick={() => window.location.reload()}>Practice Again</Button>
              <Button variant="outline" asChild>
                <Link href="/practice">Back to Practice</Link>
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
          <span>Group {currentGroupIndex + 1} of {wordGroups.length}</span>
          <span className="flex items-center gap-2">
            {streak > 0 && <Badge variant="secondary">Streak: {streak}</Badge>}
            <Badge variant="outline">+{totalXPEarned} XP</Badge>
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Current category indicator */}
      <div className="flex justify-center">
        <span className="inline-flex items-center rounded-sm border-2 border-primary/30 bg-primary/10 px-4 py-1.5 font-pixel text-xs text-primary pixel-glow">
          {currentCategoryLabel}
        </span>
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
          <DialogueBox text={dialogue} characterName={character.name} />

          {phase === "feedback" && wordScores.length > 0 && (
            <div className="pixel-border bg-card p-4 space-y-3">
              <p className="font-pixel text-sm text-primary text-center">Scoring Guide</p>
              <div className="space-y-1">
                <p className="text-lg"><span className="font-bold text-green-600">90+</span> Excellent</p>
                <p className="text-lg"><span className="font-bold text-yellow-600">60-89</span> Good</p>
                <p className="text-lg"><span className="font-bold text-red-600">0-59</span> Needs work</p>
              </div>
            </div>
          )}
        </div>

        {/* Right side: Practice area (70%) */}
        <div className="flex-1 md:w-[70%]">
          <Card className="h-full">
            <CardContent className="flex flex-col items-center justify-center gap-6 py-8">
              <p className="self-start text-2xl text-muted-foreground">🔊 Tap any word to listen</p>
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
              <div className="grid grid-cols-5 gap-4 w-full max-w-4xl">
                {currentWords.map((word, idx) => (
                  <div key={idx} className="space-y-2">
                    <button
                      onClick={() => playWordAudio(word, idx)}
                      disabled={playingWordIndex !== null && playingWordIndex !== idx}
                      className={`w-full flex items-center justify-center rounded-lg border-2 p-6 transition-colors cursor-pointer
                        ${playingWordIndex === idx ? "border-primary bg-primary/10" : "border-muted hover:border-primary"}`}
                    >
                      <p className="text-4xl font-bold font-chinese">{word}</p>
                    </button>
                    {showPinyin && (
                      <p className="text-center text-2xl text-muted-foreground italic">
                        {lookupPinyinDisplay(word) ?? "—"}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Score display */}
              {wordScores.length > 0 && phase === "feedback" && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4 w-full max-w-4xl">
                  <div className="grid grid-cols-5 gap-3">
                    {wordScores.map((item, idx) => (
                      <div key={idx} className="text-center space-y-2">
                        <p className="text-3xl font-bold font-chinese">{item.word}</p>
                        {item.score !== null ? (
                          <>
                            <p className={`text-2xl font-bold ${
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
                                className="text-xs"
                              >
                                声调 {item.toneScore}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">No score</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-6 rounded-lg border-2 border-primary/20 bg-card p-4">
                    <div className="text-center">
                      <p className="font-pixel text-[10px] text-muted-foreground mb-1">Pronunciation</p>
                      <p className={`text-3xl font-bold ${
                        avgPronunciation >= 90 ? "text-green-600" : avgPronunciation >= 60 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {avgPronunciation}
                      </p>
                    </div>
                    <div className="h-10 w-px bg-border" />
                    <div className="text-center">
                      <p className="font-pixel text-[10px] text-muted-foreground mb-1">Tone 声调</p>
                      <p className={`text-3xl font-bold ${
                        avgTone !== null && avgTone >= 80 ? "text-green-600" : avgTone !== null && avgTone >= 50 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {avgTone ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {phase === "assessing" && (
                <div className="text-center space-y-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-sm font-medium">Analyzing pronunciation...</p>
                </div>
              )}

              <div className="flex flex-col items-center gap-3">
                {phase === "ready" && (
                  <>
                    <div className="flex items-center gap-3">
                      <Button onClick={handleSkip} variant="ghost" size="lg">Skip</Button>
                    </div>
                    <AudioRecorder onRecordingComplete={handleRecordingComplete} />
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
