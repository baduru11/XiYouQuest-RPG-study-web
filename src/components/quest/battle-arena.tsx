"use client";

import { PartySprites } from "@/components/quest/party-sprites";
import { BossSprite } from "@/components/quest/boss-sprite";
import { TurnBanner } from "@/components/quest/turn-banner";
import { FloatingDamage } from "@/components/quest/floating-damage";

interface BattleArenaProps {
  backgroundImage: string;
  // Party
  unlockedCharacters: string[];
  playerHP: number;
  playerMaxHP: number;
  isFlinching: boolean;
  attackFrame: string | null;
  dashOffset: number;
  // Hearts
  shatteringHeartIndex: number | null;
  // Boss
  bossImage: string;
  bossName: string;
  bossNameCN: string;
  bossHP: number;
  bossMaxHP: number;
  totalRecordings: number;
  roundInfo: string;
  isBossHit: boolean;
  isBossRecoiling: boolean;
  // Effects
  showTurnBanner: boolean;
  turnBannerPhase: "boss_attack" | "player_attack";
  showDamage: boolean;
  damageText: string | null;
  damageType: "damage" | "block" | "miss";
  onDamageComplete: () => void;
  // Flash overlays
  showRedFlash: boolean;
  showGreenFlash: boolean;
}

export function BattleArena({
  backgroundImage,
  unlockedCharacters,
  playerHP,
  playerMaxHP,
  isFlinching,
  attackFrame,
  dashOffset,
  shatteringHeartIndex,
  bossImage,
  bossName,
  bossNameCN,
  bossHP,
  bossMaxHP,
  totalRecordings,
  roundInfo,
  isBossHit,
  isBossRecoiling,
  showTurnBanner,
  turnBannerPhase,
  showDamage,
  damageText,
  damageType,
  onDamageComplete,
  showRedFlash,
  showGreenFlash,
}: BattleArenaProps) {
  return (
    <div
      className="relative w-full h-full bg-cover bg-center overflow-hidden"
      style={{
        backgroundImage: `url("${backgroundImage}")`,
      }}
    >
      {/* Ground gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      {/* Red flash overlay (wrong MCQ) */}
      {showRedFlash && (
        <div className="absolute inset-0 bg-red-600/30 pointer-events-none z-30 animate-red-flash" />
      )}

      {/* Green flash overlay (correct MCQ) */}
      {showGreenFlash && (
        <div className="absolute inset-0 bg-green-500/20 pointer-events-none z-30 animate-red-flash" />
      )}

      {/* Party sprites + hearts — bottom left */}
      <PartySprites
        unlockedCharacters={unlockedCharacters}
        isFlinching={isFlinching}
        attackFrame={attackFrame}
        dashOffset={dashOffset}
        playerHP={playerHP}
        playerMaxHP={playerMaxHP}
        shatteringHeartIndex={shatteringHeartIndex}
      />

      {/* Boss sprite — bottom right */}
      <BossSprite
        bossImage={bossImage}
        bossName={bossName}
        bossNameCN={bossNameCN}
        bossHP={bossHP}
        bossMaxHP={bossMaxHP}
        totalRecordings={totalRecordings}
        roundInfo={roundInfo}
        isHit={isBossHit}
        isRecoiling={isBossRecoiling}
      />

      {/* Floating damage near boss */}
      {showDamage && damageText && (
        <div className="absolute right-[10%] sm:right-[15%] md:right-[20%] bottom-[40%] sm:bottom-[45%] z-40 flex justify-center">
          <FloatingDamage
            text={damageText}
            type={damageType}
            onComplete={onDamageComplete}
          />
        </div>
      )}

      {/* Turn banner overlay */}
      <TurnBanner
        phase={turnBannerPhase}
        visible={showTurnBanner}
      />
    </div>
  );
}
