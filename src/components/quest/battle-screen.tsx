"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import type { BattleState, StageNumber } from "@/lib/quest/types";
import { STAGE_CONFIGS } from "@/lib/quest/stage-config";
import { STAGE_QUESTIONS } from "@/lib/quest/stage-questions";
import {
  processMCQAnswer,
  processRecordingComplete,
  advanceBattle,
} from "@/lib/quest/battle-logic";
import { BattleHUD } from "@/components/quest/battle-hud";
import { BossAttack } from "@/components/quest/boss-attack";
import { PlayerAttack } from "@/components/quest/player-attack";

interface BattleScreenProps {
  stage: StageNumber;
  initialState: BattleState;
  unlockedCharacters: string[];
  onVictory: (finalState: BattleState) => void;
  onDefeat: (finalState: BattleState) => void;
}

export function BattleScreen({
  stage,
  initialState,
  unlockedCharacters,
  onVictory,
  onDefeat,
}: BattleScreenProps) {
  const [battleState, setBattleState] = useState<BattleState>(initialState);
  const [shaking, setShaking] = useState(false);
  const [flashing, setFlashing] = useState(false);

  const config = STAGE_CONFIGS[stage];
  const questions = useMemo(() => STAGE_QUESTIONS[stage], [stage]);

  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  }, []);

  const triggerFlash = useCallback(() => {
    setFlashing(true);
    setTimeout(() => setFlashing(false), 300);
  }, []);

  const checkOutcomeAndAdvance = useCallback(
    (newState: BattleState) => {
      const { state: advancedState, outcome } = advanceBattle(newState);

      if (outcome === "victory") {
        onVictory(advancedState);
        return;
      }
      if (outcome === "defeat") {
        onDefeat(advancedState);
        return;
      }

      setBattleState(advancedState);
    },
    [onVictory, onDefeat]
  );

  const handleMCQAnswer = useCallback(
    (isCorrect: boolean) => {
      const newState = processMCQAnswer(battleState, isCorrect);

      if (!isCorrect) {
        triggerShake();
      } else {
        triggerFlash();
      }

      // Short delay then advance
      setBattleState(newState);
      setTimeout(() => {
        checkOutcomeAndAdvance(newState);
      }, 300);
    },
    [battleState, checkOutcomeAndAdvance, triggerShake, triggerFlash]
  );

  const handleRecordingComplete = useCallback(
    (score: number) => {
      const newState = processRecordingComplete(battleState, score);

      // Boss takes damage visual
      triggerFlash();
      setBattleState(newState);

      setTimeout(() => {
        checkOutcomeAndAdvance(newState);
      }, 500);
    },
    [battleState, checkOutcomeAndAdvance, triggerFlash]
  );

  // Get current MCQ for boss attack phase
  const currentMCQ = useMemo(() => {
    if (battleState.phase !== "boss_attack") return null;
    const round = battleState.rounds[battleState.currentRound];
    if (!round) return null;
    const mcqIndex = round.mcqIndices[battleState.currentMCQInRound];
    if (mcqIndex === undefined) return null;
    return questions.mcqQuestions[mcqIndex];
  }, [battleState, questions]);

  // Get current recording group for player attack phase
  const currentRecordingGroup = useMemo(() => {
    if (battleState.phase !== "player_attack") return null;
    const round = battleState.rounds[battleState.currentRound];
    if (!round || round.recordingGroupIndex < 0) return null;
    return questions.recordingGroups[round.recordingGroupIndex];
  }, [battleState, questions]);

  // Total MCQs in the current round for display
  const mcqTotalInRound = useMemo(() => {
    const round = battleState.rounds[battleState.currentRound];
    return round?.mcqIndices.length ?? 0;
  }, [battleState]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col ${
        shaking ? "animate-shake" : ""
      }`}
    >
      {/* Background */}
      <Image
        src={config.backgroundImage}
        alt={`${config.name} battle`}
        fill
        className="object-cover"
        priority
        unoptimized
      />
      <div className="absolute inset-0 bg-black/50" />

      {/* Flash overlay for blocked/damage */}
      {flashing && (
        <div className="absolute inset-0 z-50 bg-amber-300/20 pointer-events-none animate-pulse" />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* HUD at top */}
        <BattleHUD
          battleState={battleState}
          unlockedCharacters={unlockedCharacters}
        />

        {/* Action area */}
        <div className="flex-1 flex items-center justify-center overflow-y-auto p-4">
          <div className="w-full max-w-2xl">
            {battleState.phase === "boss_attack" && currentMCQ && (
              <BossAttack
                key={`mcq-${battleState.currentRound}-${battleState.currentMCQInRound}`}
                mcq={currentMCQ}
                timerSeconds={config.mcqTimerSeconds}
                mcqNumber={battleState.currentMCQInRound + 1}
                mcqTotal={mcqTotalInRound}
                onAnswer={handleMCQAnswer}
              />
            )}

            {battleState.phase === "player_attack" && currentRecordingGroup && (
              <PlayerAttack
                key={`rec-${battleState.currentRound}`}
                recordingGroup={currentRecordingGroup}
                isRetry={battleState.isRetry}
                onComplete={handleRecordingComplete}
              />
            )}
          </div>
        </div>
      </div>

      {/* CSS for shake animation */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
