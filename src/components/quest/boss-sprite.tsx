"use client";

import { Heart } from "lucide-react";

interface BossSpriteProps {
  bossImage: string;
  bossName: string;
  bossNameCN: string;
  bossHP: number;
  bossMaxHP: number;
  totalRecordings: number;
  roundInfo: string;
  isHit: boolean;
  isRecoiling: boolean;
}

export function BossSprite({
  bossImage,
  bossName,
  bossNameCN,
  bossHP,
  bossMaxHP,
  totalRecordings,
  roundInfo,
  isHit,
  isRecoiling,
}: BossSpriteProps) {
  // Boss hearts: total = number of recording groups, filled = proportional to remaining HP
  const totalHearts = totalRecordings;
  const filledHearts = bossHP <= 0
    ? 0
    : Math.ceil((bossHP / bossMaxHP) * totalHearts);

  return (
    <div className="absolute bottom-6 sm:bottom-10 right-[8%] sm:right-[15%] md:right-[18%] flex flex-col items-center gap-1 z-10">
      {/* Boss sprite */}
      <div
        className={`relative ${
          isHit
            ? "animate-boss-hit"
            : isRecoiling
              ? "animate-recoil"
              : ""
        }`}
      >
        {/* White flash overlay on hit */}
        {isHit && (
          <div className="absolute inset-0 bg-white/40 z-10 pointer-events-none rounded-sm" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bossImage}
          alt={bossName}
          loading="eager"
          className={`w-[170px] h-[195px] sm:w-[260px] sm:h-[297px] md:w-[432px] md:h-[480px] object-contain drop-shadow-xl ${
            !isHit && !isRecoiling ? "animate-boss-float" : ""
          }`}
          draggable={false}
        />
      </div>

      {/* Boss info + hearts below sprite */}
      <div className="relative border-2 border-amber-800/60 bg-gradient-to-b from-[#f5e6c8] via-[#f0dbb5] to-[#e8d0a0] rounded-sm overflow-hidden shadow-md max-w-[145px] sm:max-w-[260px] md:max-w-[432px]">
        <div className="h-1 bg-gradient-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
        <div className="px-1.5 py-1 sm:px-3 sm:py-1.5 space-y-1">
          <div className="flex justify-between items-baseline">
            <div className="min-w-0">
              <p className="font-pixel text-[8px] sm:text-[10px] md:text-xs text-amber-900 truncate">
                {bossName}
              </p>
              <p className="font-chinese text-[10px] sm:text-xs md:text-sm text-amber-800 truncate">
                {bossNameCN}
              </p>
            </div>
            <span className="font-retro text-[8px] sm:text-[10px] text-amber-700/60 shrink-0 ml-1 sm:ml-2">
              {roundInfo}
            </span>
          </div>
          {/* Boss HP hearts */}
          <div className="flex flex-wrap justify-center gap-0.5">
            {Array.from({ length: totalHearts }).map((_, i) => {
              const isFilled = i < filledHearts;
              return (
                <Heart
                  key={i}
                  className={`w-3.5 h-3.5 sm:w-5 sm:h-5 md:w-6 md:h-6 drop-shadow-md ${
                    isFilled
                      ? "text-purple-500 fill-purple-500"
                      : "text-gray-500 fill-gray-400/50"
                  }`}
                />
              );
            })}
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
      </div>
    </div>
  );
}
