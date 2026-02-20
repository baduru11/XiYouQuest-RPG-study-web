"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { BattleState, StageNumber } from "@/lib/quest/types";
import { STAGE_CONFIGS } from "@/lib/quest/stage-config";
import { Swords, RotateCcw, ArrowLeft } from "lucide-react";

interface DefeatScreenProps {
  stage: StageNumber;
  battleState: BattleState;
  onRetry: () => void;
  onReturnToStages: () => void;
}

export function DefeatScreen({
  stage,
  battleState,
  onRetry,
  onReturnToStages,
}: DefeatScreenProps) {
  const config = STAGE_CONFIGS[stage];
  const savedRef = useRef(false);

  const mcqAccuracy =
    battleState.results.mcqTotal > 0
      ? `${battleState.results.mcqCorrect}/${battleState.results.mcqTotal}`
      : "N/A";

  // Save defeat attempt on mount
  useEffect(() => {
    if (savedRef.current) return;
    savedRef.current = true;

    fetch("/api/quest/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        is_cleared: false,
        score: 0,
      }),
    }).catch(() => {
      // Silently fail - not critical
    });
  }, [stage]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), url("${config.backgroundImage}")` }}
    >

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md mx-auto px-6">
        {/* Defeat title */}
        <div className="text-center animate-fade-in-up">
          <h1 className="font-pixel text-2xl md:text-3xl text-red-500 pixel-glow">
            DEFEATED
          </h1>
          <p className="font-chinese text-2xl text-red-400 mt-1">
            战败
          </p>
        </div>

        {/* Stats */}
        <div
          className="flex flex-col items-center gap-2 p-4 pixel-border bg-background/80 w-full animate-fade-in-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-muted-foreground" />
            <span className="font-pixel text-[10px] text-muted-foreground">
              MCQ Accuracy:
            </span>
            <span className="font-retro text-lg text-foreground">
              {mcqAccuracy}
            </span>
          </div>
        </div>

        {/* Hint */}
        <div
          className="text-center px-4 py-3 pixel-border bg-amber-900/20 backdrop-blur-sm animate-fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <p className="font-retro text-sm text-amber-200/80">
            On your next attempt, you can use pinyin and audio hints!
          </p>
          <p className="font-chinese text-xs text-amber-200/50 mt-1">
            下次挑战时可以使用拼音和音频提示!
          </p>
        </div>

        {/* Action buttons */}
        <div
          className="flex flex-col gap-3 w-full animate-fade-in-up"
          style={{ animationDelay: "0.4s" }}
        >
          <Button
            onClick={onRetry}
            size="lg"
            className="w-full font-pixel text-sm"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Retry 重试
          </Button>
          <Button
            onClick={onReturnToStages}
            variant="outline"
            size="lg"
            className="w-full font-pixel text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Stages 返回
          </Button>
        </div>
      </div>
    </div>
  );
}
