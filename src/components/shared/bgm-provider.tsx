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
  if (pathname === "/practice")
    return "/audio/PracticeSession_MockExam_LearningPath.mp3";
  // No music during active practice/study sessions
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
  // Web Audio API for cross-platform volume control (iOS requires GainNode)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

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

  // Initialize Web Audio API context + gain node
  const ensureAudioContext = useCallback((audio: HTMLAudioElement) => {
    if (audioCtxRef.current) return;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = targetVolumeRef.current;
    const source = ctx.createMediaElementSource(audio);
    source.connect(gain);
    gain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    gainNodeRef.current = gain;
    sourceNodeRef.current = source;
  }, []);

  // Smooth volume ramp via GainNode (works on iOS) with HTMLAudioElement fallback
  const rampVolume = useCallback(
    (from: number, to: number, duration: number, onDone?: () => void) => {
      cancelAnimationFrame(fadeRef.current);
      const gain = gainNodeRef.current;
      if (gain) {
        // Use Web Audio API exponential ramp for smooth fading
        gain.gain.cancelScheduledValues(audioCtxRef.current!.currentTime);
        gain.gain.setValueAtTime(Math.max(0.001, from), audioCtxRef.current!.currentTime);
        if (to <= 0.001) {
          gain.gain.linearRampToValueAtTime(0.001, audioCtxRef.current!.currentTime + duration / 1000);
        } else {
          gain.gain.exponentialRampToValueAtTime(Math.max(0.001, to), audioCtxRef.current!.currentTime + duration / 1000);
        }
        if (onDone) {
          const timeoutId = setTimeout(onDone, duration);
          // Store timeout so we can cancel on next ramp
          fadeRef.current = timeoutId as unknown as number;
        }
        return;
      }
      // Fallback: requestAnimationFrame-based volume (non-iOS)
      const audio = audioRef.current;
      if (!audio) { onDone?.(); return; }
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

  // Set volume instantly (cancel any running ramp)
  const setVolumeImmediate = useCallback((vol: number) => {
    const gain = gainNodeRef.current;
    if (gain && audioCtxRef.current) {
      gain.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
      gain.gain.setValueAtTime(Math.max(0, vol), audioCtxRef.current.currentTime);
    }
    if (audioRef.current) {
      // Also set HTMLAudioElement volume as fallback (no-op on iOS but works on desktop)
      try { audioRef.current.volume = Math.max(0, Math.min(1, vol)); } catch { /* iOS ignores */ }
    }
  }, []);

  // Handle track changes
  useEffect(() => {
    if (!effectiveTrack) {
      // No track for this route — stop any playing audio
      if (audioRef.current && currentSrcRef.current) {
        const currentVol = gainNodeRef.current?.gain.value ?? audioRef.current.volume;
        rampVolume(currentVol, 0, FADE_DURATION, () => {
          audioRef.current?.pause();
          if (audioRef.current) audioRef.current.src = "";
          currentSrcRef.current = null;
        });
      }
      return;
    }

    // Don't start playback if learning is active (music paused)
    if (duckedRef.current) return;
    const fullVolume = targetVolumeRef.current;

    if (!audioRef.current) {
      // First time — create audio
      const audio = new Audio(effectiveTrack);
      audio.loop = true;
      audio.volume = 1; // Let GainNode control volume; set to 1 so GainNode output is correct
      audio.preload = "auto";
      audioRef.current = audio;
      currentSrcRef.current = effectiveTrack;

      const tryPlay = () => {
        ensureAudioContext(audio);
        setVolumeImmediate(0);
        audio.play().then(() => {
          if (audioCtxRef.current?.state === "suspended") {
            audioCtxRef.current.resume();
          }
          rampVolume(0, fullVolume, FADE_DURATION);
        }).catch(() => {
          // Autoplay blocked — wait for user interaction
          const resume = () => {
            ensureAudioContext(audio);
            if (audioCtxRef.current?.state === "suspended") {
              audioCtxRef.current.resume();
            }
            audio.play().then(() => {
              rampVolume(0, fullVolume, FADE_DURATION);
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
      const currentVol = gainNodeRef.current?.gain.value ?? audio.volume;
      rampVolume(currentVol, 0, FADE_DURATION, () => {
        audio.src = effectiveTrack;
        audio.currentTime = 0;
        currentSrcRef.current = effectiveTrack;
        audio.play().then(() => {
          rampVolume(0, fullVolume, FADE_DURATION);
        }).catch(() => {});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTrack]);

  // Respond to volume changes from settings
  useEffect(() => {
    if (!audioRef.current || !currentSrcRef.current || duckedRef.current) return;
    setVolumeImmediate(targetVolumeRef.current);
  }, [effectiveMusicVolume, setVolumeImmediate]);

  // Pause/resume when learning is active
  const applyDuck = useCallback(
    (ducked: boolean) => {
      duckedRef.current = ducked;
      if (!audioRef.current || !currentSrcRef.current) return;
      const audio = audioRef.current;
      if (ducked) {
        const currentVol = gainNodeRef.current?.gain.value ?? audio.volume;
        rampVolume(currentVol, 0, DUCK_DURATION, () => {
          audio.pause();
        });
      } else {
        audio.play().then(() => {
          if (audioCtxRef.current?.state === "suspended") {
            audioCtxRef.current.resume();
          }
          rampVolume(0, targetVolumeRef.current, DUCK_DURATION);
        }).catch(() => {});
      }
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
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
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
