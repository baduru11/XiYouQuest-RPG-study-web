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
  component: 1 | 2 | 3 | 4 | 5;
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

  // Greeting on mount
  useEffect(() => {
    if (!hasPlayedGreeting.current) {
      hasPlayedGreeting.current = true;
      const id = setTimeout(() => {
        playCompanionVoice(
          "Pick a passage to read! I'll help you practice.",
          "neutral"
        );
      }, 300);
      return () => clearTimeout(id);
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

      const assessResponse = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      let pronunciationScore = 0;
      let sentenceResults: SentenceScore[] = [];

      if (assessResponse.ok) {
        const assessResult = await assessResponse.json();
        pronunciationScore = assessResult.pronunciationScore ?? 0;

        // Build sentence-by-sentence scores if word-level data is available
        if (assessResult.words && assessResult.words.length > 0) {
          let wordIndex = 0;
          for (const sentence of sentences) {
            const sentenceChars = sentence.replace(/[。！？；，、：""''（）\s]/g, "");
            const charCount = sentenceChars.length;
            let sentenceTotal = 0;
            let sentenceWordCount = 0;

            while (sentenceWordCount < charCount && wordIndex < assessResult.words.length) {
              sentenceTotal += assessResult.words[wordIndex].accuracyScore ?? 0;
              sentenceWordCount++;
              wordIndex++;
            }

            const avgScore = sentenceWordCount > 0 ? Math.round(sentenceTotal / sentenceWordCount) : 0;
            sentenceResults.push({ sentence, score: avgScore });
          }
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

      if (spokenFeedback) {
        playCompanionVoice(spokenFeedback, feedbackExpression);
      }
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
        <div className="flex flex-col items-center gap-4">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression={expression}
          />
          <DialogueBox text={dialogue} characterName={character.name} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {passages.map((passage) => (
            <Card
              key={passage.id}
              className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
              onClick={() => handleSelectPassage(passage)}
            >
              <CardContent className="pt-6">
                <h3 className="text-lg font-bold mb-2">{passage.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3">
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
    );
  }

  // Completion / feedback screen
  if (phase === "complete" || (phase === "feedback" && overallScore !== null)) {
    const isGood = (overallScore ?? 0) >= 60;

    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression={expression}
          />
          <DialogueBox text={dialogue} characterName={character.name} />
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-xl font-bold text-center">
              Reading Assessment: {selectedPassage?.title}
            </h2>

            {/* Overall score */}
            {overallScore !== null && (
              <div className="text-center">
                <p
                  className={`text-5xl font-bold ${
                    overallScore >= 90
                      ? "text-green-600"
                      : overallScore >= 60
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {overallScore}/100
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {overallScore >= 90
                    ? "Excellent reading!"
                    : overallScore >= 60
                    ? "Good reading!"
                    : "Needs improvement"}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">+{totalXPEarned}</p>
                <p className="text-xs text-muted-foreground">XP Earned</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{isGood ? "Pass" : "Try Again"}</p>
                <p className="text-xs text-muted-foreground">Result</p>
              </div>
            </div>

            {overallScore !== null && (
              <Progress value={overallScore} className="h-3" />
            )}

            {/* Feedback text */}
            {feedbackText && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-sm font-medium mb-1">Feedback:</p>
                <p className="text-sm text-muted-foreground">{feedbackText}</p>
              </div>
            )}

            {/* Sentence-by-sentence breakdown */}
            {sentenceScores.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Sentence-by-sentence breakdown:</p>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {sentenceScores.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border p-2"
                    >
                      <span className="text-sm flex-1 min-w-0 truncate">{item.sentence}</span>
                      <Badge
                        variant={
                          item.score >= 90
                            ? "default"
                            : item.score >= 60
                            ? "secondary"
                            : "destructive"
                        }
                        className="ml-2"
                      >
                        {item.score}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={() => {
                setPhase("ready");
                setOverallScore(null);
                setSentenceScores([]);
                setFeedbackText("");
                setExpression("neutral");
                setDialogue("Let's try this passage again! Listen to the model first if you need to.");
              }}>
                Try Again
              </Button>
              <Button variant="outline" onClick={handleBackToSelection}>
                Choose Another Passage
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

  // Main reading UI (ready, listening-model, recording, assessing)
  return (
    <div className="space-y-4">
      {/* Main content area */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left side: Character (30%) */}
        <div className="space-y-3 lg:w-[30%]">
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
        <div className="flex-1 lg:w-[70%]">
          <Card className="h-full">
            <CardContent className="py-6 space-y-4">
              {/* Passage header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{selectedPassage?.title}</h2>
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
              <div className="rounded-lg border bg-muted/30 p-6 leading-relaxed">
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
                    <span className="text-lg leading-loose">{sentence}</span>
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
