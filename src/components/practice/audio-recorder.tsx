"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MicOff } from "lucide-react";
import { encodeWAV } from "@/lib/audio-utils";

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onRecordingStart?: () => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecordingComplete, onRecordingStart, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [volume, setVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Animate volume meter from analyser
  const updateVolume = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);

    // Compute RMS
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    // Scale to 0-1 range (typical speech RMS is 0.02-0.3)
    const normalized = Math.min(1, rms / 0.3);
    setVolume(normalized);

    animFrameRef.current = requestAnimationFrame(updateVolume);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close();
      }
      audioContextRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Analyser for volume visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // ScriptProcessor for PCM capture (4096 buffer, mono in, mono out)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy the Float32Array since it gets reused
        chunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      // ScriptProcessor requires connection to destination to fire events,
      // but we mute the output to prevent mic audio playing through speakers (feedback loop)
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      setIsRecording(true);
      setPermissionDenied(false);
      onRecordingStart?.();

      // Start volume animation
      animFrameRef.current = requestAnimationFrame(updateVolume);
    } catch {
      setPermissionDenied(true);
    }
  }, [updateVolume, onRecordingStart]);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    // Stop volume animation
    cancelAnimationFrame(animFrameRef.current);
    setVolume(0);

    // Close audio context (stops processor)
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }

    // Stop mic stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Concatenate all chunks into a single Float32Array
    const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];

    // Encode as WAV and pass up
    const wavBlob = encodeWAV(merged, 16000);
    onRecordingComplete(wavBlob);

    setIsRecording(false);
  }, [isRecording, onRecordingComplete]);

  if (permissionDenied) {
    return (
      <div className="text-center space-y-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <MicOff className="h-8 w-8 mx-auto text-destructive" />
        <p className="text-sm font-medium text-destructive">
          Microphone access is required
        </p>
        <p className="text-xs text-muted-foreground">
          Please allow microphone access in your browser settings, then try again.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setPermissionDenied(false);
            startRecording();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled}
        variant={isRecording ? "destructive" : "default"}
        size="lg"
        className="min-w-[140px]"
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {isRecording && (
          <span className="relative mr-2 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        )}
        {isRecording ? "Stop Recording" : "Start Recording"}
      </Button>

      {/* Volume visualization */}
      {isRecording && (
        <div className="flex items-end gap-[3px] h-8">
          {Array.from({ length: 20 }).map((_, i) => {
            // Create a bar pattern that responds to volume
            const barActive = (i + 1) / 20 <= volume;
            const barColor = barActive
              ? volume > 0.7
                ? "#ef4444"
                : volume > 0.4
                ? "#eab308"
                : "#22c55e"
              : "#d1d5db";
            return (
              <div
                key={i}
                className="w-1.5 rounded-full transition-all duration-75"
                style={{
                  height: barActive
                    ? `${Math.max(4, volume * 32)}px`
                    : "4px",
                  backgroundColor: barColor,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
