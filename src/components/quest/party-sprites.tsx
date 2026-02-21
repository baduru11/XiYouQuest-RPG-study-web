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
}

export function PartySprites({
  unlockedCharacters,
  isFlinching,
  attackFrame,
  dashOffset,
  playerHP,
  playerMaxHP,
  shatteringHeartIndex,
}: PartySpritesProps) {
  const wukong = QUEST_CHARACTERS["Son Wukong"];
  const hasSamJang = unlockedCharacters.includes("Sam Jang");
  const samJang = hasSamJang ? QUEST_CHARACTERS["Sam Jang"] : null;
  const otherMembers = unlockedCharacters.filter(
    (n) => n !== "Son Wukong" && n !== "Sam Jang"
  );

  return (
    <div className="absolute bottom-6 sm:bottom-10 left-[8%] sm:left-[15%] md:left-[18%] flex items-end gap-0">
      {/* Other support characters behind (not Sam Jang) — 80% of Wukong, each at own position */}
      {otherMembers.slice(0, 2).map((name, i) => {
        const char = QUEST_CHARACTERS[name];
        if (!char) return null;
        // Each member gets progressively further left
        const leftOffsets = [
          "left-[-35px] sm:left-[-125px] md:left-[-210px]",
          "left-[-55px] sm:left-[-180px] md:left-[-305px]",
        ];
        return (
          <div
            key={name}
            className={`absolute bottom-[35px] sm:bottom-[65px] md:bottom-[80px] z-0 ${leftOffsets[i]} ${isFlinching ? "animate-flinch" : ""}`}
            style={{ animationDelay: `${(i + 2) * 0.1}s` }}
          >
            <img
              src={char.image}
              alt={char.name}
              loading="eager"
              className="w-[100px] h-[133px] sm:w-[176px] sm:h-[235px] md:w-[307px] md:h-[384px] object-contain animate-idle-bob drop-shadow-lg"
              style={{ animationDelay: `${(i + 2) * 0.3}s` }}
              draggable={false}
            />
          </div>
        );
      })}

      {/* Sam Jang — behind Wukong, facing backwards, 80% of Wukong */}
      {samJang && (
        <div
          className={`absolute bottom-[35px] sm:bottom-[65px] md:bottom-[80px] z-0 left-[-20px] sm:left-[-70px] md:left-[-115px] ${isFlinching ? "animate-flinch" : ""}`}
          style={{ animationDelay: "0.1s" }}
        >
          <img
            src={samJang.image}
            alt={samJang.name}
            loading="eager"
            className="w-[100px] h-[133px] sm:w-[176px] sm:h-[235px] md:w-[307px] md:h-[384px] object-contain animate-idle-bob drop-shadow-lg -scale-x-100"
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
        <img
          src={attackFrame ?? wukong.image}
          alt="Son Wukong"
          loading="eager"
          className={`w-[150px] h-[200px] sm:w-[220px] sm:h-[293px] md:w-[384px] md:h-[480px] object-contain drop-shadow-xl ${
            attackFrame ? "" : "animate-idle-bob"
          }`}
          draggable={false}
        />

        {/* Player HP box with names + hearts below character */}
        <div className="relative mt-1 border-2 border-amber-800/60 bg-gradient-to-b from-[#f5e6c8] via-[#f0dbb5] to-[#e8d0a0] rounded-sm overflow-hidden shadow-md max-w-[150px] sm:max-w-[220px] md:max-w-[384px]">
          <div className="h-1 bg-gradient-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
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
          <div className="h-1 bg-gradient-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
        </div>
      </div>
    </div>
  );
}
