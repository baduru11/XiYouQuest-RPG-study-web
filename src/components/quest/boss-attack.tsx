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
      const parts = text.split(/\*\*(.*?)\*\*/);
      return (
        <p className="font-chinese text-lg md:text-xl text-amber-900/90 mb-3 leading-relaxed text-center">
          {parts.map((part, i) =>
            i % 2 === 1 ? (
              <span
                key={i}
                className="text-red-700 font-bold underline underline-offset-4 decoration-red-500"
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
      <p className="font-chinese text-lg md:text-xl text-amber-900/90 mb-3 leading-relaxed text-center">
        {text}
      </p>
    );
  };

  return (
    <div className="space-y-3">
      {/* Question counter + Timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-16 sm:w-24 h-2 bg-amber-900/20 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                timeLeft > timerSeconds * 0.5
                  ? "bg-green-600"
                  : timeLeft > timerSeconds * 0.25
                    ? "bg-yellow-600"
                    : "bg-red-600"
              }`}
              style={{ width: `${(timeLeft / timerSeconds) * 100}%` }}
            />
          </div>
          <span className={`font-pixel text-sm ${timerColor.replace("text-green-400", "text-green-700").replace("text-yellow-400", "text-yellow-700").replace("text-red-400", "text-red-700")}`}>
            {timeLeft}
          </span>
        </div>
        <span className="font-retro text-xs text-amber-800/50">
          Q{mcqNumber}/{mcqTotal}
        </span>
      </div>

      {/* Context */}
      {renderContext()}

      {/* Question prompt */}
      <p className="font-chinese text-xl md:text-2xl text-amber-950 font-bold text-center leading-relaxed">
        {mcq.prompt}
      </p>

      {/* Options */}
      <div className="grid gap-2">
        {mcq.options.map((option, i) => {
          let optionClass =
            "w-full text-center px-3 py-3 sm:px-4 font-chinese text-base sm:text-lg md:text-xl border-2 transition-all rounded-sm min-h-[44px] ";

          if (showResult) {
            if (i === mcq.correctIndex) {
              optionClass +=
                "border-green-600 bg-green-100/60 text-green-800";
            } else if (i === selectedIndex && i !== mcq.correctIndex) {
              optionClass += "border-red-600 bg-red-100/60 text-red-800";
            } else {
              optionClass +=
                "border-amber-800/20 bg-amber-50/30 text-amber-900/40";
            }
          } else {
            optionClass +=
              "border-amber-800/30 bg-amber-50/40 text-amber-950 hover:border-amber-700 hover:bg-amber-100/60 cursor-pointer";
          }

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={showResult}
              className={optionClass}
            >
              <span className="font-retro text-xs text-amber-700/60 mr-2">
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
            <p className="font-pixel text-sm text-green-700">
              BLOCKED!
            </p>
          ) : (
            <p className="font-pixel text-sm text-red-700">
              {selectedIndex === -1 ? "TIME UP! -1 HP" : "HIT! -1 HP"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
