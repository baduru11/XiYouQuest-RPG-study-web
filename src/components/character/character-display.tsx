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
  const [error, setError] = useState(false);
  const imageUrl = expressionImages[currentExpression] || expressionImages["neutral"] || "";

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      <div className="relative overflow-hidden pixel-border bg-muted max-w-48 sm:max-w-56">
        {imageUrl && !error ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 animate-pulse bg-muted" />
            )}
            <Image
              src={imageUrl}
              alt={`${characterName} - ${currentExpression}`}
              width={224}
              height={224}
              className={`w-full h-auto transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
          </>
        ) : (
          <div className="flex h-48 w-36 items-center justify-center text-sm text-muted-foreground text-center p-2">
            {characterName}
            <br />
            ({currentExpression})
          </div>
        )}
      </div>
      <span className="mt-2 font-pixel text-xs text-primary">{characterName}</span>
    </div>
  );
}
