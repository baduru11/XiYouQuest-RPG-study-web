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
    <div className="absolute bottom-2 sm:bottom-4 left-[5%] sm:left-[8%] md:left-[12%] flex items-end gap-0">
      {/* Other support characters behind (not Sam Jang) */}
      {otherMembers.length > 0 && (
        <div className="flex flex-col-reverse items-start gap-1 -mr-3 sm:-mr-6 md:-mr-10 z-0">
          {otherMembers.slice(0, 2).map((name, i) => {
            const char = QUEST_CHARACTERS[name];
            if (!char) return null;
            return (
              <div
                key={name}
                className={`${isFlinching ? "animate-flinch" : ""}`}
                style={{ animationDelay: `${(i + 2) * 0.1}s` }}
              >
                <img
                  src={char.image}
                  alt={char.name}
                  loading="eager"
                  className="w-[80px] h-[107px] sm:w-[120px] sm:h-[160px] md:w-[192px] md:h-[240px] object-contain animate-idle-bob drop-shadow-lg"
                  style={{ animationDelay: `${(i + 2) * 0.3}s` }}
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Sam Jang — behind Wukong, facing backwards, 80% size, overlapping */}
      {samJang && (
        <div
          className={`absolute bottom-0 z-0 left-[-25px] sm:left-[-45px] md:left-[-60px] -ml-[15px] sm:-ml-[25px] md:-ml-[40px] ${isFlinching ? "animate-flinch" : ""}`}
          style={{ animationDelay: "0.1s" }}
        >
          <img
            src={samJang.image}
            alt={samJang.name}
            loading="eager"
            className="w-[120px] h-[160px] sm:w-[175px] sm:h-[233px] md:w-[307px] md:h-[384px] object-contain animate-idle-bob drop-shadow-lg -scale-x-100"
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
        {/* Player HP box with names + hearts above character */}
        <div className="relative mb-1 border-2 border-amber-800/60 bg-gradient-to-b from-[#f5e6c8] via-[#f0dbb5] to-[#e8d0a0] rounded-sm overflow-hidden shadow-md">
          <div className="h-1 bg-gradient-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
          <div className="px-1.5 py-1 sm:px-3 sm:py-1.5 space-y-1">
            <div className="min-w-0">
              <p className="font-pixel text-[8px] sm:text-[10px] md:text-xs text-amber-900 truncate">
                {unlockedCharacters.map((n) => QUEST_CHARACTERS[n]?.name).filter(Boolean).join(" · ")}
              </p>
              <p className="font-chinese text-[10px] sm:text-xs md:text-sm text-amber-800 truncate">
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

        <img
          src={attackFrame ?? wukong.image}
          alt="Son Wukong"
          loading="eager"
          className={`w-[150px] h-[200px] sm:w-[220px] sm:h-[293px] md:w-[384px] md:h-[480px] object-contain drop-shadow-xl ${
            attackFrame ? "" : "animate-idle-bob"
          }`}
          draggable={false}
        />
      </div>
    </div>
  );
}
