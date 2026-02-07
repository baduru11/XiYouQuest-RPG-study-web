"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecordingComplete(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setPermissionDenied(false);
    } catch {
      setPermissionDenied(true);
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  if (permissionDenied) {
    return (
      <div className="text-center space-y-2">
        <p className="text-sm text-red-500">
          Microphone access is required for pronunciation practice.
        </p>
        <p className="text-xs text-muted-foreground">
          Please allow microphone access in your browser settings.
        </p>
        <Button size="sm" onClick={() => setPermissionDenied(false)}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled}
      variant={isRecording ? "destructive" : "default"}
      size="lg"
      className="min-w-[140px]"
    >
      {isRecording ? "Stop Recording" : "Start Recording"}
    </Button>
  );
}
