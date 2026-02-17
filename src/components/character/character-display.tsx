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
      <div className="relative h-48 w-36 sm:h-64 sm:w-48 overflow-hidden pixel-border bg-muted">
        {imageUrl && !error ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 animate-pulse bg-muted" />
            )}
            <Image
              src={imageUrl}
              alt={`${characterName} - ${currentExpression}`}
              fill
              sizes="(max-width: 640px) 144px, 192px"
              className={`object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground text-center p-2">
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
