"use client";

import { useState } from "react";
import Image from "next/image";
import type { ExpressionName } from "@/types/character";

interface CharacterDisplayProps {
  characterName: string;
  expressionImages: Record<string, string>;
  currentExpression: ExpressionName;
  className?: string;
}

export function CharacterDisplay({
  characterName,
  expressionImages,
  currentExpression,
  className = "",
}: CharacterDisplayProps) {
  const [loaded, setLoaded] = useState(false);
  const imageUrl = expressionImages[currentExpression] || expressionImages["neutral"] || "";

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      <div className="relative h-64 w-48 overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`${characterName} - ${currentExpression}`}
            fill
            className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground text-center p-2">
            {characterName}
            <br />
            ({currentExpression})
          </div>
        )}
      </div>
      <span className="mt-2 text-sm font-medium">{characterName}</span>
    </div>
  );
}
