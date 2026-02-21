"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { CharacterDisplay } from "@/components/character/character-display";
import { DialogueBox } from "@/components/character/dialogue-box";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import { getDialogue } from "@/lib/dialogue";
import { useAudioSettings } from "@/components/shared/audio-settings";
import { encodeWAV } from "@/lib/audio-utils";
import { shuffle } from "@/lib/utils";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { useAchievementToast } from "@/components/shared/achievement-toast";
import type { ExpressionName } from "@/types/character";
import type { ComponentNumber } from "@/types/practice";

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
  component: ComponentNumber;
}

type SessionPhase =
  | "select"
  | "prepare"
  | "countdown"
  | "recording"
  | "assessing"
  | "feedback"
  | "complete";

interface C5SpeakingAnalysis {
  pronunciation: { score: number; deduction: number; level: number; label: string; notes: string };
  vocabGrammar: { score: number; deduction: number; level: number; label: string; notes: string };
  fluency: { score: number; deduction: number; level: number; label: string; notes: string };
  timePenalty: number;
  totalScore: number;
  normalizedScore: number;
  transcript: string;
  errorCount: number;
  overallFeedback: string;
}

export function SpeakingSession({ topics, character, characterId, component }: SpeakingSessionProps) {
  const { showAchievementToasts } = useAchievementToast();
  const { applyTtsVolume } = useAudioSettings();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [displayTopics, setDisplayTopics] = useState<string[]>([]);
  const [phase, setPhase] = useState<SessionPhase>("select");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState(getDialogue(character.name, "c5_initial"));
  const [elapsedTime, setElapsedTime] = useState(0);
  const elapsedTimeRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [analysis, setAnalysis] = useState<C5SpeakingAnalysis | null>(null);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [volume, setVolume] = useState(0);

  const [isPlayingCompanion, setIsPlayingCompanion] = useState(false);
  const companionAudioRef = useRef<HTMLAudioElement | null>(null);

  // PCM WAV recording refs (replaces MediaRecorder)
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPlayedGreeting = useRef(false);

  // Pick 6 random topics on mount
  useEffect(() => {
    const shuffled = shuffle(topics);
    setDisplayTopics(shuffled.slice(0, 6));
  }, [topics]);

  // Stop audio on unmount (when navigating to another page)
  useEffect(() => {
    return () => {
      if (companionAudioRef.current) {
        companionAudioRef.current.pause();
        companionAudioRef.current = null;
      }
    };
  }, []);

  const playCompanionVoice = useCallback(async (text: string, _companionExpression: ExpressionName) => {
    if (isPlayingCompanion) return;
    setIsPlayingCompanion(true);
    try {
      const response = await fetchWithRetry("/api/tts/companion", {
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
        applyTtsVolume(audio);
        companionAudioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          companionAudioRef.current = null;
          setIsPlayingCompanion(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          companionAudioRef.current = null;
          setIsPlayingCompanion(false);
        };
        await audio.play();
      } else {
        setIsPlayingCompanion(false);
      }
    } catch {
      setIsPlayingCompanion(false);
    }
  }, [character.voiceId, isPlayingCompanion, applyTtsVolume]);

  // Greeting on mount (voice disabled)
  useEffect(() => {
    if (!hasPlayedGreeting.current) {
      hasPlayedGreeting.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate volume meter from analyser
  const updateVolume = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    setVolume(Math.min(1, rms / 0.3));
    animFrameRef.current = requestAnimationFrame(updateVolume);
  }, []);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Save progress when speaking assessment completes
  const hasSavedProgress = useRef(false);
  useEffect(() => {
    if (phase !== "feedback" || !analysis || !characterId || hasSavedProgress.current) return;
    hasSavedProgress.current = true;

    const saveProgress = async () => {
      const spokenTime = elapsedTimeRef.current;

      try {
        const res = await fetchWithRetry("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component,
            score: analysis.normalizedScore,
            xpEarned: totalXPEarned,
            durationSeconds: spokenTime,
            questionsAttempted: 1,
            questionsCorrect: analysis.normalizedScore >= 60 ? 1 : 0,
            bestStreak: analysis.normalizedScore >= 60 ? 1 : 0,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.newAchievements?.length > 0) {
            showAchievementToasts(data.newAchievements);
          }
        }
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    };

    saveProgress();
  }, [phase, analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer logic — counts up (stopwatch)
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const next = prev + 1;
          elapsedTimeRef.current = next;
          return next;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [isRecording]);

  // Format seconds to mm:ss
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // Shuffle displayed topics
  const shuffleTopics = useCallback(() => {
    const shuffled = shuffle(topics);
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

  // Start recording (PCM WAV via AudioContext) with 3-second countdown
  const startRecording = useCallback(async () => {
    try {
      // Request mic access immediately so permission prompt happens during countdown
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      });
      streamRef.current = stream;

      // Enter countdown phase
      setPhase("countdown");
      setExpression("encouraging");
      setCountdown(3);
      setDialogue(getDialogue(character.name, "c5_get_ready"));

      // 3-second countdown
      await new Promise<void>((resolve) => {
        let remaining = 3;
        const countdownInterval = setInterval(() => {
          remaining--;
          if (remaining <= 0) {
            clearInterval(countdownInterval);
            resolve();
          } else {
            setCountdown(remaining);
          }
        }, 1000);
      });

      // Set up audio context and start recording
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Analyser for volume visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // ScriptProcessor for PCM capture (4096 buffer, mono in, mono out)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      // Connect to destination (muted) so ScriptProcessor fires events
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      // Start volume animation
      animFrameRef.current = requestAnimationFrame(updateVolume);

      setIsRecording(true);
      setPhase("recording");
      setElapsedTime(0);
      setExpression("listening");
      setDialogue(getDialogue(character.name, "c5_listening"));
    } catch {
      setExpression("surprised");
      setDialogue(getDialogue(character.name, "c5_mic_error"));
    }
  }, [updateVolume]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!isRecording) return;

    // Stop volume animation
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = 0;
    setVolume(0);
    analyserRef.current = null;

    // Close audio context (stops processor)
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }

    // Stop mic stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Concatenate all chunks into a single Float32Array
    const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];

    // Encode as WAV
    const wavBlob = encodeWAV(merged, 16000);

    setIsRecording(false);
    handleRecordingComplete(wavBlob);
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle completed recording
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setPhase("assessing");
    setExpression("thinking");
    setDialogue(getDialogue(character.name, "c5_analyzing"));

    const spokenTime = elapsedTimeRef.current;

    try {
      // Send audio to C5 assessment API
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");
      formData.append("topic", selectedTopic ?? "");
      formData.append("spokenDurationSeconds", String(spokenTime));

      const assessResponse = await fetchWithRetry("/api/speech/c5-assess", {
        method: "POST",
        body: formData,
      });

      if (!assessResponse.ok) {
        const errBody = await assessResponse.json().catch(() => ({}));
        console.error("[C5] Assessment API error:", assessResponse.status, errBody);
        throw new Error(`Assessment failed (${assessResponse.status})`);
      }

      const c5Result = await assessResponse.json();

      // Calculate XP using normalized score
      const isGood = c5Result.normalizedScore >= 60;
      const xpResult = calculateXP({
        pronunciationScore: c5Result.normalizedScore,
        isCorrect: isGood,
        currentStreak: isGood ? 1 : 0,
      });
      setTotalXPEarned(xpResult.totalXP);

      // Get character AI feedback
      let overallFeedback = "";
      try {
        const feedbackResponse = await fetchWithRetry("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterPrompt: character.personalityPrompt,
            component: 5,
            questionText: `Topic: "${selectedTopic}". Score: ${c5Result.totalScore}/30. Spoken for ${Math.floor(spokenTime / 60)}m ${spokenTime % 60}s.`,
            userAnswer: c5Result.transcript || "Prompted speaking attempt",
            pronunciationScore: c5Result.normalizedScore,
            isCorrect: isGood,
          }),
        });

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          overallFeedback = feedbackData.feedback;
        }
      } catch {
        overallFeedback = isGood
          ? "Good effort! Keep practicing to improve your score."
          : "Keep practicing! Focus on pronunciation and speaking for the full duration.";
      }

      if (!overallFeedback) {
        overallFeedback = isGood
          ? "Good effort! Keep practicing to improve your score."
          : "Keep practicing! Focus on pronunciation and speaking for the full duration.";
      }

      setDialogue(overallFeedback);
      setAnalysis({ ...c5Result, overallFeedback });
      setPhase("feedback");

      // Set expression based on score
      const feedbackExpression: ExpressionName =
        c5Result.normalizedScore >= 90 ? "excited" :
        c5Result.normalizedScore >= 60 ? "happy" : "encouraging";
      setExpression(feedbackExpression);
    } catch {
      setPhase("feedback");
      setExpression("surprised");
      setDialogue(getDialogue(character.name, "c5_error"));
      setAnalysis(null);
    }
  }, [selectedTopic, character.personalityPrompt, playCompanionVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to topic selection
  const handleBackToSelection = useCallback(() => {
    setSelectedTopic(null);
    setPhase("select");
    setElapsedTime(0);
    setAnalysis(null);
    setTotalXPEarned(0);
    setShowTranscript(false);
    setExpression("neutral");
    setDialogue(getDialogue(character.name, "c5_initial"));
    hasSavedProgress.current = false;
    const shuffled = shuffle(topics);
    setDisplayTopics(shuffled.slice(0, 6));
  }, [topics]);

  // Topic selection screen
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

            <div className="flex flex-col gap-2">
              <Button onClick={selectRandomTopic} variant="default" className="w-full">
                Random Topic
              </Button>
              <Button onClick={shuffleTopics} variant="outline" className="w-full">
                Shuffle Topics
              </Button>
            </div>
          </div>

          {/* Right side: Topic selection (70%) */}
          <div className="flex-1 md:w-[70%]">
            <div className="grid gap-3 sm:grid-cols-2 max-h-[70vh] overflow-y-auto pr-2">
              {displayTopics.map((topic, index) => (
                <Card
                  key={`${topic}-${index}`}
                  className="cursor-pointer transition-all hover:border-primary hover:shadow-md h-fit"
                  onClick={() => handleSelectTopic(topic)}
                >
                  <CardContent className="flex items-center justify-center py-6">
                    <p className="text-lg font-medium text-center font-chinese">{topic}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Feedback / completion screen
  if (phase === "feedback" || phase === "complete") {
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
                setPhase("prepare");
                setElapsedTime(0);
                setAnalysis(null);
                setTotalXPEarned(0);
                setShowTranscript(false);
                hasSavedProgress.current = false;
                setExpression("encouraging");
                setDialogue(`Let's try "${selectedTopic}" again! Remember to follow the structure.`);
              }} className="w-full">
                Try Again
              </Button>
              <Button variant="outline" onClick={handleBackToSelection} className="w-full">
                Choose Another Topic
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link href="/practice">Back to Practice</Link>
              </Button>
            </div>
          </div>

          {/* Right side: Results (70%) */}
          <div className="flex-1 md:w-[70%]">
            <Card className="h-full">
              <CardContent className="pt-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <h2 className="font-pixel text-sm text-center">
              Speaking Assessment: <span className="font-chinese text-base">{selectedTopic}</span>
            </h2>

            {analysis && (
              <>
                {/* Total PSC score */}
                <div className="text-center">
                  <p
                    className={`text-5xl font-bold ${
                      analysis.totalScore >= 25
                        ? "text-green-600"
                        : analysis.totalScore >= 18
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    {analysis.totalScore}/30
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    PSC C5 Score (命题说话)
                  </p>
                </div>

                {/* XP and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-yellow-600">+{totalXPEarned}</p>
                    <p className="text-sm text-muted-foreground">XP Earned</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">
                      {formatTime(elapsedTime)}
                    </p>
                    <p className="text-sm text-muted-foreground">Time Spoken</p>
                  </div>
                </div>

                {/* PSC-style score breakdown */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">Score Breakdown:</h3>

                  {/* Pronunciation */}
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">语音 Pronunciation</span>
                        <Badge variant="secondary" className="text-xs">{analysis.pronunciation.label}</Badge>
                      </div>
                      <span className={`text-lg font-bold ${
                        analysis.pronunciation.score >= 17 ? "text-green-600" :
                        analysis.pronunciation.score >= 14 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {analysis.pronunciation.score}/20
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{analysis.pronunciation.notes}</p>
                    <Progress value={(analysis.pronunciation.score / 20) * 100} className="h-1.5" />
                  </div>

                  {/* Vocab/Grammar */}
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">词汇语法 Vocab & Grammar</span>
                        <Badge variant="secondary" className="text-xs">{analysis.vocabGrammar.label}</Badge>
                      </div>
                      <span className={`text-lg font-bold ${
                        analysis.vocabGrammar.score >= 4 ? "text-green-600" :
                        analysis.vocabGrammar.score >= 3 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {analysis.vocabGrammar.score}/5
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{analysis.vocabGrammar.notes}</p>
                    <Progress value={(analysis.vocabGrammar.score / 5) * 100} className="h-1.5" />
                  </div>

                  {/* Fluency */}
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">自然流畅 Fluency</span>
                        <Badge variant="secondary" className="text-xs">{analysis.fluency.label}</Badge>
                      </div>
                      <span className={`text-lg font-bold ${
                        analysis.fluency.score >= 4 ? "text-green-600" :
                        analysis.fluency.score >= 3 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {analysis.fluency.score}/5
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{analysis.fluency.notes}</p>
                    <Progress value={(analysis.fluency.score / 5) * 100} className="h-1.5" />
                  </div>

                  {/* Time penalty */}
                  {analysis.timePenalty > 0 && (
                    <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-red-600">时间扣分 Time Penalty</span>
                        <span className="text-lg font-bold text-red-600">-{analysis.timePenalty}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Speak for the full 3 minutes to avoid time penalties.
                      </p>
                    </div>
                  )}
                </div>

                {/* Transcript (collapsible) */}
                {analysis.transcript && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setShowTranscript(!showTranscript)}
                      className="text-sm font-bold flex items-center gap-1 cursor-pointer"
                    >
                      Transcript ({analysis.errorCount} pronunciation {analysis.errorCount === 1 ? "error" : "errors"})
                      <span className="text-muted-foreground">{showTranscript ? "▲" : "▼"}</span>
                    </button>
                    {showTranscript && (
                      <div className="rounded-lg border bg-muted/30 p-3 max-h-[200px] overflow-y-auto">
                        <p className="text-sm font-chinese leading-relaxed">{analysis.transcript}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {!analysis && (
              <div className="text-center text-muted-foreground py-4">
                Assessment data unavailable. Please try again.
              </div>
            )}
              </CardContent>
            </Card>
          </div>
        </div>
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

          {/* Countdown display */}
          {phase === "countdown" && (
            <div className="text-center space-y-2">
              <p className="text-6xl font-bold font-mono text-primary animate-pulse">
                {countdown}
              </p>
              <p className="text-sm text-muted-foreground">Get ready to speak...</p>
            </div>
          )}

          {/* Stopwatch display */}
          {phase === "recording" && (
            <div className="text-center space-y-2">
              <p className={`text-4xl font-bold font-mono transition-colors ${
                elapsedTime >= TOTAL_TIME ? "text-green-600" : "text-orange-500"
              }`}>
                {formatTime(elapsedTime)}
              </p>
              <Progress
                value={Math.min((elapsedTime / TOTAL_TIME) * 100, 100)}
                className="h-2"
              />
              <p className={`text-xs font-medium ${
                elapsedTime >= TOTAL_TIME ? "text-green-600" : "text-orange-500"
              }`}>
                {elapsedTime >= TOTAL_TIME
                  ? "3 minutes reached! You can stop when ready."
                  : `Speak for at least ${formatTime(TOTAL_TIME - elapsedTime)} more`}
              </p>
            </div>
          )}

          {/* Volume visualization */}
          {phase === "recording" && (
            <div className="flex items-end justify-center gap-[3px] h-8">
              {Array.from({ length: 20 }).map((_, i) => {
                const barActive = (i + 1) / 20 <= volume;
                const barColor = barActive
                  ? volume > 0.7
                    ? "#ef4444"
                    : volume > 0.4
                    ? "#eab308"
                    : "#22c55e"
                  : "#d1d5db";
                return (
                  <div
                    key={i}
                    className="w-1.5 rounded-full transition-all duration-75"
                    style={{
                      height: barActive ? `${Math.max(4, volume * 32)}px` : "4px",
                      backgroundColor: barColor,
                    }}
                  />
                );
              })}
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
              <div className="rounded-lg border bg-muted/30 p-6 space-y-4 max-h-[50vh] overflow-y-auto">
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
