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

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <p className="text-xs font-bold text-muted-foreground mb-1">{characterName}</p>
      <p className="text-sm leading-relaxed">
        {displayedText}
        {!isComplete && <span className="animate-pulse">|</span>}
      </p>
    </div>
  );
}
