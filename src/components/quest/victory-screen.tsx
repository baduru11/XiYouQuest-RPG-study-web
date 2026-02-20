"use client";

import { useState, useCallback, useRef } from "react";
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
  questProgress: QuestProgress[];
  onReturnToStages: () => void;
  onProgressUpdate: (newProgress: QuestProgress[], newCharacters: string[]) => void;
  onAchievements?: (achievements: { key: string; name: string; emoji: string; tier: string }[]) => void;
}

export function VictoryScreen({
  stage,
  battleState,
  questProgress,
  onReturnToStages,
  onProgressUpdate,
  onAchievements,
}: VictoryScreenProps) {
  const [saving, setSaving] = useState(false);
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

  const doOptimisticUpdate = useCallback(() => {
    // Build a fake progress entry so the next stage unlocks even if API failed
    const optimistic: QuestProgress = {
      id: `optimistic-${stage}`,
      user_id: "",
      stage,
      is_cleared: true,
      attempts: 1,
      best_score: xp,
      cleared_at: new Date().toISOString(),
    };
    const merged = [...questProgress];
    const idx = merged.findIndex((p) => p.stage === stage);
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], is_cleared: true, best_score: Math.max(merged[idx].best_score, xp) };
    } else {
      merged.push(optimistic);
    }
    const clearedStages = merged
      .filter((p) => p.is_cleared)
      .map((p) => p.stage as StageNumber);
    onProgressUpdate(merged, getUnlockedCharacters(clearedStages));
  }, [stage, xp, questProgress, onProgressUpdate]);

  const handleContinue = useCallback(async () => {
    if (savedRef.current) {
      onReturnToStages();
      return;
    }

    setSaving(true);
    try {
      // Save progress
      const postRes = await fetch("/api/quest/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          is_cleared: true,
          score: xp,
          damage_taken: battleState.playerMaxHP - battleState.playerHP,
          remaining_hp: battleState.playerHP,
        }),
      });

      if (!postRes.ok) {
        // POST failed — continue to refresh progress anyway
      } else {
        try {
          const postData = await postRes.json();
          if (postData.newAchievements?.length > 0) {
            onAchievements?.(postData.newAchievements);
          }
        } catch {}
      }

      // Refresh progress from server
      const response = await fetch("/api/quest/progress");
      if (response.ok) {
        const data = await response.json();
        const newProgress: QuestProgress[] = data.progress ?? [];

        const clearedStages = newProgress
          .filter((p: QuestProgress) => p.is_cleared)
          .map((p: QuestProgress) => p.stage);
        const newCharacters = getUnlockedCharacters(clearedStages);
        onProgressUpdate(newProgress, newCharacters);
      } else {
        // GET failed — do optimistic update
        doOptimisticUpdate();
      }

      savedRef.current = true;
    } catch (err) {
      console.error("Quest progress save error:", err);
      // On API failure, optimistically update so the next stage unlocks
      doOptimisticUpdate();
      savedRef.current = true;
    } finally {
      setSaving(false);
      requestAnimationFrame(() => {
        onReturnToStages();
      });
    }
  }, [stage, xp, battleState.playerMaxHP, battleState.playerHP, onProgressUpdate, onReturnToStages, doOptimisticUpdate, onAchievements]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url("${config.backgroundImage}")` }}
    >

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
            className="flex flex-col items-center gap-3 p-4 pixel-border bg-amber-900/50 w-full animate-fade-in-up"
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
            <p className="font-pixel text-sm text-amber-300 text-center">
              {unlockedChar.name} has joined your party!
            </p>
            <p className="font-chinese text-base text-amber-200 text-center">
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
