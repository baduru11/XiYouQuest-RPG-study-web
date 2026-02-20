"use client";

interface TurnBannerProps {
  phase: "boss_attack" | "player_attack";
  visible: boolean;
}

export function TurnBanner({ phase, visible }: TurnBannerProps) {
  if (!visible) return null;

  const isPlayer = phase === "player_attack";

  return (
    <div className="absolute inset-x-0 top-[35%] z-30 flex justify-center pointer-events-none">
      <div
        className={`px-8 py-3 ${
          isPlayer ? "bg-green-900/80" : "bg-red-900/80"
        } backdrop-blur-sm animate-banner-in`}
      >
        <p
          className={`font-pixel text-sm md:text-base tracking-wider ${
            isPlayer
              ? "text-green-400 pixel-glow-green"
              : "text-red-400 pixel-glow"
          }`}
        >
          {isPlayer ? "YOUR TURN — ATTACK!" : "ENEMY TURN — DEFEND!"}
        </p>
      </div>
    </div>
  );
}
