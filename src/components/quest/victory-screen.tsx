"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { BattleState, StageNumber, QuestProgress } from "@/lib/quest/types";
import { STAGE_STORIES } from "@/lib/quest/story-text";
import { STAGE_CONFIGS, QUEST_CHARACTERS } from "@/lib/quest/stage-config";
import { calculateQuestXP, getUnlockedCharacters } from "@/lib/quest/battle-logic";
import { Loader2, Star, Swords, Mic } from "lucide-react";

interface VictoryScreenProps {
  stage: StageNumber;
  battleState: BattleState;
  onReturnToStages: () => void;
  onProgressUpdate: (newProgress: QuestProgress[], newCharacters: string[]) => void;
}

export function VictoryScreen({
  stage,
  battleState,
  onReturnToStages,
  onProgressUpdate,
}: VictoryScreenProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(false);

  const config = STAGE_CONFIGS[stage];
  const story = STAGE_STORIES[stage];
  const xp = calculateQuestXP(battleState);
  const unlockedCharName = config.unlocksCharacter;
  const unlockedChar = unlockedCharName ? QUEST_CHARACTERS[unlockedCharName] : null;

  const mcqAccuracy = battleState.results.mcqTotal > 0
    ? `${battleState.results.mcqCorrect}/${battleState.results.mcqTotal}`
    : "N/A";

  const avgPronScore = battleState.results.pronunciationScores.length > 0
    ? Math.round(battleState.results.avgPronunciationScore)
    : 0;

  const handleContinue = useCallback(async () => {
    if (savedRef.current) {
      onReturnToStages();
      return;
    }

    setSaving(true);
    try {
      // Save progress
      await fetch("/api/quest/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          is_cleared: true,
          score: xp,
        }),
      });

      // Refresh progress
      const response = await fetch("/api/quest/progress");
      const data = await response.json();
      const newProgress: QuestProgress[] = data.progress ?? [];

      // Recalculate unlocked characters
      const clearedStages = newProgress
        .filter((p: QuestProgress) => p.is_cleared)
        .map((p: QuestProgress) => p.stage);
      const newCharacters = getUnlockedCharacters(clearedStages);

      onProgressUpdate(newProgress, newCharacters);
      savedRef.current = true;
      setSaved(true);
    } catch {
      // Even on error, let them continue
      savedRef.current = true;
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [stage, xp, onProgressUpdate, onReturnToStages]);

  // Auto-continue after save completes
  useEffect(() => {
    if (saved) {
      onReturnToStages();
    }
  }, [saved, onReturnToStages]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Background */}
      <Image
        src={config.backgroundImage}
        alt={`${config.name} victory`}
        fill
        className="object-cover"
        unoptimized
      />
      <div className="absolute inset-0 bg-black/70" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5 max-w-lg mx-auto px-6 max-h-[90vh] overflow-y-auto py-8">
        {/* Victory title */}
        <div className="text-center animate-fade-in-up">
          <h1 className="font-pixel text-2xl md:text-3xl pixel-glow-gold">
            VICTORY!
          </h1>
          <p className="font-chinese text-2xl text-amber-300 mt-1">
            胜利!
          </p>
        </div>

        {/* Outro story */}
        <div className="space-y-3 w-full animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          {story.outro.map((text, i) => (
            <p
              key={i}
              className="font-retro text-base md:text-lg text-amber-100/80 leading-relaxed text-center"
            >
              {text}
            </p>
          ))}
        </div>

        {/* Character unlock */}
        {unlockedChar && (
          <div
            className="flex flex-col items-center gap-3 p-4 pixel-border bg-amber-900/30 backdrop-blur-sm w-full animate-fade-in-up"
            style={{ animationDelay: "0.4s" }}
          >
            <div className="w-20 h-20 pixel-border overflow-hidden relative bg-background/50">
              <Image
                src={unlockedChar.image}
                alt={unlockedChar.name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <p className="font-pixel text-xs text-amber-300 pixel-glow-gold text-center">
              {unlockedChar.name} has joined your party!
            </p>
            <p className="font-chinese text-sm text-amber-200/70">
              {unlockedChar.nameCN}加入了队伍!
            </p>
          </div>
        )}

        {/* Stats */}
        <div
          className="grid grid-cols-3 gap-3 w-full animate-fade-in-up"
          style={{ animationDelay: "0.5s" }}
        >
          <div className="flex flex-col items-center p-3 pixel-border bg-background/80">
            <Swords className="w-5 h-5 text-amber-500 mb-1" />
            <span className="font-pixel text-[10px] text-muted-foreground">
              MCQ
            </span>
            <span className="font-retro text-lg text-foreground">
              {mcqAccuracy}
            </span>
          </div>
          <div className="flex flex-col items-center p-3 pixel-border bg-background/80">
            <Mic className="w-5 h-5 text-amber-500 mb-1" />
            <span className="font-pixel text-[10px] text-muted-foreground">
              Pron Avg
            </span>
            <span className="font-retro text-lg text-foreground">
              {avgPronScore}
            </span>
          </div>
          <div className="flex flex-col items-center p-3 pixel-border bg-background/80">
            <Star className="w-5 h-5 text-amber-500 mb-1" />
            <span className="font-pixel text-[10px] text-muted-foreground">
              XP
            </span>
            <span className="font-retro text-lg text-amber-500 font-bold">
              +{xp}
            </span>
          </div>
        </div>

        {/* Continue button */}
        <div className="animate-fade-in-up" style={{ animationDelay: "0.6s" }}>
          <Button
            onClick={handleContinue}
            disabled={saving}
            size="lg"
            className="font-pixel text-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Continue 继续"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
