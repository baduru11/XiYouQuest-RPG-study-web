"use client";

import Image from "next/image";
import type { BattleState } from "@/lib/quest/types";
import { QUEST_CHARACTERS } from "@/lib/quest/stage-config";
import { Heart } from "lucide-react";

interface BattleHUDProps {
  battleState: BattleState;
  unlockedCharacters: string[];
}

export function BattleHUD({ battleState, unlockedCharacters }: BattleHUDProps) {
  const {
    playerHP,
    stage,
    bossHP,
    phase,
    currentRound,
    rounds,
  } = battleState;

  const bossHPPercent = Math.max(0, (bossHP / stage.bossMaxHP) * 100);
  const hpBarColor =
    bossHPPercent > 50
      ? "bg-green-500"
      : bossHPPercent > 25
        ? "bg-yellow-500"
        : "bg-red-500";

  const isPlayerTurn = phase === "player_attack";

  return (
    <div className="w-full pixel-border bg-background/90 backdrop-blur-sm p-3 space-y-2">
      {/* Top row: Player info + Turn indicator + Boss info */}
      <div className="flex items-start justify-between gap-2">
        {/* Player section */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Party portraits */}
          <div className="flex -space-x-1 shrink-0">
            {unlockedCharacters.slice(0, 4).map((name) => {
              const char = QUEST_CHARACTERS[name];
              if (!char) return null;
              return (
                <div
                  key={name}
                  className="w-8 h-8 pixel-border overflow-hidden relative bg-background"
                >
                  <Image
                    src={char.image}
                    alt={char.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              );
            })}
          </div>

          {/* HP hearts */}
          <div className="flex flex-wrap gap-0.5">
            {Array.from({ length: stage.playerMaxHP }).map((_, i) => (
              <Heart
                key={i}
                className={`w-4 h-4 ${
                  i < playerHP
                    ? "text-red-500 fill-red-500"
                    : "text-gray-400 fill-gray-300"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Turn indicator */}
        <div className="shrink-0 text-center px-2">
          <span
            className={`font-pixel text-[10px] px-3 py-1 inline-block ${
              isPlayerTurn
                ? "text-green-400 bg-green-900/40 pixel-glow-green"
                : "text-red-400 bg-red-900/40 pixel-glow"
            }`}
          >
            {isPlayerTurn ? "YOUR TURN" : "ENEMY TURN"}
          </span>
        </div>

        {/* Boss section */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <div className="text-right min-w-0">
            <p className="font-pixel text-[8px] text-foreground truncate">
              {stage.bossName}
            </p>
            <p className="font-chinese text-xs text-muted-foreground truncate">
              {stage.bossNameCN}
            </p>
          </div>
          <div className="w-10 h-10 pixel-border overflow-hidden relative shrink-0 bg-black/20">
            <Image
              src={stage.bossImage}
              alt={stage.bossName}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        </div>
      </div>

      {/* Boss HP bar */}
      <div className="space-y-0.5">
        <div className="flex justify-between items-center">
          <span className="font-retro text-xs text-muted-foreground">
            Boss HP
          </span>
          <span className="font-retro text-xs text-muted-foreground">
            Round {currentRound + 1}/{rounds.length}
          </span>
        </div>
        <div className="w-full h-3 bg-muted border-2 border-border overflow-hidden">
          <div
            className={`h-full ${hpBarColor} transition-all duration-500`}
            style={{ width: `${bossHPPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
