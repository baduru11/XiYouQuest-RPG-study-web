"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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

export function PracticeSession({ questions, character, characterId, component }: PracticeSessionProps) {
  const [wordGroups, setWordGroups] = useState<string[][]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("ready");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState(`Let's practice multisyllabic words!`);
  const [wordScores, setWordScores] = useState<WordScore[]>([]);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [groupResults, setGroupResults] = useState<GroupResult[]>([]);
  const [, setFeedbackText] = useState("");
  const [showPinyin, setShowPinyin] = useState(false);
  const [playingWordIndex, setPlayingWordIndex] = useState<number | null>(null);
  const playingRef = useRef(false);
  const wordAudioCache = useRef<Map<string, string>>(new Map());

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

  // Detect tricky elements for all current words
  const allTrickyElements = useMemo(() => {
    const elementMap = new Map<string, string[]>();
    currentWords.forEach(word => {
      const elements = detectTrickyElements(word);
      if (elements.length > 0) {
        elementMap.set(word, elements);
      }
    });
    return elementMap;
  }, [currentWords]);

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
        await fetch("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component,
            score: avgScore,
            xpEarned: totalXPEarned,
            durationSeconds: 0,
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
        const response = await fetch("/api/tts/speak", {
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
    setDialogue("Let me check all your words...");

    try {
      const referenceText = currentWords.join(" ");

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("referenceText", referenceText);
      formData.append("category", "read_word");

      const assessResponse = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      if (!assessResponse.ok) {
        const errBody = await assessResponse.json().catch(() => ({}));
        console.error("[C2] Assessment API error:", assessResponse.status, errBody);
        throw new Error(`Assessment failed (${assessResponse.status})`);
      }

      const assessResult = await assessResponse.json();

      // Filter out insertion/omission words before matching
      const filteredWords: Array<{ word: string; accuracyScore: number; errorType: string; toneScore?: number; phoneError?: string }> =
        (assessResult.words ?? []).filter(
          (w: { errorType?: string }) => w.errorType !== "Insertion" && w.errorType !== "Omission"
        );

      // Extract per-word scores using ordered sequential matching.
      // iFlytek ISE returns words in order matching the input for read_word.
      const usedIndices = new Set<number>();
      let searchFrom = 0;
      const scores = currentWords.map((word) => {
        // Strategy 1: exact match (search forward from last match position)
        let idx = -1;
        for (let i = searchFrom; i < filteredWords.length; i++) {
          if (filteredWords[i].word === word && !usedIndices.has(i)) {
            idx = i;
            break;
          }
        }
        // Fallback: search from beginning if forward search failed
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

        // Strategy 2: substring match for erhua/merged words
        if (word.length > 1 && filteredWords.length > 0) {
          for (let i = searchFrom; i < filteredWords.length; i++) {
            if (usedIndices.has(i)) continue;
            const iseWord = filteredWords[i].word;
            if (iseWord.length > 1 && (word.includes(iseWord) || iseWord.includes(word))) {
              usedIndices.add(i);
              searchFrom = i + 1;
              return {
                word,
                score: filteredWords[i]?.accuracyScore ?? null,
                toneScore: filteredWords[i]?.toneScore,
                phoneError: filteredWords[i]?.phoneError,
              };
            }
          }
        }

        // Strategy 3: aggregate character-level matches (ordered)
        if (word.length > 1 && filteredWords.length > 0) {
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
              score: Math.round(charScores.reduce((a: number, b: number) => a + b, 0) / charScores.length),
              toneScore: charToneScores.length > 0
                ? Math.round(charToneScores.reduce((a, b) => a + b, 0) / charToneScores.length)
                : undefined,
            };
          }
        }

        return { word, score: null };
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
      setMaxStreak(prev => Math.max(prev, newStreak));

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
            component: 2,
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
            ? "Excellent! All words were perfect! Great tone transitions!"
            : avgScore >= 60
            ? "Good work! Most words were clear. Keep practicing the tone flow."
            : "Keep practicing. Pay attention to the tone changes between syllables.";
        }
      } catch {
        spokenFeedback = avgScore >= 90
          ? "Excellent! All words were perfect!"
          : avgScore >= 60
          ? "Good work! Most words were clear."
          : "Keep practicing the tone transitions.";
      }

      setFeedbackText(spokenFeedback);
      setDialogue(spokenFeedback);

      // Determine expression based on avg score
      const feedbackExpression: ExpressionName =
        avgScore >= 90 ? "excited" : avgScore >= 60 ? "happy" : "encouraging";
      setExpression(feedbackExpression);

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
  }, [currentWords, character.personalityPrompt, streak]);

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
      setDialogue("Amazing! You completed all the groups!");
    } else {
      setCurrentGroupIndex(prev => prev + 1);
      setPhase("ready");
      setWordScores([]);
      setFeedbackText("");
      setShowPinyin(false);
      setExpression("neutral");
      setDialogue("Ready for the next group? Tap any word to listen!");
    }
  }, [currentGroupIndex, wordGroups.length]);

  // Completion screen
  if (phase === "complete") {
    // Calculate average across all individual word scores (only scored words)
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
          <DialogueBox
            text={dialogue}
            characterName={character.name}
          />
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
                        Avg: {(() => {
                          const valid = result.wordScores.filter(w => w.score !== null).map(w => w.score!);
                          return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
                        })()}
                      </Badge>
                      {(() => {
                        const tones = result.wordScores.filter(w => w.toneScore !== undefined).map(w => w.toneScore!);
                        if (tones.length === 0) return null;
                        const avg = Math.round(tones.reduce((a, b) => a + b, 0) / tones.length);
                        return (
                          <Badge variant={avg >= 80 ? "default" : avg >= 50 ? "secondary" : "destructive"}>
                            声调 {avg}
                          </Badge>
                        );
                      })()}
                      <span className="text-sm text-muted-foreground">
                        +{result.groupXP} XP
                      </span>
                    </div>
                  </div>

                  {/* Per-word scores */}
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

          {/* Scoring rubric */}
          {phase === "feedback" && wordScores.length > 0 && (
            <div className="pixel-border bg-card p-4 space-y-3">
              <p className="font-pixel text-sm text-primary text-center">Scoring Guide</p>
              <div className="space-y-1">
                <p className="text-lg"><span className="font-bold text-green-600">90+</span> Excellent</p>
                <p className="text-lg"><span className="font-bold text-yellow-600">60-89</span> Good</p>
                <p className="text-lg"><span className="font-bold text-red-600">0-59</span> Needs work</p>
              </div>
              <div className="border-t pt-3">
                <p className="font-pixel text-sm text-primary text-center mb-1">Tone 声调</p>
                <div className="space-y-1">
                  <p className="text-lg"><span className="font-bold text-green-600">100</span> All correct</p>
                  <p className="text-lg"><span className="font-bold text-yellow-600">40-70</span> Some errors</p>
                  <p className="text-lg"><span className="font-bold text-red-600">0-39</span> Many errors</p>
                </div>
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
                    {/* Tricky element badges per word */}
                    {allTrickyElements.has(word) && (
                      <div className="flex flex-wrap gap-1 justify-center">
                        {allTrickyElements.get(word)!.map((element, elemIdx) => (
                          <Badge key={elemIdx} variant="secondary" className="text-xs">
                            {element.split(" ")[0]}
                          </Badge>
                        ))}
                      </div>
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
                            <p className="text-xs text-muted-foreground">
                              {item.score >= 90 ? "Perfect!" :
                               item.score >= 60 ? "Good" : "Practice"}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">No score</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Group averages */}
                  <div className="flex items-center justify-center gap-6 rounded-lg border-2 border-primary/20 bg-card p-4">
                    <div className="text-center">
                      <p className="font-pixel text-[10px] text-muted-foreground mb-1">Pronunciation</p>
                      <p className={`text-3xl font-bold ${(() => {
                        const valid = wordScores.filter(w => w.score !== null).map(w => w.score!);
                        const avg = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
                        return avg >= 90 ? "text-green-600" : avg >= 60 ? "text-yellow-600" : "text-red-600";
                      })()}`}>
                        {(() => {
                          const valid = wordScores.filter(w => w.score !== null).map(w => w.score!);
                          return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
                        })()}
                      </p>
                    </div>
                    <div className="h-10 w-px bg-border" />
                    <div className="text-center">
                      <p className="font-pixel text-[10px] text-muted-foreground mb-1">Tone 声调</p>
                      <p className={`text-3xl font-bold ${(() => {
                        const tones = wordScores.filter(w => w.toneScore !== undefined).map(w => w.toneScore!);
                        const avg = tones.length > 0 ? Math.round(tones.reduce((a, b) => a + b, 0) / tones.length) : 0;
                        return avg >= 80 ? "text-green-600" : avg >= 50 ? "text-yellow-600" : "text-red-600";
                      })()}`}>
                        {(() => {
                          const tones = wordScores.filter(w => w.toneScore !== undefined).map(w => w.toneScore!);
                          return tones.length > 0 ? Math.round(tones.reduce((a, b) => a + b, 0) / tones.length) : "—";
                        })()}
                      </p>
                    </div>
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
                {phase === "ready" && (
                  <>
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={handleSkip}
                        variant="ghost"
                        size="lg"
                        className="hover:scale-[1.02] transition-transform"
                      >
                        Skip
                      </Button>
                    </div>
                    <AudioRecorder
                      onRecordingComplete={handleRecordingComplete}
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
