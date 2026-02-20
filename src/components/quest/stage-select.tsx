"use client";

import { useMemo, useState, useCallback } from "react";
import Image from "next/image";
import type { QuestProgress, StageNumber } from "@/lib/quest/types";
import { STAGE_CONFIGS, QUEST_CHARACTERS } from "@/lib/quest/stage-config";
import { Check, Lock } from "lucide-react";

interface StageSelectProps {
  questProgress: QuestProgress[];
  unlockedCharacters: string[];
  onStageSelect: (stage: StageNumber) => void;
  onWatchPrologue?: () => void;
}

/** S-curve node positions mapped to a 1000x500 viewBox */
const NODE_POSITIONS: Record<StageNumber, { x: number; y: number }> = {
  1: { x: 70, y: 350 },
  2: { x: 210, y: 180 },
  3: { x: 350, y: 320 },
  4: { x: 500, y: 150 },
  5: { x: 640, y: 310 },
  6: { x: 780, y: 170 },
  7: { x: 930, y: 280 },
};

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5, 6, 7];

/** Build a quadratic Bezier path between two nodes */
function bezierSegment(
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  const cx = (from.x + to.x) / 2;
  // pull the control point toward the midpoint's opposite vertical direction
  const cy = (from.y + to.y) / 2 + (from.y < to.y ? -60 : 60);
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

type StageStatus = "cleared" | "available" | "locked";

export function StageSelect({
  questProgress,
  unlockedCharacters,
  onStageSelect,
  onWatchPrologue,
}: StageSelectProps) {
  const [hoveredStage, setHoveredStage] = useState<StageNumber | null>(null);

  const clearedStages = useMemo(() => {
    return new Set(
      questProgress.filter((p) => p.is_cleared).map((p) => p.stage)
    );
  }, [questProgress]);

  const getStageStatus = useCallback(
    (stage: StageNumber): StageStatus => {
      if (clearedStages.has(stage)) return "cleared";
      const config = STAGE_CONFIGS[stage];
      if (config.prerequisiteStage === null) return "available";
      if (clearedStages.has(config.prerequisiteStage)) return "available";
      return "locked";
    },
    [clearedStages]
  );

  /** The frontier stage (first non-cleared) shown by default in info panel */
  const frontierStage = useMemo<StageNumber>(() => {
    for (const s of STAGE_NUMBERS) {
      if (!clearedStages.has(s)) return s;
    }
    return 7;
  }, [clearedStages]);

  const infoStage = hoveredStage ?? frontierStage;
  const infoConfig = STAGE_CONFIGS[infoStage];
  const infoStatus = getStageStatus(infoStage);

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] animate-fade-in-up">
      {/* ─── Title bar ─── */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <div className="min-w-0">
          <h1 className="font-pixel text-sm md:text-lg text-primary pixel-glow-gold leading-tight">
            Journey to the West
          </h1>
          <p className="font-chinese text-base md:text-lg text-muted-foreground leading-tight">
            西游记
          </p>
        </div>
        {/* Party portraits */}
        <div className="flex items-center gap-1.5 shrink-0">
          {unlockedCharacters.map((name) => {
            const char = QUEST_CHARACTERS[name];
            if (!char) return null;
            return (
              <div
                key={name}
                className="w-9 h-9 md:w-11 md:h-11 rounded-full border-2 border-amber-700/60 overflow-hidden bg-amber-900/30"
                title={`${char.name} · ${char.nameCN}`}
              >
                <img
                  src={char.image}
                  alt={char.name}
                  className="w-full h-full object-cover object-top"
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Map area ─── */}
      <div
        className="flex-1 relative min-h-0 overflow-hidden mx-3 mb-2 chinese-frame chinese-corner"
        style={{
          backgroundImage: "url('/img/background/realbackground.webp')",
          backgroundSize: "100% 100%",
          backgroundPosition: "center",
        }}
      >
        {/* Parchment tint overlay for readability */}
        <div className="absolute inset-0 bg-[#FDF6E3]/40 pointer-events-none" />

        {/* Watch Prologue button */}
        {onWatchPrologue && (
          <button
            onClick={onWatchPrologue}
            className="absolute top-3 left-3 z-10 font-pixel text-[10px] text-black pixel-border bg-card px-2 py-1 hover:pixel-border-primary hover:scale-110 transition-transform duration-150"
          >
            ▶ Prologue
          </button>
        )}

        {/* SVG paths */}
        <svg
          viewBox="0 0 1000 500"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          {/* Golden glow filter */}
          <defs>
            <filter id="goldGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {STAGE_NUMBERS.slice(0, -1).map((stageNum) => {
            const nextStage = (stageNum + 1) as StageNumber;
            const from = NODE_POSITIONS[stageNum];
            const to = NODE_POSITIONS[nextStage];
            const d = bezierSegment(from, to);

            const fromStatus = getStageStatus(stageNum);
            const toStatus = getStageStatus(nextStage);
            const segmentCleared =
              fromStatus === "cleared" && toStatus !== "locked";
            const segmentAvailable =
              fromStatus === "cleared" && toStatus === "available";
            const segmentLocked = toStatus === "locked";

            if (segmentLocked) {
              return (
                <path
                  key={stageNum}
                  d={d}
                  fill="none"
                  stroke="#78716C"
                  strokeWidth={3}
                  strokeDasharray="8 6"
                  opacity={0.4}
                />
              );
            }

            if (segmentAvailable) {
              return (
                <path
                  key={stageNum}
                  d={d}
                  fill="none"
                  stroke="#C9A96E"
                  strokeWidth={4}
                  filter="url(#goldGlow)"
                  className="animate-path-pulse"
                />
              );
            }

            return (
              <path
                key={stageNum}
                d={d}
                fill="none"
                stroke={segmentCleared ? "#C9A96E" : "#78716C"}
                strokeWidth={segmentCleared ? 4 : 3}
                filter={segmentCleared ? "url(#goldGlow)" : undefined}
                opacity={segmentCleared ? 1 : 0.4}
              />
            );
          })}
        </svg>

        {/* Stage nodes */}
        {STAGE_NUMBERS.map((stageNum) => {
          const pos = NODE_POSITIONS[stageNum];
          const config = STAGE_CONFIGS[stageNum];
          const status = getStageStatus(stageNum);
          const isLocked = status === "locked";
          const isAvailable = status === "available";
          const isCleared = status === "cleared";

          return (
            <button
              key={stageNum}
              onClick={() => {
                if (!isLocked) onStageSelect(stageNum);
              }}
              onMouseEnter={() => setHoveredStage(stageNum)}
              onMouseLeave={() => setHoveredStage(null)}
              onFocus={() => setHoveredStage(stageNum)}
              onBlur={() => setHoveredStage(null)}
              disabled={isLocked}
              aria-label={`Stage ${stageNum}: ${config.name} (${config.nameCN}) — ${status}`}
              className={`
                absolute rounded-full overflow-hidden
                w-12 h-12 sm:w-14 sm:h-14 md:w-[72px] md:h-[72px] lg:w-20 lg:h-20
                -translate-x-1/2 -translate-y-1/2
                animate-node-pop-in
                transition-transform duration-150
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
                ${isCleared ? "pixel-border-green" : ""}
                ${isAvailable ? "pixel-border-primary animate-pixel-pulse hover:scale-110" : ""}
                ${isLocked ? "grayscale opacity-50 cursor-not-allowed" : "cursor-pointer hover:scale-105"}
                ${!isCleared && !isAvailable && !isLocked ? "pixel-border" : ""}
              `}
              style={{
                left: `${(pos.x / 1000) * 100}%`,
                top: `${(pos.y / 500) * 100}%`,
                animationDelay: `${stageNum * 0.1}s`,
              }}
            >
              {isLocked ? (
                <div className="w-full h-full flex items-center justify-center bg-muted/70">
                  <Lock className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground" />
                </div>
              ) : (
                <div className="relative w-full h-full">
                  <Image
                    src={config.bossImage}
                    alt={config.bossName}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {isCleared && (
                    <div className="absolute -top-0.5 -right-0.5 bg-green-700 rounded-full p-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}

        {/* Stage labels below nodes */}
        {STAGE_NUMBERS.map((stageNum) => {
          const pos = NODE_POSITIONS[stageNum];
          const config = STAGE_CONFIGS[stageNum];
          return (
            <span
              key={`label-${stageNum}`}
              className="absolute -translate-x-1/2 font-chinese font-bold text-lg sm:text-xl md:text-2xl text-foreground/75 pointer-events-none whitespace-nowrap mt-7 sm:mt-8 md:mt-10 lg:mt-11"
              style={{
                left: `${(pos.x / 1000) * 100}%`,
                top: `${(pos.y / 500) * 100}%`,
              }}
            >
              {config.nameCN}
            </span>
          );
        })}
      </div>

      {/* ─── Info panel ─── */}
      <div className="shrink-0 px-5 py-4 md:py-5 chinese-frame bg-background/90 backdrop-blur-sm max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-4 max-w-xl mx-auto">
          {/* Boss thumbnail */}
          <div className="w-16 h-16 md:w-20 md:h-20 relative shrink-0 chinese-frame overflow-hidden bg-black/20 rounded-full">
            {infoStatus === "locked" ? (
              <div className="w-full h-full flex items-center justify-center bg-muted/50">
                <Lock className="w-6 h-6 text-muted-foreground" />
              </div>
            ) : (
              <Image
                src={infoConfig.bossImage}
                alt={infoConfig.bossName}
                fill
                className="object-cover"
                unoptimized
              />
            )}
          </div>

          {/* Stage info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-pixel text-xs md:text-sm text-primary/70">
                Stage {infoStage}
              </span>
              <span className="font-pixel text-xs md:text-sm text-foreground truncate">
                {infoConfig.name}
              </span>
              {infoStatus === "cleared" && (
                <span className="inline-flex items-center gap-1 bg-green-700/40 text-green-300 font-pixel text-[10px] md:text-xs px-2.5 py-1 rounded-sm pixel-glow-green">
                  <Check className="w-3 h-3" />
                  CLEARED
                </span>
              )}
            </div>
            <p className="font-chinese font-bold text-sm md:text-base text-muted-foreground truncate">
              {infoConfig.nameCN} — {infoConfig.subtitle}
            </p>
            {infoStatus !== "locked" && (
              <p className="font-retro text-xs md:text-sm text-amber-600/80 mt-0.5">
                Boss: {infoConfig.bossName} ({infoConfig.bossNameCN})
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
