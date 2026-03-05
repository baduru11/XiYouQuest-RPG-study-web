"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { BattleState, StageNumber } from "@/lib/quest/types";
import { STAGE_CONFIGS } from "@/lib/quest/stage-config";
import {
  processMCQAnswer,
  processRecordingComplete,
  advanceBattle,
} from "@/lib/quest/battle-logic";
import { BattleArena } from "@/components/quest/battle-arena";
import { BossAttack } from "@/components/quest/boss-attack";
import { PlayerAttack } from "@/components/quest/player-attack";
import { useAttackAnimation } from "@/components/quest/attack-animation";
import { useBossAttackAnimation } from "@/components/quest/boss-attack-animation";
import { QUEST_CHARACTERS } from "@/lib/quest/stage-config";
import { Swords, DoorOpen } from "lucide-react";
import { useBGM } from "@/components/shared/bgm-provider";

/** Thematic boss attack narrations per stage */
const BOSS_ATTACK_NARRATIONS: Record<StageNumber, string[]> = {
  1: [
    "The Demon King of Turmoil unleashes a wave of corrupted syllables! Answer correctly to defend!",
    "Dark energy swirls around the Demon King — broken tones fly toward you! Prove your knowledge to block!",
    "The Demon King roars, distorting the very air with chaotic sounds! Only the right answer can shield you!",
  ],
  2: [
    "The Water Spirit summons a violent tide of twisted pitches! Answer to hold your ground!",
    "Waves crash around you as the Water Spirit bends your voice! Choose wisely to resist!",
    "The river surges at the Spirit's command, carrying distorted echoes! Defend with your knowledge!",
  ],
  3: [
    "The Lady of Bleached Bones casts an illusion of misleading voices! See through her tricks!",
    "Bone fragments swirl as she disguises her attack with false words! Find the truth to defend!",
    "The desert shimmers with deception — the Lady strikes with confusion! Only clarity can save you!",
  ],
  4: [
    "The Moonfang Wolf lunges from the shadows with a piercing howl! Answer to stand your ground!",
    "Moonlight reveals the Wolf Demon's attack — silver claws slash toward you! Defend with knowledge!",
    "The Wolf's eyes glow as it strikes with uncanny precision! Prove yourself to block the blow!",
  ],
  5: [
    "The Bull Demon King charges with ground-shaking force! Answer correctly to brace against impact!",
    "Corrupted flames erupt from the Bull Demon's breath! Only the right answer can hold him back!",
    "The earth cracks under the Bull Demon's hooves as he attacks! Defend yourself with wisdom!",
  ],
  6: [
    "The Heavenly Guardian descends with divine judgment! Prove your worthiness to withstand the trial!",
    "A beam of celestial light targets you — the Guardian tests your resolve! Answer to endure!",
    "The heavens rumble as the Guardian unleashes a trial of language! Show your mastery to defend!",
  ],
  7: [
    "Your twisted reflection mirrors your attack with dark energy! Answer to resist your own shadow!",
    "The Twisted Wukong strikes with a corrupted version of your own technique! Defend with truth!",
    "Darkness coils around your shadow self as it attacks! Only genuine knowledge can protect you!",
  ],
};

function getBossNarration(stageNum: StageNumber) {
  const narrations = BOSS_ATTACK_NARRATIONS[stageNum];
  return narrations[Math.floor(Math.random() * narrations.length)];
}

interface BattleScreenProps {
  stage: StageNumber;
  initialState: BattleState;
  unlockedCharacters: string[];
  onVictory: (finalState: BattleState) => void;
  onDefeat: (finalState: BattleState) => void;
  onFlee: () => void;
}

export function BattleScreen({
  stage,
  initialState,
  unlockedCharacters,
  onVictory,
  onDefeat,
  onFlee,
}: BattleScreenProps) {
  const [battleState, setBattleState] = useState<BattleState>(initialState);
  const battleStateRef = useRef(battleState);
  battleStateRef.current = battleState;

  // Duck BGM during active play phases (recording + MCQ)
  const { setLearningActive } = useBGM();
  useEffect(() => {
    const active = battleState.phase === "player_attack" || battleState.phase === "boss_attack";
    setLearningActive(active);
    return () => setLearningActive(false);
  }, [battleState.phase, setLearningActive]);

  // Visual effect state
  const [isFlinching, setIsFlinching] = useState(false);
  const [isBossRecoiling, setIsBossRecoiling] = useState(false);
  const [showRedFlash, setShowRedFlash] = useState(false);
  const [showGreenFlash, setShowGreenFlash] = useState(false);
  const [shatteringHeartIndex, setShatteringHeartIndex] = useState<number | null>(null);
  const [showTurnBanner, setShowTurnBanner] = useState(true);
  const [turnBannerPhase, setTurnBannerPhase] = useState<"boss_attack" | "player_attack">(
    "player_attack"
  );

  // Wukong defend/got-hit state
  const [isDefending, setIsDefending] = useState(false);
  const [isGotHit, setIsGotHit] = useState(false);

  // MCQ visibility gate: hidden during boss attack + result animation
  const [showMCQAfterBossAnim, setShowMCQAfterBossAnim] = useState(true);

  // Pending MCQ result — stored while boss attack animation plays
  const pendingMCQResultRef = useRef<{ isCorrect: boolean; newState: BattleState } | null>(null);
  const checkOutcomeRef = useRef<(s: BattleState) => void>(() => {});

  // MCQ effect overlays
  const [mcqDamageText, setMcqDamageText] = useState<string | null>(null);
  const [mcqDamageType, setMcqDamageType] = useState<"damage" | "block" | "miss">("damage");
  const [showMcqDamage, setShowMcqDamage] = useState(false);

  // Enemy taunt before MCQ
  const [enemyTaunt, setEnemyTaunt] = useState<string | null>(null);

  // Pending state for after attack animation
  const pendingStateRef = useRef<BattleState | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashTurnBanner = useCallback((phase: "boss_attack" | "player_attack") => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setTurnBannerPhase(phase);
    setShowTurnBanner(true);
    bannerTimerRef.current = setTimeout(() => setShowTurnBanner(false), 1200);
  }, []);

  // Hide initial turn banner after 1.2s
  const initialBannerRef = useRef(true);
  useEffect(() => {
    if (initialBannerRef.current) {
      initialBannerRef.current = false;
      bannerTimerRef.current = setTimeout(() => setShowTurnBanner(false), 1200);
      return () => {
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      };
    }
  }, []);

  const config = STAGE_CONFIGS[stage];
  const wukong = QUEST_CHARACTERS["Son Wukong"];
  const bossAttackFrames = useMemo(() => config.bossAttackFrames ?? [], [config.bossAttackFrames]);
  const bossHitFrame = config.bossHitFrame ?? null;

  // Boss attack animation hook — after each MCQ answer, boss attacks then defend/got-hit plays
  const handleBossAttackAnimComplete = useCallback(() => {
    const pending = pendingMCQResultRef.current;
    if (!pending) {
      setShowMCQAfterBossAnim(true);
      return;
    }

    pendingMCQResultRef.current = null;
    const { isCorrect, newState } = pending;

    if (!isCorrect) {
      setShowRedFlash(true);
      setIsFlinching(true);
      setIsGotHit(true);
      setShatteringHeartIndex(newState.playerHP);
      setTimeout(() => {
        setShowRedFlash(false);
        setIsFlinching(false);
        setIsGotHit(false);
        setShatteringHeartIndex(null);
      }, 250);
    } else {
      setShowGreenFlash(true);
      setIsBossRecoiling(true);
      setIsDefending(true);
      setMcqDamageText("BLOCKED!");
      setMcqDamageType("block");
      setShowMcqDamage(true);
      setTimeout(() => {
        setShowGreenFlash(false);
        setIsBossRecoiling(false);
        setIsDefending(false);
      }, 250);
    }

    setBattleState(newState);
    setTimeout(() => {
      setShowMCQAfterBossAnim(true);
      checkOutcomeRef.current(newState);
    }, 300);
  }, []);

  const bossFrameDuration = config.bossProjectile ? 200 : 120;
  const { triggerBossAttack, bossAttackFrame } =
    useBossAttackAnimation(bossAttackFrames, handleBossAttackAnimComplete, bossFrameDuration);

  // Preload animation frames
  useEffect(() => {
    const frames = [
      ...bossAttackFrames,
      bossHitFrame,
      config.bossProjectile,
      wukong.defendFrame,
      wukong.gotHitFrame,
    ].filter(Boolean) as string[];
    frames.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [bossAttackFrames, bossHitFrame, wukong.defendFrame, wukong.gotHitFrame]);

  const sectionLabel = `Section ${battleState.currentRecordingIndex + 1}/${battleState.totalRecordings}`;

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

      // Show turn banner + enemy taunt on phase change
      if (advancedState.phase !== newState.phase) {
        if (advancedState.phase === "boss_attack") {
          flashTurnBanner("boss_attack");
          setEnemyTaunt(getBossNarration(stage));
          // MCQ shows immediately — boss attacks after each answer
        } else if (advancedState.phase === "player_menu") {
          flashTurnBanner("player_attack");
          setEnemyTaunt(null);
        }
      }

      setBattleState(advancedState);
    },
    [onVictory, onDefeat, flashTurnBanner, stage]
  );
  checkOutcomeRef.current = checkOutcomeAndAdvance;

  // Attack animation hook
  const handleAttackAnimComplete = useCallback(
    () => {
      const stateToAdvance = pendingStateRef.current;
      pendingStateRef.current = null;
      if (stateToAdvance) {
        checkOutcomeAndAdvance(stateToAdvance);
      }
    },
    [checkOutcomeAndAdvance]
  );

  const {
    triggerAttack,
    attackState,
    dashOffset,
    currentFrame,
    damageText: attackDamageText,
    damageType: attackDamageType,
    showDamage: showAttackDamage,
    isBossHit,
  } = useAttackAnimation(handleAttackAnimComplete);

  const handleAttackChoice = useCallback(() => {
    setBattleState((prev) => ({ ...prev, phase: "player_attack" }));
  }, []);

  const handleMCQAnswer = useCallback(
    (isCorrect: boolean) => {
      const newState = processMCQAnswer(battleStateRef.current, isCorrect);

      // Hide MCQ, store result, trigger boss attack animation
      setShowMCQAfterBossAnim(false);
      pendingMCQResultRef.current = { isCorrect, newState };
      triggerBossAttack();
    },
    [triggerBossAttack]
  );

  const handleRecordingComplete = useCallback(
    (score: number) => {
      const current = battleStateRef.current;
      const newState = processRecordingComplete(current, score);
      pendingStateRef.current = newState;
      setBattleState({ ...current, phase: "animating" });
      triggerAttack(score);
    },
    [triggerAttack]
  );

  const effectiveDamageText = showAttackDamage ? attackDamageText : showMcqDamage ? mcqDamageText : null;
  const effectiveShowDamage = showAttackDamage || showMcqDamage;
  const effectiveDamageType = showAttackDamage ? attackDamageType : mcqDamageType;

  const handleDamageComplete = useCallback(() => {
    setShowMcqDamage(false);
    setMcqDamageText(null);
  }, []);

  const currentMCQ = useMemo(() => {
    if (battleState.phase !== "boss_attack") return null;
    const mcqIndex = battleState.mcqBatchIndices[battleState.currentMCQInBatch];
    if (mcqIndex === undefined) return null;
    return battleState.mcqQuestions[mcqIndex] ?? null;
  }, [battleState]);

  const currentRecordingGroup = useMemo(() => {
    if (battleState.phase !== "player_attack") return null;
    return battleState.recordingGroups[battleState.currentRecordingIndex] ?? null;
  }, [battleState]);

  const mcqTotalInBatch = battleState.mcqBatchIndices.length;

  const isAnimating = attackState !== "idle";

  // Determine dialogue box speaker and accent
  const isPlayerTurn = battleState.phase === "player_menu" || battleState.phase === "player_attack";
  const isBossTurn = battleState.phase === "boss_attack";
  const speakerName = isPlayerTurn ? "孙悟空 Son Wukong" : isBossTurn ? `${config.bossNameCN} ${config.bossName}` : "";
  const speakerColor = isPlayerTurn ? "text-amber-700" : "text-red-700";
  const scrollAccent = isPlayerTurn
    ? "border-amber-800/60 shadow-[0_0_15px_rgba(180,83,9,0.2)]"
    : isBossTurn
      ? "border-red-800/60 shadow-[0_0_15px_rgba(185,28,28,0.2)]"
      : "border-amber-900/40";

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Arena — full screen */}
      <BattleArena
        backgroundImage={config.backgroundImage}
        unlockedCharacters={unlockedCharacters}
        playerHP={battleState.playerHP}
        playerMaxHP={battleState.playerMaxHP}
        isFlinching={isFlinching}
        attackFrame={currentFrame}
        dashOffset={dashOffset}
        shatteringHeartIndex={shatteringHeartIndex}
        bossImage={config.bossImage}
        bossAttackFrame={bossAttackFrame}
        bossHitFrame={bossHitFrame}
        bossName={config.bossName}
        bossNameCN={config.bossNameCN}
        bossHP={battleState.bossHP}
        bossMaxHP={config.bossMaxHP}
        totalRecordings={battleState.totalRecordings}
        roundInfo={sectionLabel}
        isBossHit={isBossHit}
        isBossRecoiling={isBossRecoiling}
        defendFrame={wukong.defendFrame}
        gotHitFrame={wukong.gotHitFrame}
        isDefending={isDefending}
        isGotHit={isGotHit}
        showTurnBanner={showTurnBanner}
        turnBannerPhase={turnBannerPhase}
        showDamage={effectiveShowDamage}
        damageText={effectiveDamageText}
        damageType={effectiveDamageType}
        onDamageComplete={handleDamageComplete}
        showRedFlash={showRedFlash}
        showGreenFlash={showGreenFlash}
        bossProjectile={config.bossProjectile}
      />

      {/* RPG Dialogue Scroll — overlaid on arena, uses dvh to avoid mobile browser chrome issues */}
      {!isAnimating && battleState.phase !== "animating" && (
        <div className="absolute inset-0 z-30 flex flex-col p-2 sm:p-3 md:p-5"
          style={{ maxHeight: "100dvh" }}>
          <div className="w-full max-w-2xl mx-auto relative flex flex-col min-h-0 max-h-full">
            {/* Scroll body */}
            <div
              className={`relative border-2 ${scrollAccent}
                bg-linear-to-b from-[#f5e6c8] via-[#f0dbb5] to-[#e8d0a0]
                rounded-sm overflow-hidden flex flex-col min-h-0 max-h-full`}
            >
              {/* Decorative top edge */}
              <div className="h-1.5 sm:h-2 bg-linear-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30 shrink-0" />

              {/* Speaker name banner */}
              {speakerName && (
                <div className="px-3 pt-2 pb-1 sm:px-6 sm:pt-3 flex items-center gap-2 shrink-0">
                  <div className={`w-1.5 h-4 sm:h-5 rounded-sm ${isPlayerTurn ? "bg-amber-600" : "bg-red-700"}`} />
                  <span className={`font-pixel text-[8px] sm:text-[10px] md:text-xs font-bold ${speakerColor} tracking-wide truncate`}>
                    {speakerName}
                  </span>
                  <div className="flex-1 h-px bg-amber-800/20" />
                  <span className="font-retro text-[10px] text-amber-800/40 shrink-0">
                    {sectionLabel}
                  </span>
                </div>
              )}

              {/* Scroll content — flex-1 + overflow so it shrinks to fit without pushing buttons off-screen */}
              <div className="px-3 py-2 sm:px-6 sm:py-3 space-y-3 sm:space-y-4 flex-1 overflow-y-auto min-h-0">
                {/* Player Menu */}
                {battleState.phase === "player_menu" && (
                  <div className="text-center space-y-4">
                    <p className="font-pixel text-xs sm:text-sm text-amber-900/80">
                      What will you do?
                    </p>
                    <div className="flex justify-center gap-3 sm:gap-4">
                      <button
                        onClick={handleAttackChoice}
                        className="flex items-center gap-1.5 sm:gap-2 px-4 py-2.5 sm:px-6 sm:py-3 border-2 border-amber-700/50 bg-amber-100/60
                          hover:bg-amber-200/80 hover:border-amber-700 transition-all cursor-pointer rounded-sm min-h-[44px]"
                      >
                        <Swords className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700" />
                        <span className="font-pixel text-[10px] sm:text-xs font-bold text-amber-900">Attack</span>
                      </button>
                      <button
                        onClick={onFlee}
                        className="flex items-center gap-1.5 sm:gap-2 px-4 py-2.5 sm:px-6 sm:py-3 border-2 border-stone-400/50 bg-stone-100/60
                          hover:bg-red-100/60 hover:border-red-400 transition-all cursor-pointer rounded-sm min-h-[44px]"
                      >
                        <DoorOpen className="w-4 h-4 sm:w-5 sm:h-5 text-stone-500" />
                        <span className="font-pixel text-[10px] sm:text-xs text-stone-600">Flee</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Player Attack — recording */}
                {battleState.phase === "player_attack" && currentRecordingGroup && (
                  <PlayerAttack
                    key={`rec-${battleState.currentRecordingIndex}-${battleState.isRetry ? "retry" : "first"}`}
                    recordingGroup={currentRecordingGroup}
                    isRetry={battleState.isRetry}
                    onComplete={handleRecordingComplete}
                  />
                )}

                {/* Boss Attack — enemy taunt + MCQ */}
                {battleState.phase === "boss_attack" && currentMCQ && showMCQAfterBossAnim && (
                  <div className="space-y-3">
                    {enemyTaunt && (
                      <p className="font-retro text-xs sm:text-sm text-red-900/70 text-center leading-relaxed">
                        {enemyTaunt}
                      </p>
                    )}
                    <BossAttack
                      key={`mcq-${battleState.mcqCursor}-${battleState.currentMCQInBatch}`}
                      mcq={currentMCQ}
                      timerSeconds={config.mcqTimerSeconds}
                      mcqNumber={battleState.currentMCQInBatch + 1}
                      mcqTotal={mcqTotalInBatch}
                      onAnswer={handleMCQAnswer}
                    />
                  </div>
                )}
              </div>

              {/* Decorative bottom edge */}
              <div className="h-1.5 sm:h-2 bg-linear-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30 shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* Animating state — no dialogue box */}
      {isAnimating && (
        <div className="absolute bottom-8 left-0 right-0 z-30 flex justify-center">
          <p className="font-pixel text-sm text-amber-400 animate-pulse drop-shadow-lg">
            Attacking...
          </p>
        </div>
      )}
    </div>
  );
}
