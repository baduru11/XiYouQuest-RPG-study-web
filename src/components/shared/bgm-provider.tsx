"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAudioSettings } from "./audio-settings";

interface BGMContextValue {
  /** Ref-counted duck control — call with true when learning starts, false when it stops */
  setLearningActive: (active: boolean) => void;
  /** Override the route-based track (e.g., quest stage music) */
  overrideTrack: (url: string) => void;
  /** Clear override, revert to route-based track */
  clearOverride: () => void;
  /** Whether BGM is currently ducked */
  isLearningActive: boolean;
}

const BGMContext = createContext<BGMContextValue>({
  setLearningActive: () => {},
  overrideTrack: () => {},
  clearOverride: () => {},
  isLearningActive: false,
});

export function useBGM() {
  return useContext(BGMContext);
}

export const STAGE_MUSIC: Record<number, string> = {
  1: "/audio/Stage 1 (Test 1).mp3",
  2: "/audio/Stage 2 (Test 1).mp3",
  3: "/audio/Stage 3 (New Test).mp3",
  4: "/audio/Stage 4 (Test 1).mp3",
  5: "/audio/Stage 5 (Test 1)(1).mp3",
  6: "/audio/Stage 6 (Test 1)(2).mp3",
  7: "/audio/Stage 7 (Test 4).mp3",
};

function getTrackForPathname(pathname: string): string | null {
  if (pathname === "/dashboard") return "/audio/main-theme.mp3";
  if (pathname === "/main-quest" || pathname === "/companion-chat")
    return "/audio/MainQuestStageSelection_companionChat.mp3";
  // Stop music during all practice/study sessions
  if (
    pathname.startsWith("/component-") ||
    pathname === "/mock-exam" ||
    pathname === "/learning-path"
  )
    return null;
  if (pathname === "/leaderboard" || pathname === "/achievements")
    return "/audio/Leaderboard_Achievement.mp3";
  if (
    pathname === "/social" ||
    pathname === "/profile" ||
    pathname === "/practice-history" ||
    pathname === "/characters"
  )
    return "/audio/Social_Profile_practiceHistory.mp3";
  return null;
}

const VOLUME_SCALE = 0.3;
const FADE_DURATION = 500; // ms for track crossfade
const DUCK_DURATION = 300; // ms for duck/unduck

export function BGMProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { effectiveMusicVolume } = useAudioSettings();

  const [isLearningActive, setIsLearningActiveState] = useState(false);
  const [override, setOverride] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSrcRef = useRef<string | null>(null);
  const learningCountRef = useRef(0);
  const fadeRef = useRef<number>(0);
  const targetVolumeRef = useRef(effectiveMusicVolume * VOLUME_SCALE);
  const duckedRef = useRef(false);
  const prevPathnameRef = useRef(pathname);

  // Clear override when route changes
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      setOverride(null);
    }
  }, [pathname]);

  // Compute effective track
  const routeTrack = getTrackForPathname(pathname);
  const effectiveTrack = override ?? routeTrack;

  // Update target volume ref
  targetVolumeRef.current = effectiveMusicVolume * VOLUME_SCALE;

  // Smooth volume ramp helper
  const rampVolume = useCallback(
    (audio: HTMLAudioElement, from: number, to: number, duration: number, onDone?: () => void) => {
      cancelAnimationFrame(fadeRef.current);
      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
        if (t < 1) {
          fadeRef.current = requestAnimationFrame(step);
        } else {
          onDone?.();
        }
      };
      fadeRef.current = requestAnimationFrame(step);
    },
    []
  );

  // Handle track changes
  useEffect(() => {
    if (!effectiveTrack) {
      // No track for this route — stop any playing audio
      if (audioRef.current) {
        const audio = audioRef.current;
        rampVolume(audio, audio.volume, 0, FADE_DURATION, () => {
          audio.pause();
          audio.src = "";
          currentSrcRef.current = null;
        });
      }
      return;
    }

    const duckedMultiplier = duckedRef.current ? 0.1 : 1;
    const fullVolume = targetVolumeRef.current * duckedMultiplier;

    if (!audioRef.current) {
      // First time — create audio
      const audio = new Audio(effectiveTrack);
      audio.loop = true;
      audio.volume = 0;
      audio.preload = "auto";
      audioRef.current = audio;
      currentSrcRef.current = effectiveTrack;

      const tryPlay = () => {
        audio.play().then(() => {
          rampVolume(audio, 0, fullVolume, FADE_DURATION);
        }).catch(() => {
          // Autoplay blocked — wait for user interaction
          const resume = () => {
            audio.play().then(() => {
              rampVolume(audio, 0, fullVolume, FADE_DURATION);
            }).catch(() => {});
            document.removeEventListener("click", resume);
            document.removeEventListener("keydown", resume);
          };
          document.addEventListener("click", resume, { once: true });
          document.addEventListener("keydown", resume, { once: true });
        });
      };
      tryPlay();
      return;
    }

    // Track changed — crossfade
    if (currentSrcRef.current !== effectiveTrack) {
      const audio = audioRef.current;
      rampVolume(audio, audio.volume, 0, FADE_DURATION, () => {
        audio.src = effectiveTrack;
        audio.currentTime = 0;
        currentSrcRef.current = effectiveTrack;
        audio.play().then(() => {
          rampVolume(audio, 0, fullVolume, FADE_DURATION);
        }).catch(() => {});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTrack]);

  // Respond to volume changes from settings
  useEffect(() => {
    if (!audioRef.current || !currentSrcRef.current) return;
    const duckedMultiplier = duckedRef.current ? 0.1 : 1;
    audioRef.current.volume = targetVolumeRef.current * duckedMultiplier;
  }, [effectiveMusicVolume]);

  // Duck/unduck
  const applyDuck = useCallback(
    (ducked: boolean) => {
      duckedRef.current = ducked;
      if (!audioRef.current || !currentSrcRef.current) return;
      const audio = audioRef.current;
      const to = targetVolumeRef.current * (ducked ? 0.1 : 1);
      rampVolume(audio, audio.volume, to, DUCK_DURATION);
    },
    [rampVolume]
  );

  const setLearningActive = useCallback(
    (active: boolean) => {
      learningCountRef.current += active ? 1 : -1;
      learningCountRef.current = Math.max(0, learningCountRef.current);
      const shouldDuck = learningCountRef.current > 0;
      setIsLearningActiveState(shouldDuck);
      applyDuck(shouldDuck);
    },
    [applyDuck]
  );

  const overrideTrack = useCallback((url: string) => {
    setOverride(url);
  }, []);

  const clearOverride = useCallback(() => {
    setOverride(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(fadeRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <BGMContext.Provider
      value={{ setLearningActive, overrideTrack, clearOverride, isLearningActive }}
    >
      {children}
    </BGMContext.Provider>
  );
}
