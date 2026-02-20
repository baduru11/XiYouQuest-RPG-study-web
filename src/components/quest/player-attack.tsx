"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "@/components/practice/audio-recorder";
import type { RecordingGroup } from "@/lib/quest/types";
import { Volume2, Eye, EyeOff, Loader2 } from "lucide-react";

interface PlayerAttackProps {
  recordingGroup: RecordingGroup;
  isRetry: boolean;
  onComplete: (score: number) => void;
}

export function PlayerAttack({
  recordingGroup,
  isRetry,
  onComplete,
}: PlayerAttackProps) {
  const [isAssessing, setIsAssessing] = useState(false);
  const [showPinyin, setShowPinyin] = useState(false);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
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
      setIsAssessing(true);
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
        const score = data.total_score ?? 0;

        if (mountedRef.current) {
          onComplete(score);
        }
      } catch {
        // On error, still continue with a default score
        if (mountedRef.current) {
          onComplete(50);
        }
      } finally {
        if (mountedRef.current) {
          setIsAssessing(false);
        }
      }
    },
    [recordingGroup, onComplete]
  );

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
    [playingWord]
  );

  const isPassage = recordingGroup.type === "passage";

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Banner */}
      <div className="text-center">
        <span className="font-pixel text-sm text-green-400 pixel-glow-green">
          YOUR TURN &mdash; Attack!
        </span>
        <p className="font-retro text-sm text-muted-foreground mt-1">
          {recordingGroup.label}
        </p>
      </div>

      {/* Retry hint controls */}
      {isRetry && recordingGroup.pinyin && recordingGroup.pinyin.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPinyin((prev) => !prev)}
            className="font-retro text-xs"
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
      <div className="pixel-border bg-background/90 backdrop-blur-sm p-4">
        {isPassage ? (
          <div className="max-h-48 overflow-y-auto">
            <p className="font-chinese text-base md:text-lg leading-relaxed text-foreground whitespace-pre-wrap">
              {recordingGroup.passageText}
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-3 ${
              recordingGroup.type === "monosyllabic"
                ? "grid-cols-5 md:grid-cols-10"
                : "grid-cols-2 md:grid-cols-3"
            }`}
          >
            {recordingGroup.words.map((word, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-1 p-2 bg-muted/30 border border-border"
              >
                <span className="font-chinese text-lg md:text-xl text-foreground">
                  {word}
                </span>
                {showPinyin && recordingGroup.pinyin?.[i] && (
                  <span className="font-retro text-xs text-amber-600">
                    {recordingGroup.pinyin[i]}
                  </span>
                )}
                {isRetry && (
                  <button
                    onClick={() => playTTS(word)}
                    disabled={playingWord !== null}
                    className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    title={`Play "${word}"`}
                  >
                    <Volume2
                      className={`w-3.5 h-3.5 ${
                        playingWord === word ? "text-primary animate-pulse" : ""
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
        {isAssessing ? (
          <div className="flex items-center gap-2 text-amber-600 font-retro">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Assessing pronunciation...</span>
          </div>
        ) : (
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={isAssessing}
          />
        )}
      </div>
    </div>
  );
}
