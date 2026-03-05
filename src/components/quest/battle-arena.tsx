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
  bossAttackFrame?: string | null;
  bossHitFrame?: string | null;
  bossName: string;
  bossNameCN: string;
  bossHP: number;
  bossMaxHP: number;
  totalRecordings: number;
  roundInfo: string;
  isBossHit: boolean;
  isBossRecoiling: boolean;
  // Wukong defend/got-hit
  defendFrame?: string | null;
  gotHitFrame?: string | null;
  isDefending?: boolean;
  isGotHit?: boolean;
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
  // Boss projectile (e.g. divine punishment)
  bossProjectile?: string;
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
  bossAttackFrame,
  bossHitFrame,
  bossName,
  bossNameCN,
  bossHP,
  bossMaxHP,
  totalRecordings,
  roundInfo,
  isBossHit,
  isBossRecoiling,
  defendFrame,
  gotHitFrame,
  isDefending,
  isGotHit,
  showTurnBanner,
  turnBannerPhase,
  showDamage,
  damageText,
  damageType,
  onDamageComplete,
  showRedFlash,
  showGreenFlash,
  bossProjectile,
}: BattleArenaProps) {
  return (
    <div
      className="relative w-full h-full bg-cover bg-center overflow-hidden"
      style={{
        backgroundImage: `url("${backgroundImage}")`,
      }}
    >
      {/* Ground gradient */}
      <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

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
        defendFrame={defendFrame}
        gotHitFrame={gotHitFrame}
        isDefending={isDefending}
        isGotHit={isGotHit}
      />

      {/* Boss sprite — bottom right */}
      <BossSprite
        bossImage={bossImage}
        bossAttackFrame={bossAttackFrame}
        bossHitFrame={bossHitFrame}
        bossName={bossName}
        bossNameCN={bossNameCN}
        bossHP={bossHP}
        bossMaxHP={bossMaxHP}
        totalRecordings={totalRecordings}
        roundInfo={roundInfo}
        isHit={isBossHit}
        isRecoiling={isBossRecoiling}
      />

      {/* Boss projectile — falls onto player during boss attack */}
      {bossProjectile && bossAttackFrame && (
        <div className="absolute left-[15%] sm:left-[22%] md:left-[25%] z-20 animate-divine-fall pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bossProjectile}
            alt="Boss projectile"
            className="w-[160px] h-[160px] sm:w-[200px] sm:h-[200px] md:w-[300px] md:h-[300px] object-contain drop-shadow-[0_0_20px_rgba(255,200,0,0.8)]"
            draggable={false}
          />
        </div>
      )}

      {/* Floating damage near boss */}
      {showDamage && damageText && (
        <div className="absolute right-[10%] sm:right-[20%] md:right-[25%] bottom-[35%] sm:bottom-[45%] z-40 w-[100px] flex justify-center">
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
