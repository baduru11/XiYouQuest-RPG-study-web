"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { QUEST_INTRO_TEXT } from "@/lib/quest/story-text";

interface IntroScreenProps {
  onComplete: () => void;
}

export function IntroScreen({ onComplete }: IntroScreenProps) {
  const [visibleParagraphs, setVisibleParagraphs] = useState(1);
  const allShown = visibleParagraphs >= QUEST_INTRO_TEXT.length;

  const advance = useCallback(() => {
    if (allShown) return;
    setVisibleParagraphs((prev) => Math.min(prev + 1, QUEST_INTRO_TEXT.length));
  }, [allShown]);

  // Keyboard / click to advance paragraphs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't advance if user pressed Tab or similar navigation keys
      if (e.key === "Tab" || e.key === "Shift") return;
      if (allShown) return;
      advance();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allShown, advance]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={!allShown ? advance : undefined}
    >
      {/* Background image */}
      <Image
        src="/img/main stage/1.webp"
        alt="Quest intro background"
        fill
        className="object-cover"
        priority
        unoptimized
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl mx-auto px-6">
        {/* Title */}
        <h1 className="font-pixel text-xl md:text-2xl text-amber-300 pixel-glow-gold text-center tracking-wider">
          Journey to the West
        </h1>
        <p className="font-chinese text-lg text-amber-200/80 -mt-4">
          西游记
        </p>

        {/* Story paragraphs */}
        <div className="space-y-4 w-full">
          {QUEST_INTRO_TEXT.slice(0, visibleParagraphs).map((text, i) => (
            <p
              key={i}
              className="font-retro text-lg md:text-xl text-amber-100/90 leading-relaxed animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {text}
            </p>
          ))}
        </div>

        {/* Bottom indicator or button */}
        {allShown ? (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
            size="lg"
            className="mt-4 animate-fade-in-up font-pixel text-sm"
          >
            Begin Journey 开始旅程
          </Button>
        ) : (
          <p className="font-retro text-sm text-amber-300/60 animate-blink mt-2">
            Press any key to continue...
          </p>
        )}
      </div>
    </div>
  );
}
