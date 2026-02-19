"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";

export function MusicPlayer({ src, pathname: activePath }: { src: string; pathname: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const listenersRef = useRef(false);
  const pathname = usePathname();

  const isActive = pathname === activePath;

  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || started) return;
    audio.play().then(() => setStarted(true)).catch(() => {});
  }, [started]);

  // Create audio once on mount
  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.3;
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  // Attempt autoplay on first user gesture (registered early, across all pages)
  useEffect(() => {
    if (started || listenersRef.current) return;

    const audio = audioRef.current;
    if (!audio) return;

    const events = ["pointerdown", "touchstart", "keydown"] as const;

    const handleGesture = () => {
      // Only actually play if we're on the active path
      if (window.location.pathname === activePath) {
        audio.play().then(() => setStarted(true)).catch(() => {});
      } else {
        // Unlock audio silently so it can play instantly when navigating to dashboard
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.muted = false;
          audio.currentTime = 0;
          setStarted(true);
        }).catch(() => {});
      }
      events.forEach((e) => document.removeEventListener(e, handleGesture));
      listenersRef.current = false;
    };

    events.forEach((e) =>
      document.addEventListener(e, handleGesture, { once: true, passive: true })
    );
    listenersRef.current = true;
  }, [started, activePath]);

  // Play/pause based on current route
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !started) return;

    if (isActive && !muted) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isActive, started, muted]);

  // Sync muted state
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = muted;
  }, [muted]);

  if (!isActive) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        tryPlay();
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
