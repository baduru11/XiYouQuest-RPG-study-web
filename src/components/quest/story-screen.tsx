"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { StageNumber } from "@/lib/quest/types";
import { STAGE_STORIES } from "@/lib/quest/story-text";
import { STAGE_CONFIGS } from "@/lib/quest/stage-config";
import { ArrowLeft } from "lucide-react";

interface StoryScreenProps {
  stage: StageNumber;
  onContinue: () => void;
  onBack: () => void;
}

export function StoryScreen({ stage, onContinue, onBack }: StoryScreenProps) {
  const config = STAGE_CONFIGS[stage];
  const story = STAGE_STORIES[stage];
  const [visibleParagraphs, setVisibleParagraphs] = useState(1);
  const allShown = visibleParagraphs >= story.intro.length;

  const advance = useCallback(() => {
    if (allShown) return;
    setVisibleParagraphs((prev) => Math.min(prev + 1, story.intro.length));
  }, [allShown, story.intro.length]);

  // Keyboard to advance paragraphs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        src={config.backgroundImage}
        alt={`${config.name} background`}
        fill
        className="object-cover"
        priority
        unoptimized
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/65" />

      {/* Back button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onBack();
        }}
        className="absolute top-4 left-4 z-20 flex items-center gap-2 text-amber-300/70 hover:text-amber-300 transition-colors font-retro text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl mx-auto px-6">
        {/* Stage title */}
        <div className="text-center space-y-1">
          <p className="font-pixel text-[10px] text-amber-400/70">
            Stage {stage}
          </p>
          <h1 className="font-pixel text-lg md:text-xl text-amber-300 pixel-glow-gold">
            {config.name}
          </h1>
          <p className="font-chinese text-lg text-amber-200/70">
            {config.nameCN}
          </p>
          <p className="font-retro text-sm text-amber-200/50">
            {config.subtitle}
          </p>
        </div>

        {/* Story paragraphs */}
        <div className="space-y-4 w-full max-h-[50vh] overflow-y-auto px-1">
          {story.intro.slice(0, visibleParagraphs).map((text, i) => (
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
          <div className="flex gap-3 mt-2 animate-fade-in-up">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onContinue();
              }}
              size="lg"
              className="font-pixel text-sm"
            >
              Enter Battle 进入战斗
            </Button>
          </div>
        ) : (
          <p className="font-retro text-sm text-amber-300/60 animate-blink mt-2">
            Press any key to continue...
          </p>
        )}
      </div>
    </div>
  );
}
