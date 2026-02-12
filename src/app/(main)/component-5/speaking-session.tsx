"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { CharacterDisplay } from "@/components/character/character-display";
import { DialogueBox } from "@/components/character/dialogue-box";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import type { ExpressionName } from "@/types/character";

// Speaking structure template
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

// 3 minutes in seconds
const TOTAL_TIME = 180;

interface SpeakingSessionProps {
  topics: string[];
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
  | "prepare"
  | "recording"
  | "assessing"
  | "feedback"
  | "complete";

interface SpeakingAnalysis {
  pronunciationScore: number;
  fluencyNotes: string;
  vocabularyRange: string;
  grammarNotes: string;
  fillerWords: string;
  structureCoherence: string;
  overallFeedback: string;
}

export function SpeakingSession({ topics, character, characterId, component }: SpeakingSessionProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [displayTopics, setDisplayTopics] = useState<string[]>([]);
  const [phase, setPhase] = useState<SessionPhase>("select");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState("Choose a topic to speak about! You'll have 3 minutes.");
  const [timeRemaining, setTimeRemaining] = useState(TOTAL_TIME);
  const [isRecording, setIsRecording] = useState(false);
  const [analysis, setAnalysis] = useState<SpeakingAnalysis | null>(null);
  const [totalXPEarned, setTotalXPEarned] = useState(0);

  const [isPlayingCompanion, setIsPlayingCompanion] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasPlayedGreeting = useRef(false);

  // Pick 6 random topics on mount
  useEffect(() => {
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    setDisplayTopics(shuffled.slice(0, 6));
  }, [topics]);

  const playCompanionVoice = useCallback(async (text: string, companionExpression: ExpressionName) => {
    if (isPlayingCompanion) return;
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
  }, [character.voiceId, isPlayingCompanion]);

  // Greeting on mount (voice disabled)
  useEffect(() => {
    if (!hasPlayedGreeting.current) {
      hasPlayedGreeting.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save progress when speaking assessment completes
  const hasSavedProgress = useRef(false);
  useEffect(() => {
    if (phase !== "feedback" || !analysis || !characterId || hasSavedProgress.current) return;
    hasSavedProgress.current = true;

    const saveProgress = async () => {
      const spokenTime = TOTAL_TIME - timeRemaining;

      try {
        await fetch("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component,
            score: analysis.pronunciationScore,
            xpEarned: totalXPEarned,
            durationSeconds: spokenTime,
            questionsAttempted: 1,
            questionsCorrect: analysis.pronunciationScore >= 60 ? 1 : 0,
            bestStreak: analysis.pronunciationScore >= 60 ? 1 : 0,
          }),
        });
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    };

    saveProgress();
  }, [phase, analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer logic
  useEffect(() => {
    if (isRecording && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up - stop recording
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // Format seconds to mm:ss
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // Shuffle displayed topics
  const shuffleTopics = useCallback(() => {
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    setDisplayTopics(shuffled.slice(0, 6));
  }, [topics]);

  // Select a random topic
  const selectRandomTopic = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * topics.length);
    const topic = topics[randomIndex];
    setSelectedTopic(topic);
    setPhase("prepare");
    setExpression("encouraging");
    setDialogue(`Your topic is "${topic}". Review the structure guide, then start speaking when you're ready!`);
  }, [topics]);

  // Select a specific topic
  const handleSelectTopic = useCallback((topic: string) => {
    setSelectedTopic(topic);
    setPhase("prepare");
    setExpression("encouraging");
    setDialogue(`Great choice! "${topic}" - Review the speaking structure, then hit "Start Speaking" when ready.`);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        handleRecordingComplete(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setPhase("recording");
      setTimeRemaining(TOTAL_TIME);
      setExpression("listening");
      setDialogue("I'm listening! Take your time, follow the structure, and speak naturally.");
    } catch {
      setExpression("surprised");
      setDialogue("I couldn't access your microphone. Please check your browser permissions.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop recording
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Handle completed recording
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setPhase("assessing");
    setExpression("thinking");
    setDialogue("Let me analyze your speaking... checking pronunciation, vocabulary, grammar, and structure.");

    const spokenTime = TOTAL_TIME - timeRemaining;

    try {
      // Send audio to speech assessment API
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("referenceText", selectedTopic ?? "");
      formData.append("category", "read_chapter");

      const assessResponse = await fetch("/api/speech/assess", {
        method: "POST",
        body: formData,
      });

      if (!assessResponse.ok) {
        const errBody = await assessResponse.json().catch(() => ({}));
        console.error("[C5] Assessment API error:", assessResponse.status, errBody);
        throw new Error(`Assessment failed (${assessResponse.status})`);
      }

      const assessResult = await assessResponse.json();
      const pronunciationScore = assessResult.pronunciationScore ?? 0;

      // Calculate XP
      const isGood = pronunciationScore >= 60;
      const xpResult = calculateXP({
        pronunciationScore,
        isCorrect: isGood,
        currentStreak: isGood ? 1 : 0,
      });
      setTotalXPEarned(xpResult.totalXP);

      // Get detailed AI analysis
      setPhase("feedback");

      let spokenFeedback = "";
      try {
        const feedbackResponse = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterPrompt: character.personalityPrompt,
            component: 5,
            questionText: `Topic: "${selectedTopic}". Spoken for ${Math.floor(spokenTime / 60)}m ${spokenTime % 60}s out of 3 minutes.`,
            userAnswer: "Prompted speaking attempt",
            pronunciationScore,
            isCorrect: isGood,
          }),
        });

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          spokenFeedback = feedbackData.feedback;
          setDialogue(spokenFeedback);

          setAnalysis({
            pronunciationScore,
            fluencyNotes: pronunciationScore >= 80
              ? "Good natural flow and pacing."
              : pronunciationScore >= 60
              ? "Decent flow, some hesitation noticed."
              : "Noticeable pauses and hesitation. Practice speaking more continuously.",
            vocabularyRange: pronunciationScore >= 80
              ? "Good variety of vocabulary used."
              : "Try to incorporate more varied vocabulary.",
            grammarNotes: pronunciationScore >= 80
              ? "Grammar structures used correctly."
              : "Review some grammar patterns for accuracy.",
            fillerWords: "Monitor for filler sounds like 嗯, 那个, 就是.",
            structureCoherence: spokenTime >= 120
              ? "Good structure and adequate speaking time."
              : "Try to speak for the full 3 minutes using the template.",
            overallFeedback: spokenFeedback,
          });
        } else {
          setDefaultAnalysis(pronunciationScore, spokenTime);
        }
      } catch {
        setDefaultAnalysis(pronunciationScore, spokenTime);
      }

      // Set expression based on score and voice the feedback
      const feedbackExpression: ExpressionName = pronunciationScore >= 90 ? "excited" : pronunciationScore >= 60 ? "happy" : "encouraging";
      setExpression(feedbackExpression);

      // Companion voice disabled
    } catch {
      setPhase("feedback");
      setExpression("surprised");
      setDialogue("Something went wrong with the assessment. Let's try again!");
      setAnalysis(null);
    }
  }, [selectedTopic, character.personalityPrompt, timeRemaining, playCompanionVoice]);

  // Set default analysis when AI feedback fails
  function setDefaultAnalysis(score: number, spokenTime: number) {
    const isPerfect = score >= 90;
    const isGood = score >= 60;

    const fallbackMsg = isPerfect
      ? "Excellent speaking! Great pronunciation, vocabulary, and structure."
      : isGood
      ? "Good effort! Continue practicing to improve fluency and vocabulary range."
      : "Keep practicing! Focus on pronunciation accuracy and speaking for the full duration.";

    setDialogue(fallbackMsg);
    setAnalysis({
      pronunciationScore: score,
      fluencyNotes: isGood
        ? "Reasonable flow. Keep working on natural pacing."
        : "Focus on maintaining a steady speaking pace.",
      vocabularyRange: isGood
        ? "Adequate vocabulary. Try using more diverse expressions."
        : "Practice expanding your vocabulary range.",
      grammarNotes: isGood
        ? "Grammar is generally correct."
        : "Review grammar structures for better accuracy.",
      fillerWords: "Be mindful of filler words like 嗯, 那个, 就是.",
      structureCoherence: spokenTime >= 120
        ? "Good speaking duration."
        : `Spoke for ${Math.floor(spokenTime / 60)}m ${spokenTime % 60}s. Aim for the full 3 minutes.`,
      overallFeedback: fallbackMsg,
    });
  }

  // Back to topic selection
  const handleBackToSelection = useCallback(() => {
    setSelectedTopic(null);
    setPhase("select");
    setTimeRemaining(TOTAL_TIME);
    setAnalysis(null);
    setTotalXPEarned(0);
    setExpression("neutral");
    setDialogue("Choose a topic to speak about! You'll have 3 minutes.");
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    setDisplayTopics(shuffled.slice(0, 6));
  }, [topics]);

  // Topic selection screen
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

        <div className="flex gap-2 justify-center">
          <Button onClick={selectRandomTopic} variant="default">
            Random Topic
          </Button>
          <Button onClick={shuffleTopics} variant="outline">
            Shuffle Topics
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayTopics.map((topic, index) => (
            <Card
              key={`${topic}-${index}`}
              className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
              onClick={() => handleSelectTopic(topic)}
            >
              <CardContent className="flex items-center justify-center py-6">
                <p className="text-lg font-medium text-center">{topic}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Feedback / completion screen
  if (phase === "feedback" || phase === "complete") {
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
            <h2 className="font-pixel text-sm text-center">
              Speaking Assessment: <span className="font-chinese text-base">{selectedTopic}</span>
            </h2>

            {/* Overall score */}
            {analysis && (
              <>
                <div className="text-center">
                  <p
                    className={`text-5xl font-bold ${
                      analysis.pronunciationScore >= 90
                        ? "text-green-600"
                        : analysis.pronunciationScore >= 60
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    {analysis.pronunciationScore}/100
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pronunciation Score
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-yellow-600">+{totalXPEarned}</p>
                    <p className="text-sm text-muted-foreground">XP Earned</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">
                      {formatTime(TOTAL_TIME - timeRemaining)}
                    </p>
                    <p className="text-sm text-muted-foreground">Time Spoken</p>
                  </div>
                </div>

                <Progress value={analysis.pronunciationScore} className="h-3" />

                {/* Detailed breakdown */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold">Detailed Analysis:</h3>

                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0">Fluency</Badge>
                      <p className="text-sm text-muted-foreground">{analysis.fluencyNotes}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0">Vocabulary</Badge>
                      <p className="text-sm text-muted-foreground">{analysis.vocabularyRange}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0">Grammar</Badge>
                      <p className="text-sm text-muted-foreground">{analysis.grammarNotes}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0">Filler Words</Badge>
                      <p className="text-sm text-muted-foreground">{analysis.fillerWords}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0">Structure</Badge>
                      <p className="text-sm text-muted-foreground">{analysis.structureCoherence}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!analysis && (
              <div className="text-center text-muted-foreground py-4">
                Assessment data unavailable. Please try again.
              </div>
            )}

            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={() => {
                setPhase("prepare");
                setTimeRemaining(TOTAL_TIME);
                setAnalysis(null);
                setTotalXPEarned(0);
                setExpression("encouraging");
                setDialogue(`Let's try "${selectedTopic}" again! Remember to follow the structure.`);
              }}>
                Try Again
              </Button>
              <Button variant="outline" onClick={handleBackToSelection}>
                Choose Another Topic
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

  // Prepare and recording screen
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

          {/* Timer display */}
          {phase === "recording" && (
            <div className="text-center space-y-2">
              <p className={`text-4xl font-bold font-mono transition-colors ${
                timeRemaining <= 10 ? "text-red-600 animate-pulse" : timeRemaining <= 30 ? "text-red-600" : timeRemaining <= 60 ? "text-yellow-600" : ""
              }`}>
                {formatTime(timeRemaining)}
              </p>
              <Progress
                value={((TOTAL_TIME - timeRemaining) / TOTAL_TIME) * 100}
                className="h-2"
              />
              <p className={`text-xs ${timeRemaining <= 10 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                {timeRemaining <= 10
                  ? "Almost done! Wrap up your conclusion."
                  : timeRemaining <= 30
                  ? "Wrapping up..."
                  : timeRemaining <= 60
                  ? "About 1 minute left"
                  : "Keep going!"}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {phase === "prepare" && (
              <Button onClick={startRecording} size="lg" className="w-full">
                Start Speaking
              </Button>
            )}
            {phase === "recording" && (
              <Button
                onClick={stopRecording}
                variant="destructive"
                size="lg"
                className="w-full"
              >
                Stop Recording
              </Button>
            )}
          </div>

          {/* Assessing state */}
          {phase === "assessing" && (
            <div className="text-center space-y-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
              <p className="text-sm text-muted-foreground">
                Analyzing your speech...
              </p>
            </div>
          )}
        </div>

        {/* Right side: Topic and structure guide (70%) */}
        <div className="flex-1 md:w-[70%]">
          <Card className="h-full">
            <CardContent className="py-6 space-y-6">
              {/* Topic display */}
              <div className="text-center">
                <Badge variant="outline" className="mb-2">Your Topic</Badge>
                <h2 className="text-3xl font-bold font-chinese sm:text-4xl">{selectedTopic}</h2>
              </div>

              {/* Speaking structure template */}
              <div className="rounded-lg border bg-muted/30 p-6 space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                  万能结构 Speaking Structure Guide
                </h3>

                {/* Opening */}
                <div className="space-y-1">
                  <p className="text-sm font-medium">{SPEAKING_TEMPLATE.opening}</p>
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <p className="text-sm font-medium">{SPEAKING_TEMPLATE.bodyLabel}</p>
                  <div className="pl-4 space-y-1">
                    {SPEAKING_TEMPLATE.body.map((point, index) => (
                      <p key={index} className="text-sm text-muted-foreground">
                        {point}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Closing */}
                <div className="space-y-1">
                  <p className="text-sm font-medium">{SPEAKING_TEMPLATE.closing}</p>
                </div>
              </div>

              {/* Tips */}
              <div className="rounded-lg border p-4 bg-accent/30">
                <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Tips</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Speak naturally and avoid long pauses.</li>
                  <li>Follow the opening-body-closing structure.</li>
                  <li>Use specific examples and personal experiences.</li>
                  <li>Aim to fill the full 3 minutes.</li>
                  <li>Avoid filler words like 嗯、那个、就是.</li>
                </ul>
              </div>

              {/* Back button */}
              {phase === "prepare" && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={handleBackToSelection}>
                    Choose Different Topic
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
