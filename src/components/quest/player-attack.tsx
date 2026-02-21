"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "@/components/practice/audio-recorder";
import type { RecordingGroup } from "@/lib/quest/types";
import { Volume2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAudioSettings } from "@/components/shared/audio-settings";

interface WordScore {
  word: string;
  score: number | null;
  toneScore?: number;
  phoneError?: string;
}

interface PlayerAttackProps {
  recordingGroup: RecordingGroup;
  isRetry: boolean;
  onComplete: (score: number) => void;
}

type Phase = "recording" | "assessing" | "results";

const ATTACK_THRESHOLD = 80;

export function PlayerAttack({
  recordingGroup,
  isRetry,
  onComplete,
}: PlayerAttackProps) {
  const [phase, setPhase] = useState<Phase>("recording");
  const [showPinyin, setShowPinyin] = useState(false);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [wordScores, setWordScores] = useState<WordScore[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const { applyTtsVolume } = useAudioSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleRecordingComplete = useCallback(
    async (audioBlob: Blob) => {
      setPhase("assessing");
      try {
        // Build reference text
        let referenceText: string;
        if (recordingGroup.type === "passage" && recordingGroup.passageText) {
          referenceText = recordingGroup.passageText;
        } else {
          referenceText = recordingGroup.words.join(" ");
        }

        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.wav");
        formData.append("referenceText", referenceText);
        formData.append("category", recordingGroup.category);

        const response = await fetch("/api/speech/assess", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Assessment failed");
        }

        const data = await response.json();

        if (!mountedRef.current) return;

        // Extract per-word scores (filter out insertions/omissions)
        const apiWords: Array<{
          word: string;
          accuracyScore: number;
          errorType: string;
          toneScore?: number;
          phoneError?: string;
        }> = (data.words ?? []).filter(
          (w: { errorType: string }) =>
            w.errorType !== "Insertion" && w.errorType !== "Omission"
        );

        // Match API words to recording group words by index
        const scores: WordScore[] = recordingGroup.words.map((word, i) => {
          const match = apiWords[i];
          if (match) {
            return {
              word,
              score: match.accuracyScore,
              toneScore: match.toneScore,
              phoneError: match.phoneError,
            };
          }
          return { word, score: null };
        });

        setWordScores(scores);

        // Use ISE total_score (pronunciationScore field) as the overall score
        const pronunciationScore = Math.round(data.pronunciationScore ?? 0);
        setOverallScore(pronunciationScore);
        setPhase("results");
      } catch {
        // On error, show 0 score results
        if (mountedRef.current) {
          setWordScores(
            recordingGroup.words.map((word) => ({ word, score: null }))
          );
          setOverallScore(0);
          setPhase("results");
        }
      }
    },
    [recordingGroup]
  );

  const handleContinue = useCallback(() => {
    onComplete(overallScore);
  }, [onComplete, overallScore]);

  const playTTS = useCallback(
    async (word: string) => {
      if (playingWord) return;
      setPlayingWord(word);

      try {
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId: "x_xiaoyan", text: word }),
        });

        if (!response.ok) throw new Error("TTS failed");

        const audioBlob = await response.blob();
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        applyTtsVolume(audio);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (mountedRef.current) setPlayingWord(null);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (mountedRef.current) setPlayingWord(null);
        };

        await audio.play();
      } catch {
        if (mountedRef.current) setPlayingWord(null);
      }
    },
    [playingWord, applyTtsVolume]
  );

  const isPassage = recordingGroup.type === "passage";
  const attackSucceeds = overallScore >= ATTACK_THRESHOLD;

  // ---------- Results phase ----------
  if (phase === "results") {
    return (
      <div className="space-y-3">
        {/* Per-word scores (for word-based groups) */}
        {!isPassage && wordScores.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {wordScores.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 sm:px-3 sm:py-2 border border-amber-800/20 bg-amber-50/40 rounded-sm min-w-[50px] sm:min-w-[60px]"
              >
                <span className="font-chinese text-lg sm:text-xl md:text-2xl text-amber-950 font-bold">
                  {item.word}
                </span>
                {item.score !== null ? (
                  <>
                    <span
                      className={`font-pixel text-sm ${
                        item.score >= 90
                          ? "text-green-700"
                          : item.score >= 60
                            ? "text-yellow-700"
                            : "text-red-700"
                      }`}
                    >
                      {item.score}
                    </span>
                    {item.toneScore !== undefined && (
                      <span
                        className={`font-retro text-[10px] ${
                          item.toneScore >= 80
                            ? "text-green-600"
                            : item.toneScore >= 40
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        声调 {item.toneScore}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-pixel text-sm text-amber-800/40">
                    --
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Overall score */}
        <div className="text-center space-y-1">
          <p className="font-retro text-xs text-amber-800/60">Overall Score</p>
          <p
            className={`font-pixel text-2xl sm:text-3xl ${
              overallScore >= ATTACK_THRESHOLD
                ? "text-green-700"
                : overallScore >= 60
                  ? "text-yellow-700"
                  : "text-red-700"
            }`}
          >
            {overallScore}
          </p>
          <p
            className={`font-retro text-sm ${
              attackSucceeds ? "text-green-600" : "text-red-600"
            }`}
          >
            {attackSucceeds
              ? "Attack power charged!"
              : `Need ≥ ${ATTACK_THRESHOLD} to deal damage`}
          </p>
        </div>

        {/* Continue button */}
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            className={`px-6 py-3 border-2 transition-all cursor-pointer rounded-sm font-pixel text-xs min-h-[44px] ${
              attackSucceeds
                ? "border-green-700/50 bg-green-100/60 hover:bg-green-200/80 text-green-900"
                : "border-amber-700/50 bg-amber-100/60 hover:bg-amber-200/80 text-amber-900"
            }`}
          >
            {attackSucceeds ? "Attack!" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- Recording / Assessing phase ----------
  return (
    <div className="space-y-3">
      {/* Label */}
      <div className="text-center">
        <p className="font-retro text-sm text-amber-800/60">
          {recordingGroup.label}
        </p>
      </div>

      {/* Retry hint controls */}
      {isRetry &&
        recordingGroup.pinyin &&
        recordingGroup.pinyin.length > 0 && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPinyin((prev) => !prev)}
              className="font-retro text-xs border-amber-800/30 text-amber-800 hover:bg-amber-100/50"
            >
              {showPinyin ? (
                <EyeOff className="w-3 h-3 mr-1" />
              ) : (
                <Eye className="w-3 h-3 mr-1" />
              )}
              {showPinyin ? "Hide Pinyin" : "Show Pinyin"}
            </Button>
          </div>
        )}

      {/* Word display */}
      <div className="py-2">
        {isPassage ? (
          <div className="max-h-48 overflow-y-auto text-center">
            <p className="font-chinese text-xl md:text-2xl leading-relaxed text-amber-950 whitespace-pre-wrap">
              {recordingGroup.passageText}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            {recordingGroup.words.map((word, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-1 px-3 py-2 border border-amber-800/20 bg-amber-50/40 rounded-sm"
              >
                <span className="font-chinese text-xl sm:text-2xl md:text-3xl text-amber-950 font-bold">
                  {word}
                </span>
                {showPinyin && recordingGroup.pinyin?.[i] && (
                  <span className="font-retro text-xs text-amber-700">
                    {recordingGroup.pinyin[i]}
                  </span>
                )}
                {isRetry && (
                  <button
                    onClick={() => playTTS(word)}
                    disabled={playingWord !== null}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-amber-700/60 hover:text-amber-800 transition-colors disabled:opacity-50"
                    title={`Play "${word}"`}
                  >
                    <Volume2
                      className={`w-4 h-4 ${
                        playingWord === word
                          ? "text-amber-700 animate-pulse"
                          : ""
                      }`}
                    />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recording area */}
      <div className="flex flex-col items-center gap-2">
        {phase === "assessing" ? (
          <div className="flex items-center gap-2 text-amber-800 font-retro">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Assessing pronunciation...</span>
          </div>
        ) : (
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={phase !== "recording"}
          />
        )}
      </div>
    </div>
  );
}
