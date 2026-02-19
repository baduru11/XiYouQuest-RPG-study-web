"use client";

import { useState, useEffect, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";

export function MusicPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    // Try to autoplay immediately — works if the user already interacted with the site
    audio.play().then(() => {
      setStarted(true);
    }).catch(() => {
      // Browser blocked autoplay — wait for any interaction then play
      const handleInteraction = () => {
        audio.play().then(() => setStarted(true)).catch(() => {});
        window.removeEventListener("click", handleInteraction);
        window.removeEventListener("keydown", handleInteraction);
      };
      window.addEventListener("click", handleInteraction, { once: true });
      window.addEventListener("keydown", handleInteraction, { once: true });
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = muted;
  }, [muted]);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!started) {
          audioRef.current?.play().catch(() => {});
          setStarted(true);
        }
        setMuted((m) => !m);
      }}
      className="fixed bottom-4 right-4 z-50 pixel-border bg-card p-2 hover:pixel-border-primary transition-all"
      aria-label={muted ? "Unmute music" : "Mute music"}
    >
      {muted ? (
        <VolumeX className="h-5 w-5 text-muted-foreground" />
      ) : (
        <Volume2 className="h-5 w-5 text-primary" />
      )}
    </button>
  );
}
