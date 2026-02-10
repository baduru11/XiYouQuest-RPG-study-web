"use client";

import { useEffect, useState } from "react";

interface DialogueBoxProps {
  text: string;
  characterName: string;
  isTyping?: boolean;
  typingSpeed?: number;
}

export function DialogueBox({
  text,
  characterName,
  isTyping = true,
  typingSpeed = 30,
}: DialogueBoxProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isTyping) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    setDisplayedText("");
    setIsComplete(false);
    let i = 0;

    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + 1));
        i++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, typingSpeed);

    return () => clearInterval(interval);
  }, [text, isTyping, typingSpeed]);

  function handleSkip() {
    setDisplayedText(text);
    setIsComplete(true);
  }

  return (
    <div className="pixel-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-block h-2 w-2 bg-pixel-green" />
        <p className="font-pixel text-[10px] text-primary">{characterName}</p>
      </div>
      <p className="text-sm leading-relaxed">
        {displayedText}
        {!isComplete && <span className="animate-blink text-primary">_</span>}
      </p>
      {!isComplete && (
        <button
          onClick={handleSkip}
          className="mt-1 font-pixel text-[8px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          Skip &gt;&gt;
        </button>
      )}
    </div>
  );
}
