"use client";

import { useState, useCallback } from "react";
import type {
  QuestScreen,
  StageNumber,
  BattleState,
  QuestProgress,
} from "@/lib/quest/types";
import { createBattleState } from "@/lib/quest/battle-logic";
import { IntroScreen } from "@/components/quest/intro-screen";
import { StageSelect } from "@/components/quest/stage-select";
import { StoryScreen } from "@/components/quest/story-screen";
import { BattleScreen } from "@/components/quest/battle-screen";
import { VictoryScreen } from "@/components/quest/victory-screen";
import { DefeatScreen } from "@/components/quest/defeat-screen";

interface MainQuestClientProps {
  questProgress: QuestProgress[];
  unlockedCharacters: string[];
}

export function MainQuestClient({
  questProgress: initialProgress,
  unlockedCharacters: initialCharacters,
}: MainQuestClientProps) {
  const [screen, setScreen] = useState<QuestScreen>("intro");
  const [selectedStage, setSelectedStage] = useState<StageNumber | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [questProgress, setQuestProgress] =
    useState<QuestProgress[]>(initialProgress);
  const [unlockedCharacters, setUnlockedCharacters] =
    useState<string[]>(initialCharacters);

  const getAttempts = useCallback(
    (stage: StageNumber) => {
      const progress = questProgress.find((p) => p.stage === stage);
      return progress?.attempts ?? 0;
    },
    [questProgress]
  );

  const handleIntroComplete = useCallback(() => {
    setScreen("stage_select");
  }, []);

  const handleStageSelect = useCallback((stage: StageNumber) => {
    setSelectedStage(stage);
    setScreen("story");
  }, []);

  const handleStoryComplete = useCallback(() => {
    if (!selectedStage) return;
    const isRetry = getAttempts(selectedStage) > 0;
    const state = createBattleState(selectedStage, isRetry);
    setBattleState(state);
    setScreen("battle");
  }, [selectedStage, getAttempts]);

  const handleBattleVictory = useCallback((finalState: BattleState) => {
    setBattleState(finalState);
    setScreen("victory");
  }, []);

  const handleBattleDefeat = useCallback((finalState: BattleState) => {
    setBattleState(finalState);
    setScreen("defeat");
  }, []);

  const handleReturnToStages = useCallback(() => {
    setSelectedStage(null);
    setBattleState(null);
    setScreen("stage_select");
  }, []);

  const handleRetry = useCallback(() => {
    if (!selectedStage) return;
    setScreen("story");
  }, [selectedStage]);

  const handleProgressUpdate = useCallback(
    (newProgress: QuestProgress[], newCharacters: string[]) => {
      setQuestProgress(newProgress);
      setUnlockedCharacters(newCharacters);
    },
    []
  );

  switch (screen) {
    case "intro":
      return <IntroScreen onComplete={handleIntroComplete} />;
    case "stage_select":
      return (
        <StageSelect
          questProgress={questProgress}
          unlockedCharacters={unlockedCharacters}
          onStageSelect={handleStageSelect}
        />
      );
    case "story":
      return selectedStage ? (
        <StoryScreen
          stage={selectedStage}
          onContinue={handleStoryComplete}
          onBack={handleReturnToStages}
        />
      ) : null;
    case "battle":
      return battleState && selectedStage ? (
        <BattleScreen
          stage={selectedStage}
          initialState={battleState}
          unlockedCharacters={unlockedCharacters}
          onVictory={handleBattleVictory}
          onDefeat={handleBattleDefeat}
        />
      ) : null;
    case "victory":
      return battleState && selectedStage ? (
        <VictoryScreen
          stage={selectedStage}
          battleState={battleState}
          onReturnToStages={handleReturnToStages}
          onProgressUpdate={handleProgressUpdate}
        />
      ) : null;
    case "defeat":
      return battleState && selectedStage ? (
        <DefeatScreen
          stage={selectedStage}
          battleState={battleState}
          onRetry={handleRetry}
          onReturnToStages={handleReturnToStages}
        />
      ) : null;
    default:
      return null;
  }
}
