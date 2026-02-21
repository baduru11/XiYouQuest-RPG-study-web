"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface AudioSettingsContextValue {
  /** Music/effects volume (0-1) */
  musicVolume: number;
  /** TTS voice volume (0-1) */
  ttsVolume: number;
  muted: boolean;
  /** Music volume accounting for mute (0 if muted) */
  effectiveMusicVolume: number;
  /** TTS volume accounting for mute (0 if muted) */
  effectiveTtsVolume: number;
  setMusicVolume: (v: number) => void;
  setTtsVolume: (v: number) => void;
  toggleMuted: () => void;
  /** Apply music/effects volume to an HTMLAudioElement */
  applyMusicVolume: (audio: HTMLAudioElement) => void;
  /** Apply TTS volume to an HTMLAudioElement */
  applyTtsVolume: (audio: HTMLAudioElement) => void;
  /** Apply TTS volume to a SpeechSynthesisUtterance */
  applyUtteranceVolume: (utterance: SpeechSynthesisUtterance) => void;
}

const AudioSettingsContext = createContext<AudioSettingsContextValue>({
  musicVolume: 1,
  ttsVolume: 1,
  muted: false,
  effectiveMusicVolume: 1,
  effectiveTtsVolume: 1,
  setMusicVolume: () => {},
  setTtsVolume: () => {},
  toggleMuted: () => {},
  applyMusicVolume: () => {},
  applyTtsVolume: () => {},
  applyUtteranceVolume: () => {},
});

export function useAudioSettings() {
  return useContext(AudioSettingsContext);
}

interface AudioSettingsProviderProps {
  children: React.ReactNode;
  initialMusicVolume?: number;
  initialTtsVolume?: number;
  initialMuted?: boolean;
}

export function AudioSettingsProvider({
  children,
  initialMusicVolume = 1,
  initialTtsVolume = 1,
  initialMuted = false,
}: AudioSettingsProviderProps) {
  const [musicVolume, setMusicVolumeState] = useState(initialMusicVolume);
  const [ttsVolume, setTtsVolumeState] = useState(initialTtsVolume);
  const [muted, setMutedState] = useState(initialMuted);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveMusicVolume = muted ? 0 : musicVolume;
  const effectiveTtsVolume = muted ? 0 : ttsVolume;

  const saveToSupabase = useCallback((updates: { audio_volume?: number; tts_volume?: number; audio_muted?: boolean }) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("profiles").update(updates).eq("id", user.id);
    }, 500);
  }, []);

  const setMusicVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setMusicVolumeState(clamped);
    saveToSupabase({ audio_volume: clamped });
  }, [saveToSupabase]);

  const setTtsVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setTtsVolumeState(clamped);
    saveToSupabase({ tts_volume: clamped });
  }, [saveToSupabase]);

  const toggleMuted = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      saveToSupabase({ audio_muted: next });
      return next;
    });
  }, [saveToSupabase]);

  const applyMusicVolume = useCallback((audio: HTMLAudioElement) => {
    audio.volume = muted ? 0 : musicVolume;
  }, [musicVolume, muted]);

  const applyTtsVolume = useCallback((audio: HTMLAudioElement) => {
    audio.volume = muted ? 0 : ttsVolume;
  }, [ttsVolume, muted]);

  const applyUtteranceVolume = useCallback((utterance: SpeechSynthesisUtterance) => {
    utterance.volume = muted ? 0 : ttsVolume;
  }, [ttsVolume, muted]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <AudioSettingsContext.Provider
      value={{
        musicVolume,
        ttsVolume,
        muted,
        effectiveMusicVolume,
        effectiveTtsVolume,
        setMusicVolume,
        setTtsVolume,
        toggleMuted,
        applyMusicVolume,
        applyTtsVolume,
        applyUtteranceVolume,
      }}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
}
