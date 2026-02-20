"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
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
import { useAchievementToast } from "@/components/shared/achievement-toast";
import type { UnlockedAchievement } from "@/lib/achievements/types";

interface MainQuestClientProps {
  questProgress: QuestProgress[];
  unlockedCharacters: string[];
}

const INTRO_SEEN_KEY = "quest_intro_seen";
const emptySubscribe = () => () => {};

export function MainQuestClient({
  questProgress: initialProgress,
  unlockedCharacters: initialCharacters,
}: MainQuestClientProps) {
  const { showAchievementToasts } = useAchievementToast();

  // Read localStorage without useEffect to avoid React 19 set-state-in-effect lint error
  const introSeen = useSyncExternalStore(
    emptySubscribe,
    () => { try { return localStorage.getItem(INTRO_SEEN_KEY) === "1"; } catch { return false; } },
    () => false
  );

  const [screen, setScreen] = useState<QuestScreen>("intro");
  const [forceIntro, setForceIntro] = useState(false);
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
    try { localStorage.setItem(INTRO_SEEN_KEY, "1"); } catch { /* ignore */ }
    setForceIntro(false);
    setScreen("stage_select");
  }, []);

  const handleWatchPrologue = useCallback(() => {
    try { localStorage.removeItem(INTRO_SEEN_KEY); } catch { /* ignore */ }
    setForceIntro(true);
    setScreen("intro");
  }, []);

  const handleStageSelect = useCallback((stage: StageNumber) => {
    setSelectedStage(stage);
    setScreen("story");
  }, []);

  const handleStoryComplete = useCallback(() => {
    if (!selectedStage) return;
    const isRetry = getAttempts(selectedStage) > 0;
    const state = createBattleState(selectedStage, isRetry, unlockedCharacters);
    setBattleState(state);
    setScreen("battle");
  }, [selectedStage, getAttempts, unlockedCharacters]);

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

  // Effective screen: skip intro if already seen
  const effectiveScreen = screen === "intro" && introSeen && !forceIntro ? "stage_select" : screen;

  switch (effectiveScreen) {
    case "intro":
      return <IntroScreen onComplete={handleIntroComplete} />;
    case "stage_select":
      return (
        <StageSelect
          questProgress={questProgress}
          unlockedCharacters={unlockedCharacters}
          onStageSelect={handleStageSelect}
          onWatchPrologue={handleWatchPrologue}
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
          onFlee={handleReturnToStages}
        />
      ) : null;
    case "victory":
      return battleState && selectedStage ? (
        <VictoryScreen
          stage={selectedStage}
          battleState={battleState}
          questProgress={questProgress}
          onReturnToStages={handleReturnToStages}
          onProgressUpdate={handleProgressUpdate}
          onAchievements={(achs) => showAchievementToasts(achs as UnlockedAchievement[])}
        />
      ) : null;
    case "defeat":
      return battleState && selectedStage ? (
        <DefeatScreen
          stage={selectedStage}
          battleState={battleState}
          onRetry={handleRetry}
          onReturnToStages={handleReturnToStages}
          onAchievements={(achs) => showAchievementToasts(achs as UnlockedAchievement[])}
        />
      ) : null;
    default:
      return null;
  }
}
