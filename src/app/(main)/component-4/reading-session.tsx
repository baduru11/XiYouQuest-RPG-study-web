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
import type { ExpressionName } from "@/types/character";
import type { ComponentNumber } from "@/types/practice";

interface Passage {
  id: string;
  title: string;
  content: string;
}

interface ReadingSessionProps {
  passages: Passage[];
  character: {
    name: string;
    personalityPrompt: string;
    voiceId: string;
    expressions: Record<string, string>;
  };
  characterId?: string;
  component: ComponentNumber;
}

type SessionPhase =
  | "select"
  | "ready"
  | "listening-model"
  | "recording"
  | "assessing"
  | "feedback"
  | "complete";

interface SentenceScore {
  sentence: string;
  score: number;
}

// Split passage content into sentences based on Chinese punctuation
function splitIntoSentences(content: string): string[] {
  const sentences = content.split(/(?<=[。！？；])/g).filter((s) => s.trim().length > 0);
  return sentences;
}

export function ReadingSession({ passages, character, characterId, component }: ReadingSessionProps) {
  const [selectedPassage, setSelectedPassage] = useState<Passage | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("select");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState("Pick a passage to read! I'll help you practice.");
  const [showPinyin, setShowPinyin] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isPlayingCompanion, setIsPlayingCompanion] = useState(false);
  const [playingSentenceIndex, setPlayingSentenceIndex] = useState<number | null>(null);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [sentenceScores, setSentenceScores] = useState<SentenceScore[]>([]);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const hasPlayedGreeting = useRef(false);

  // Client-side audio cache: Map<text, audioUrl>
  const audioCache = useRef(new Map<string, string>());
  // Reference to current playing audio for stop functionality
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const sentences = useMemo(
    () => (selectedPassage ? splitIntoSentences(selectedPassage.content) : []),
    [selectedPassage]
  );

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

  // Stop currently playing audio
  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsPlayingAudio(false);
    setPlayingSentenceIndex(null);
  }, []);

  // Greeting on mount (voice disabled)
  useEffect(() => {
    if (!hasPlayedGreeting.current) {
      hasPlayedGreeting.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save progress when reading assessment completes
  const hasSavedProgress = useRef(false);
  useEffect(() => {
    if (phase !== "feedback" || overallScore === null || !characterId || hasSavedProgress.current) return;
    hasSavedProgress.current = true;

    const saveProgress = async () => {
      try {
        await fetch("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component,
            score: overallScore,
            xpEarned: totalXPEarned,
            durationSeconds: 0,
            questionsAttempted: 1,
            questionsCorrect: overallScore >= 60 ? 1 : 0,
            bestStreak: overallScore >= 60 ? 1 : 0,
          }),
        });
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    };

    saveProgress();
  }, [phase, overallScore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play the entire passage as a model reading
  const playModelReading = useCallback(async () => {
    if (!selectedPassage || isPlayingAudio) return;
    setIsPlayingAudio(true);
    setPhase("listening-model");
    setExpression("happy");
    setDialogue("Listen carefully to how I read the passage...");

    const onFinished = () => {
      setIsPlayingAudio(false);
      setPhase("ready");
      setExpression("encouraging");
      setDialogue("Now it's your turn! Read the passage aloud. Take your time and keep a natural pace.");
    };

    try {
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: character.voiceId,
          text: selectedPassage.content,
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio; // Store reference for stop button
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          onFinished();
        };
        audio.onerror = async () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          await speakWithBrowserTTS(selectedPassage.content);
          onFinished();
        };
        await audio.play();
      } else {
        await speakWithBrowserTTS(selectedPassage.content);
        onFinished();
      }
    } catch {
      try {
        await speakWithBrowserTTS(selectedPassage.content);
      } catch { /* ignore */ }
      onFinished();
    }
  }, [selectedPassage, character.voiceId, isPlayingAudio, speakWithBrowserTTS]);

  // Play a single sentence (with client-side caching)
  const playSentence = useCallback(async (sentence: string, index: number) => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    setPlayingSentenceIndex(index);

    const onFinished = () => {
      setIsPlayingAudio(false);
      setPlayingSentenceIndex(null);
    };

    const sentenceText = sentence.trim();
    const cacheKey = `${character.voiceId}:${sentenceText}`;

    // Check client-side cache first
    const cachedAudioUrl = audioCache.current.get(cacheKey);
    if (cachedAudioUrl) {
      // Play from cache - no network request!
      const audio = new Audio(cachedAudioUrl);
      currentAudioRef.current = audio; // Store reference for stop button
      audio.onended = () => {
        currentAudioRef.current = null;
        onFinished();
      };
      audio.onerror = async () => {
        currentAudioRef.current = null;
        await speakWithBrowserTTS(sentenceText);
        onFinished();
      };
      try {
        await audio.play();
      } catch {
        currentAudioRef.current = null;
        await speakWithBrowserTTS(sentenceText);
        onFinished();
      }
      return;
    }

    // Not in cache - fetch from server
    try {
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: character.voiceId,
          text: sentenceText,
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        // Cache the audio URL for next time
        audioCache.current.set(cacheKey, audioUrl);

        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio; // Store reference for stop button
        audio.onended = () => {
          currentAudioRef.current = null;
          onFinished();
        };
        audio.onerror = async () => {
          currentAudioRef.current = null;
          await speakWithBrowserTTS(sentenceText);
          onFinished();
        };
        await audio.play();
      } else {
        await speakWithBrowserTTS(sentenceText);
        onFinished();
      }
    } catch {
      try {
        await speakWithBrowserTTS(sentenceText);
      } catch { /* ignore */ }
      onFinished();
    }
  }, [character.voiceId, isPlayingAudio, speakWithBrowserTTS]);

  // Handle recording completion
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!selectedPassage) return;

    setPhase("assessing");
    setExpression("thinking");
    setDialogue("Let me analyze your reading... checking pronunciation, pacing, and fluency.");

    try {
      // Send audio to speech assessment API
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("referenceText", selectedPassage.content);
      formData.append("category", "read_chapter");

      const assessResponse = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      let pronunciationScore = 0;
      let sentenceResults: SentenceScore[] = [];

      if (!assessResponse.ok) {
        const errBody = await assessResponse.json().catch(() => ({}));
        console.error("[C4] Assessment API error:", assessResponse.status, errBody);
        throw new Error(`Assessment failed (${assessResponse.status})`);
      }

      const assessResult = await assessResponse.json();
      pronunciationScore = assessResult.pronunciationScore ?? 0;

      // Prefer ISE sentence-level scores (returned by read_chapter/read_sentence)
      if (assessResult.sentences && assessResult.sentences.length > 0) {
        // Map ISE sentence scores back to our UI sentences by matching content
        for (const sentence of sentences) {
          const rawSentence = sentence.replace(/[。！？；，、：""''（）《》\s]/g, "");
          // Find the ISE sentence whose content best matches this UI sentence
          const match = assessResult.sentences.find((s: { content: string; score: number }) => {
            const rawIse = s.content.replace(/[。！？；，、：""''（）《》\s]/g, "");
            return rawIse === rawSentence || rawSentence.includes(rawIse) || rawIse.includes(rawSentence);
          });
          sentenceResults.push({ sentence, score: match?.score ?? pronunciationScore });
        }
      } else if (assessResult.words && assessResult.words.length > 0) {
        // Fallback: reconstruct sentence scores from word-level data
        let wordIndex = 0;
        for (const sentence of sentences) {
          const rawSentence = sentence.replace(/[。！？；，、：""''（）《》\s]/g, "");
          let consumed = 0;
          let sentenceTotal = 0;
          let sentenceWordCount = 0;

          while (consumed < rawSentence.length && wordIndex < assessResult.words.length) {
            const wordResult = assessResult.words[wordIndex];
            if (consumed + wordResult.word.length > rawSentence.length + 1) break;
            consumed += wordResult.word.length;
            sentenceTotal += wordResult.accuracyScore ?? 0;
            sentenceWordCount++;
            wordIndex++;
          }

          const avgScore = sentenceWordCount > 0 ? Math.round(sentenceTotal / sentenceWordCount) : 0;
          sentenceResults.push({ sentence, score: avgScore });
        }
      }

      // If no sentence-level data, create from overall score
      if (sentenceResults.length === 0) {
        sentenceResults = sentences.map((sentence) => ({
          sentence,
          score: pronunciationScore,
        }));
      }

      setOverallScore(pronunciationScore);
      setSentenceScores(sentenceResults);

      const isGood = pronunciationScore >= 60;
      const isPerfect = pronunciationScore >= 90;

      // Calculate XP
      const xpResult = calculateXP({
        pronunciationScore,
        isCorrect: isGood,
        currentStreak: isGood ? 1 : 0,
      });
      setTotalXPEarned(xpResult.totalXP);

      // Get AI character feedback
      setPhase("feedback");

      let spokenFeedback = "";
      try {
        const feedbackResponse = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterPrompt: character.personalityPrompt,
            component: 4,
            questionText: `Passage: "${selectedPassage.title}" - ${selectedPassage.content.substring(0, 100)}...`,
            userAnswer: "Passage reading attempt",
            pronunciationScore,
            isCorrect: isGood,
          }),
        });

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          spokenFeedback = feedbackData.feedback;
          setFeedbackText(spokenFeedback);
          setDialogue(spokenFeedback);
        } else {
          spokenFeedback = isPerfect
            ? "Outstanding reading! Your pronunciation, pacing, and fluency were excellent!"
            : isGood
            ? "Good reading! Focus on maintaining a steady pace and clear tones throughout."
            : "Keep practicing! Pay attention to each character's tone and try to read more smoothly.";
          setFeedbackText(spokenFeedback);
          setDialogue(spokenFeedback);
        }
      } catch {
        spokenFeedback = isPerfect
          ? `Excellent! Score: ${pronunciationScore}/100!`
          : isGood
          ? `Good effort! Score: ${pronunciationScore}/100.`
          : `Score: ${pronunciationScore}/100. Keep practicing!`;
        setFeedbackText(spokenFeedback);
        setDialogue(spokenFeedback);
      }

      // Set expression based on score and voice the feedback
      const feedbackExpression: ExpressionName = isPerfect ? "excited" : isGood ? "happy" : "encouraging";
      setExpression(feedbackExpression);

      // Companion voice disabled
    } catch {
      setPhase("feedback");
      setExpression("surprised");
      setDialogue("Something went wrong with the assessment. But don't worry, try again!");
      setOverallScore(null);
      setFeedbackText("Assessment failed");
    }
  }, [selectedPassage, sentences, character.personalityPrompt, playCompanionVoice]);

  // Skip the current passage without recording
  const handleSkipPassage = useCallback(() => {
    setPhase("feedback");
    setOverallScore(null);
    setSentenceScores([]);
    setTotalXPEarned(0);
    setFeedbackText("Passage skipped");
    setExpression("neutral");
    setDialogue("No problem! You can try another passage or come back to this one later.");
  }, []);

  // Select a passage
  const handleSelectPassage = useCallback((passage: Passage) => {
    setSelectedPassage(passage);
    setPhase("ready");
    setExpression("neutral");
    setDialogue(`Great choice! "${passage.title}" - First listen to the model reading, then try reading it yourself.`);
  }, []);

  // Go back to passage selection
  const handleBackToSelection = useCallback(() => {
    setSelectedPassage(null);
    setPhase("select");
    setOverallScore(null);
    setSentenceScores([]);
    setTotalXPEarned(0);
    setFeedbackText("");
    setShowPinyin(false);
    setExpression("neutral");
    setDialogue("Pick a passage to read! I'll help you practice.");
  }, []);

  // Passage selection screen
  if (phase === "select") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row">
          {/* Left side: Character (30%) */}
          <div className="space-y-3 md:w-[30%]">
            <CharacterDisplay
              characterName={character.name}
              expressionImages={character.expressions}
              currentExpression={expression}
            />
            <DialogueBox text={dialogue} characterName={character.name} />
          </div>

          {/* Right side: Passage selection (70%) */}
          <div className="flex-1 md:w-[70%]">
            <div className="grid gap-4 sm:grid-cols-2 max-h-[70vh] overflow-y-auto pr-2">
              {passages.map((passage) => (
                <Card
                  key={passage.id}
                  className="cursor-pointer transition-all hover:border-primary hover:shadow-md h-fit"
                  onClick={() => handleSelectPassage(passage)}
                >
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-bold font-chinese mb-2">{passage.title}</h3>
                    <p className="text-sm text-muted-foreground font-chinese line-clamp-3">
                      {passage.content}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {passage.content.length} characters
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Completion / feedback screen
  if (phase === "complete" || (phase === "feedback" && overallScore !== null)) {
    const isGood = (overallScore ?? 0) >= 60;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row">
          {/* Left side: Character (30%) */}
          <div className="space-y-3 md:w-[30%]">
            <CharacterDisplay
              characterName={character.name}
              expressionImages={character.expressions}
              currentExpression={expression}
            />
            <DialogueBox text={dialogue} characterName={character.name} />

            <div className="flex flex-col gap-2">
              <Button onClick={() => {
                setPhase("ready");
                setOverallScore(null);
                setSentenceScores([]);
                setFeedbackText("");
                setExpression("neutral");
                setDialogue("Let's try this passage again! Listen to the model first if you need to.");
              }} className="w-full">
                Try Again
              </Button>
              <Button variant="outline" onClick={handleBackToSelection} className="w-full">
                Choose Another Passage
              </Button>
              <Button variant="outline" asChild className="w-full">
                <a href="/dashboard">Back to Dashboard</a>
              </Button>
            </div>
          </div>

          {/* Right side: Results (70%) */}
          <div className="flex-1 md:w-[70%]">
            <Card className="h-full">
              <CardContent className="pt-4 space-y-3">
                <h2 className="font-pixel text-sm text-center">
                  Reading Assessment: <span className="font-chinese text-base">{selectedPassage?.title}</span>
                </h2>

                {/* Overall score + stats row */}
                <div className="flex items-center justify-center gap-6">
                  {overallScore !== null && (
                    <div className="text-center">
                      <p
                        className={`text-4xl font-bold ${
                          overallScore >= 90
                            ? "text-green-600"
                            : overallScore >= 60
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {overallScore}
                      </p>
                      <p className="text-xs text-muted-foreground">Score</p>
                    </div>
                  )}
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-600">+{totalXPEarned}</p>
                    <p className="text-xs text-muted-foreground">XP</p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-2xl font-bold">{isGood ? "Pass" : "Retry"}</p>
                    <p className="text-xs text-muted-foreground">Result</p>
                  </div>
                </div>

                {overallScore !== null && (
                  <Progress value={overallScore} className="h-2" />
                )}

                {/* Sentence-by-sentence breakdown */}
                {sentenceScores.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Sentence breakdown:</p>
                    <div className="max-h-96 overflow-y-auto space-y-1">
                      {sentenceScores.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-md border px-2 py-2"
                        >
                          <span className="flex-1 min-w-0 truncate font-chinese text-base">{item.sentence}</span>
                          <span
                            className={`text-xl font-bold tabular-nums shrink-0 ${
                              item.score >= 90
                                ? "text-green-600"
                                : item.score >= 60
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {item.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Main reading UI (ready, listening-model, recording, assessing)
  return (
    <div className="space-y-4">
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

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {isPlayingAudio ? (
              <Button
                onClick={stopAudio}
                variant="destructive"
                className="w-full"
              >
                ⏹ Stop Audio
              </Button>
            ) : (
              <Button
                onClick={playModelReading}
                disabled={phase === "assessing"}
                variant="outline"
                className="w-full"
              >
                🔊 Listen to Model
              </Button>
            )}

            {(phase === "ready" || phase === "listening-model") && (
              <>
                <AudioRecorder
                  onRecordingComplete={handleRecordingComplete}
                  disabled={isPlayingAudio}
                />
                <Button
                  onClick={handleSkipPassage}
                  disabled={isPlayingAudio}
                  variant="ghost"
                  className="w-full"
                >
                  Skip Passage
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Right side: Passage area (70%) */}
        <div className="flex-1 md:w-[70%]">
          <Card className="h-full">
            <CardContent className="py-6 space-y-4">
              {/* Passage header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold font-chinese">{selectedPassage?.title}</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showPinyin ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowPinyin(!showPinyin)}
                  >
                    {showPinyin ? "Hide Pinyin" : "Show Pinyin"}
                  </Button>
                </div>
              </div>

              {/* Click hint / Stop button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <span>Click any sentence to hear it read aloud</span>
                </div>
                {isPlayingAudio && playingSentenceIndex !== null && (
                  <Button
                    onClick={stopAudio}
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    ⏹ Stop
                  </Button>
                )}
              </div>

              {/* Passage content with clickable sentences */}
              <div className="rounded-lg border bg-muted/30 p-6 leading-relaxed max-h-[60vh] overflow-y-auto">
                {sentences.map((sentence, index) => (
                  <span
                    key={index}
                    onClick={() => playSentence(sentence, index)}
                    className={`
                      cursor-pointer transition-all duration-200 rounded-md px-1 py-0.5
                      ${playingSentenceIndex === index
                        ? "bg-primary/30 text-primary font-medium shadow-sm scale-105"
                        : "hover:bg-primary/10 hover:shadow-sm hover:scale-[1.02]"
                      }
                    `}
                    title="🔊 Click to hear this sentence"
                  >
                    <span className="text-lg leading-loose font-chinese">{sentence}</span>
                  </span>
                ))}

                {showPinyin && (
                  <p className="mt-4 pt-4 border-t text-sm text-muted-foreground italic">
                    Pinyin annotations will appear when available from the speech service.
                  </p>
                )}
              </div>

              {/* Assessing state */}
              {phase === "assessing" && (
                <div className="text-center space-y-2 py-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Analyzing your reading... checking pronunciation, pacing, and fluency.
                  </p>
                </div>
              )}

              {/* Back button */}
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleBackToSelection}>
                  Choose Different Passage
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
