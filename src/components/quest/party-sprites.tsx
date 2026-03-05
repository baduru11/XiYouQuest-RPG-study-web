"use client";

import { Heart } from "lucide-react";
import { QUEST_CHARACTERS } from "@/lib/quest/stage-config";

interface PartySpritesProps {
  unlockedCharacters: string[];
  isFlinching: boolean;
  attackFrame: string | null;
  dashOffset: number;
  playerHP: number;
  playerMaxHP: number;
  shatteringHeartIndex: number | null;
  defendFrame?: string | null;
  gotHitFrame?: string | null;
  isDefending?: boolean;
  isGotHit?: boolean;
}

export function PartySprites({
  unlockedCharacters,
  isFlinching,
  attackFrame,
  dashOffset,
  playerHP,
  playerMaxHP,
  shatteringHeartIndex,
  defendFrame,
  gotHitFrame,
  isDefending,
  isGotHit,
}: PartySpritesProps) {
  const wukong = QUEST_CHARACTERS["Son Wukong"];
  const hasSamJang = unlockedCharacters.includes("Sam Jang");
  const samJang = hasSamJang ? QUEST_CHARACTERS["Sam Jang"] : null;
  const otherMembers = unlockedCharacters.filter(
    (n) => n !== "Son Wukong" && n !== "Sam Jang"
  );

  return (
    <div className="absolute bottom-6 sm:bottom-10 left-[5%] sm:left-[15%] md:left-[18%] flex items-end gap-0">
      {/* Other support characters — above Sam Jang on mobile, spread left on desktop */}
      {otherMembers.slice(0, 2).map((name, i) => {
        const char = QUEST_CHARACTERS[name];
        if (!char) return null;
        const leftOffsets = [
          "left-[-30px] sm:left-[-125px] md:left-[-210px]",
          "left-[-50px] sm:left-[-180px] md:left-[-305px]",
        ];
        const bottomOffsets = [
          "bottom-[170px] sm:bottom-[65px] md:bottom-[80px]",
          "bottom-[250px] sm:bottom-[65px] md:bottom-[80px]",
        ];
        return (
          <div
            key={name}
            className={`absolute z-0 ${bottomOffsets[i]} ${leftOffsets[i]} ${isFlinching ? "animate-flinch" : ""}`}
            style={{ animationDelay: `${(i + 2) * 0.1}s` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={char.image}
              alt={char.name}
              loading="eager"
              className="w-[140px] h-[187px] sm:w-[176px] sm:h-[235px] md:w-[307px] md:h-[384px] object-contain animate-idle-bob drop-shadow-lg -translate-y-8 sm:translate-y-0"
              style={{ animationDelay: `${(i + 2) * 0.3}s` }}
              draggable={false}
            />
          </div>
        );
      })}

      {/* Sam Jang — bottom-most companion on mobile, behind Wukong */}
      {samJang && (
        <div
          className={`absolute bottom-[45px] sm:bottom-[65px] md:bottom-[80px] z-0 left-[-25px] sm:left-[-70px] md:left-[-115px] ${isFlinching ? "animate-flinch" : ""}`}
          style={{ animationDelay: "0.1s" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={samJang.image}
            alt={samJang.name}
            loading="eager"
            className="w-[140px] h-[187px] sm:w-[176px] sm:h-[235px] md:w-[307px] md:h-[384px] object-contain animate-idle-bob drop-shadow-lg -scale-x-100 -translate-y-8 sm:translate-y-0"
            style={{ animationDelay: "0.3s" }}
            draggable={false}
          />
        </div>
      )}

      {/* Son Wukong — main fighter, in front */}
      <div
        className={`relative z-10 flex flex-col items-center ${
          isFlinching ? "animate-flinch" : ""
        }`}
        style={{
          transform: `translateX(${dashOffset}px)`,
          transition:
            dashOffset !== 0
              ? "transform 0.3s ease-out"
              : "transform 0.3s ease-in",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            attackFrame
              ?? (isGotHit && gotHitFrame ? gotHitFrame : null)
              ?? (isDefending && defendFrame ? defendFrame : null)
              ?? wukong.image
          }
          alt="Son Wukong"
          loading="eager"
          className={`w-[187px] h-[250px] sm:w-[150px] sm:h-[200px] md:w-[384px] md:h-[480px] object-contain drop-shadow-xl -translate-y-8 translate-x-3 sm:translate-x-0 sm:translate-y-0 ${
            attackFrame || isGotHit || isDefending ? "" : "animate-idle-bob"
          }`}
          draggable={false}
        />

        {/* Player HP box with names + hearts below character */}
        <div className="relative mt-1 border-2 border-amber-800/60 bg-linear-to-b from-[#f5e6c8] via-[#f0dbb5] to-[#e8d0a0] rounded-sm overflow-hidden shadow-md max-w-[140px] sm:max-w-[150px] md:max-w-[384px]">
          <div className="h-1 bg-linear-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
          <div className="px-1.5 py-1 sm:px-3 sm:py-1.5 space-y-1">
            <div>
              <p className="font-pixel text-[9px] sm:text-[10px] md:text-xs text-amber-900 text-center leading-relaxed">
                {unlockedCharacters.map((n) => QUEST_CHARACTERS[n]?.name).filter(Boolean).join(" · ")}
              </p>
              <p className="font-chinese text-[10px] sm:text-xs md:text-sm text-amber-800 text-center leading-relaxed">
                {unlockedCharacters.map((n) => QUEST_CHARACTERS[n]?.nameCN).filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-0.5">
            {Array.from({ length: playerMaxHP }).map((_, i) => {
              const isShattering = shatteringHeartIndex === i;
              const isFilled = i < playerHP;
              return (
                <Heart
                  key={i}
                  className={`w-3.5 h-3.5 sm:w-5 sm:h-5 md:w-6 md:h-6 drop-shadow-md ${
                    isShattering
                      ? "animate-heart-shatter text-red-500 fill-red-500"
                      : isFilled
                        ? "text-red-500 fill-red-500"
                        : "text-gray-500 fill-gray-400/50"
                  }`}
                />
              );
            })}
            </div>
          </div>
          <div className="h-1 bg-linear-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
        </div>
      </div>
    </div>
  );
}
