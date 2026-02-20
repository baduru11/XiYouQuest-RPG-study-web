"use client";

import { useEffect } from "react";

interface FloatingDamageProps {
  text: string;
  type: "damage" | "block" | "miss";
  onComplete: () => void;
}

export function FloatingDamage({ text, type, onComplete }: FloatingDamageProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const colorClass =
    type === "damage"
      ? "text-red-400 pixel-glow"
      : type === "block"
        ? "text-green-400 pixel-glow-green"
        : "text-gray-400";

  return (
    <span
      className={`font-pixel text-2xl md:text-3xl animate-float-damage pointer-events-none ${colorClass}`}
    >
      {text}
    </span>
  );
}
