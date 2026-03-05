"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { MicOff } from "lucide-react";
import { encodeWAV } from "@/lib/audio-utils";
import { useBGM } from "@/components/shared/bgm-provider";

const BAR_COUNT = 32;

export interface AudioRecorderHandle {
  stop: () => void;
}

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onRecordingStart?: () => void;
  disabled?: boolean;
}

export const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(function AudioRecorder({ onRecordingComplete, onRecordingStart, disabled }, ref) {
  const { setLearningActive } = useBGM();
  const [isRecording, setIsRecording] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [volume, setVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Expose imperative stop() to parent via ref
  const stopRecordingRef = useRef<() => void>(() => {});

  useImperativeHandle(ref, () => ({
    stop: () => stopRecordingRef.current(),
  }));

  const barsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  // Animate waveform bars from analyser frequency data
  const updateVolumeRef = useRef<() => void>(() => {});
  const updateVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(freqData);

    // Map frequency bins to bars with smoothing
    const binsPerBar = Math.floor(bufferLength / BAR_COUNT);
    const newBars = new Array(BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < binsPerBar; j++) {
        sum += freqData[i * binsPerBar + j];
      }
      const avg = sum / binsPerBar / 255; // normalize to 0-1
      // Smooth with previous frame for less jittery animation
      newBars[i] = barsRef.current[i] * 0.3 + avg * 0.7;
    }
    barsRef.current = newBars;

    // RMS for overall volume level
    const timeData = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(timeData);
    let rmsSum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      rmsSum += v * v;
    }
    setVolume(Math.min(1, Math.sqrt(rmsSum / timeData.length) / 0.3));

    animFrameRef.current = requestAnimationFrame(() => updateVolumeRef.current());
  }, []);
  useEffect(() => { updateVolumeRef.current = updateVolume; }, [updateVolume]);

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
      setLearningActive(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setLearningActive(true);
      onRecordingStart?.();

      // Start volume animation
      animFrameRef.current = requestAnimationFrame(updateVolume);
    } catch {
      setPermissionDenied(true);
    }
  }, [updateVolume, onRecordingStart, setLearningActive]);

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
    setLearningActive(false);
  }, [isRecording, onRecordingComplete, setLearningActive]);

  // Keep ref in sync so useImperativeHandle always calls the latest stopRecording
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

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
        className="min-w-[120px] sm:min-w-[140px]"
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

      {/* Audio waveform visualizer */}
      {isRecording && (
        <AudioVisualizer bars={barsRef.current} volume={volume} />
      )}
    </div>
  );
});

function AudioVisualizer({ bars, volume }: { bars: number[]; volume: number }) {
  const maxH = 40;
  const minH = 3;

  return (
    <div className="flex items-center justify-center gap-[2px] h-12 w-full max-w-full">
      {bars.map((val, i) => {
        // Mirror effect: bars grow from center outward
        const centerDist = Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
        const scale = 1 - centerDist * 0.3;
        const h = Math.max(minH, val * scale * maxH);

        const intensity = val * scale;
        const color =
          intensity > 0.6
            ? "bg-red-500"
            : intensity > 0.3
            ? "bg-yellow-500"
            : volume > 0.05
            ? "bg-green-500"
            : "bg-muted-foreground/30";

        return (
          <div
            key={i}
            className={`w-[5px] rounded-full transition-[height] duration-75 ${color}`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}
