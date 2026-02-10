"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getUserLevel } from "@/lib/gamification/xp";

export function XPBar({ totalXP }: { totalXP: number }) {
  const { level, name, xpToNext } = getUserLevel(totalXP);
  const currentLevelXP = totalXP;
  const nextLevelXP = xpToNext ? totalXP + xpToNext : totalXP;
  const progress = xpToNext ? ((currentLevelXP) / nextLevelXP) * 100 : 100;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 cursor-default">
          <span className="font-pixel text-sm text-primary pixel-glow">
            Lv.{level}
          </span>
          <div className="relative h-5 w-28 border-2 border-border bg-muted overflow-hidden">
            <div
              className="h-full bg-pixel-green transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center font-pixel text-[10px] text-foreground">
              {totalXP} XP
            </span>
          </div>
          <span className="hidden sm:inline font-pixel text-xs text-muted-foreground">
            {name}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="pixel-border bg-card">
        <p className="font-pixel text-xs">Level {level}: {name}</p>
        {xpToNext ? (
          <p className="text-xs text-muted-foreground">{xpToNext} XP to next level</p>
        ) : (
          <p className="text-xs text-muted-foreground">Max level reached!</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
