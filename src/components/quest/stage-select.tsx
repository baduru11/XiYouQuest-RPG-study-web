"use client";

import { useMemo } from "react";
import Image from "next/image";
import type { QuestProgress, StageNumber } from "@/lib/quest/types";
import {
  STAGE_CONFIGS,
  QUEST_CHARACTERS,
} from "@/lib/quest/stage-config";
import { Check, Lock } from "lucide-react";

interface StageSelectProps {
  questProgress: QuestProgress[];
  unlockedCharacters: string[];
  onStageSelect: (stage: StageNumber) => void;
}

export function StageSelect({
  questProgress,
  unlockedCharacters,
  onStageSelect,
}: StageSelectProps) {
  const clearedStages = useMemo(() => {
    return new Set(
      questProgress.filter((p) => p.is_cleared).map((p) => p.stage)
    );
  }, [questProgress]);

  const isStageAvailable = (stage: StageNumber) => {
    const config = STAGE_CONFIGS[stage];
    if (config.prerequisiteStage === null) return true;
    return clearedStages.has(config.prerequisiteStage);
  };

  const stageNumbers: StageNumber[] = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="font-pixel text-lg md:text-xl text-primary pixel-glow-gold">
          Journey to the West
        </h1>
        <p className="font-chinese text-xl text-muted-foreground">
          西游记
        </p>
      </div>

      {/* Party portraits */}
      <div className="flex justify-center gap-3">
        {unlockedCharacters.map((name) => {
          const char = QUEST_CHARACTERS[name];
          if (!char) return null;
          return (
            <div
              key={name}
              className="flex flex-col items-center gap-1"
            >
              <div className="w-14 h-14 md:w-16 md:h-16 pixel-border bg-background/80 overflow-hidden relative">
                <Image
                  src={char.image}
                  alt={char.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <span className="font-retro text-xs text-muted-foreground">
                {char.nameCN}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stage list */}
      <div className="space-y-3">
        {stageNumbers.map((stageNum) => {
          const config = STAGE_CONFIGS[stageNum];
          const cleared = clearedStages.has(stageNum);
          const available = isStageAvailable(stageNum);
          const locked = !available && !cleared;

          return (
            <button
              key={stageNum}
              onClick={() => {
                if (available || cleared) onStageSelect(stageNum);
              }}
              disabled={locked}
              className={`
                w-full text-left p-4 pixel-border bg-background/80 backdrop-blur-sm
                transition-all relative overflow-hidden
                ${locked ? "opacity-50 cursor-not-allowed grayscale" : "cursor-pointer hover:bg-background/95"}
                ${available && !cleared ? "animate-pixel-pulse" : ""}
                ${cleared ? "pixel-border-green" : ""}
              `}
            >
              <div className="flex items-center gap-4">
                {/* Boss thumbnail */}
                <div className="w-16 h-16 md:w-20 md:h-20 relative shrink-0 pixel-border overflow-hidden bg-black/20">
                  {locked ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted/50">
                      <Lock className="w-6 h-6 text-muted-foreground" />
                    </div>
                  ) : (
                    <Image
                      src={config.bossImage}
                      alt={config.bossName}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  )}
                </div>

                {/* Stage info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-[10px] md:text-xs text-primary/70">
                      Stage {stageNum}
                    </span>
                    {cleared && (
                      <span className="inline-flex items-center gap-1 bg-green-800/30 text-green-400 font-pixel text-[8px] px-2 py-0.5 rounded-sm">
                        <Check className="w-3 h-3" />
                        CLEARED
                      </span>
                    )}
                  </div>
                  <h3 className="font-pixel text-xs md:text-sm text-foreground truncate">
                    {config.name}
                  </h3>
                  <p className="font-chinese text-sm text-muted-foreground">
                    {config.nameCN}
                  </p>
                  <p className="font-retro text-sm text-muted-foreground/80 truncate">
                    {config.subtitle}
                  </p>
                  {!locked && (
                    <p className="font-retro text-xs text-amber-600/80 mt-0.5">
                      Boss: {config.bossName} ({config.bossNameCN})
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
