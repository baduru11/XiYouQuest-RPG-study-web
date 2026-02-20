"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { QuestMCQ } from "@/lib/quest/types";

interface BossAttackProps {
  mcq: QuestMCQ;
  timerSeconds: number;
  mcqNumber: number;
  mcqTotal: number;
  onAnswer: (isCorrect: boolean) => void;
}

export function BossAttack({
  mcq,
  timerSeconds,
  mcqNumber,
  mcqTotal,
  onAnswer,
}: BossAttackProps) {
  // Parent uses unique `key` prop, so component remounts on each MCQ change.
  // No need for a reset effect — initial values are correct on mount.
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const answeredRef = useRef(false);

  // Timer countdown
  useEffect(() => {
    if (showResult || answeredRef.current) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Time's up = wrong answer
          if (!answeredRef.current) {
            answeredRef.current = true;
            setShowResult(true);
            setSelectedIndex(-1); // No selection
            setTimeout(() => {
              onAnswer(false);
            }, 1200);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [mcq, showResult, onAnswer]);

  const handleSelect = useCallback(
    (index: number) => {
      if (answeredRef.current || showResult) return;
      answeredRef.current = true;
      setSelectedIndex(index);
      setShowResult(true);

      const isCorrect = index === mcq.correctIndex;

      // Delay before calling onAnswer to show result
      setTimeout(() => {
        onAnswer(isCorrect);
      }, 1200);
    },
    [mcq.correctIndex, onAnswer, showResult]
  );

  // Timer color
  const timerColor =
    timeLeft > timerSeconds * 0.5
      ? "text-green-400"
      : timeLeft > timerSeconds * 0.25
        ? "text-yellow-400"
        : "text-red-400 animate-pulse";

  // Render context with highlighted character
  const renderContext = () => {
    if (!mcq.context) return null;
    const text = mcq.context;

    if (mcq.highlightedChar) {
      // Split on **char** pattern
      const parts = text.split(/\*\*(.*?)\*\*/);
      return (
        <p className="font-chinese text-base text-amber-100/90 mb-3 leading-relaxed">
          {parts.map((part, i) =>
            i % 2 === 1 ? (
              <span
                key={i}
                className="text-amber-300 font-bold underline underline-offset-4 decoration-amber-400"
              >
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </p>
      );
    }

    return (
      <p className="font-chinese text-base text-amber-100/90 mb-3 leading-relaxed">
        {text}
      </p>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Banner */}
      <div className="flex items-center justify-between">
        <span className="font-pixel text-sm text-red-400 pixel-glow">
          ENEMY TURN &mdash; Defend!
        </span>
        <span className="font-retro text-xs text-muted-foreground">
          Q{mcqNumber}/{mcqTotal}
        </span>
      </div>

      {/* Timer bar + number */}
      <div className="space-y-1">
        <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft > timerSeconds * 0.5
                ? "bg-green-500"
                : timeLeft > timerSeconds * 0.25
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${(timeLeft / timerSeconds) * 100}%` }}
          />
        </div>
        <div className="flex justify-center">
          <span className={`font-pixel text-lg ${timerColor}`}>
            {timeLeft}
          </span>
        </div>
      </div>

      {/* MCQ Card */}
      <div className="pixel-border bg-background/90 backdrop-blur-sm p-4 space-y-3">
        {/* Context */}
        {renderContext()}

        {/* Question prompt */}
        <p className="font-chinese text-lg text-foreground font-medium">
          {mcq.prompt}
        </p>

        {/* Options */}
        <div className="grid gap-2">
          {mcq.options.map((option, i) => {
            let optionClass =
              "w-full text-left px-4 py-3 font-chinese text-base border-2 transition-all ";

            if (showResult) {
              if (i === mcq.correctIndex) {
                optionClass +=
                  "border-green-500 bg-green-500/20 text-green-300";
              } else if (i === selectedIndex && i !== mcq.correctIndex) {
                optionClass += "border-red-500 bg-red-500/20 text-red-300";
              } else {
                optionClass +=
                  "border-border bg-muted/30 text-muted-foreground opacity-50";
              }
            } else {
              optionClass +=
                "border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 cursor-pointer";
            }

            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={showResult}
                className={optionClass}
              >
                <span className="font-retro text-xs text-muted-foreground mr-2">
                  {String.fromCharCode(65 + i)}.
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {/* Result feedback */}
        {showResult && (
          <div className="text-center animate-fade-in-up">
            {selectedIndex === mcq.correctIndex ? (
              <p className="font-pixel text-xs text-green-400 pixel-glow-green">
                BLOCKED!
              </p>
            ) : (
              <p className="font-pixel text-xs text-red-400 pixel-glow">
                {selectedIndex === -1 ? "TIME UP! -1 HP" : "HIT! -1 HP"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
