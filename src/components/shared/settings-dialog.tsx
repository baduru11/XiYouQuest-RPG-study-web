"use client";

import { Music, Volume2, VolumeX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useAudioSettings } from "@/components/shared/audio-settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { musicVolume, ttsVolume, muted, setMusicVolume, setTtsVolume, toggleMuted } = useAudioSettings();

  const musicPercent = Math.round(musicVolume * 100);
  const ttsPercent = Math.round(ttsVolume * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm pixel-border">
        <DialogHeader>
          <DialogTitle className="font-pixel text-sm">Settings</DialogTitle>
          <DialogDescription className="font-retro text-base">
            Adjust audio volume levels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Global mute */}
          <div className="flex items-center justify-between">
            <span className="font-retro text-base font-bold">Audio</span>
            <button
              onClick={toggleMuted}
              className="flex items-center gap-2 px-3 py-1.5 pixel-border bg-card hover:bg-accent transition-colors text-sm font-retro"
              aria-label={muted ? "Unmute all" : "Mute all"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {muted ? "Muted" : "On"}
            </button>
          </div>

          {/* Music / Effects volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-muted-foreground" />
                <span className="font-retro text-sm">Music / Effects</span>
              </div>
              <span className="font-pixel text-xs text-muted-foreground">
                {muted ? "Muted" : `${musicPercent}%`}
              </span>
            </div>
            <Slider
              value={[muted ? 0 : musicPercent]}
              onValueChange={([val]) => {
                if (muted && val > 0) toggleMuted();
                setMusicVolume(val / 100);
              }}
              max={100}
              step={1}
              aria-label="Music and effects volume"
            />
          </div>

          {/* TTS voice volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-retro text-sm">Character Voice</span>
              </div>
              <span className="font-pixel text-xs text-muted-foreground">
                {muted ? "Muted" : `${ttsPercent}%`}
              </span>
            </div>
            <Slider
              value={[muted ? 0 : ttsPercent]}
              onValueChange={([val]) => {
                if (muted && val > 0) toggleMuted();
                setTtsVolume(val / 100);
              }}
              max={100}
              step={1}
              aria-label="Character voice volume"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
