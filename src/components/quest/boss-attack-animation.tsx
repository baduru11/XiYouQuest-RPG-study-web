"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface BossAttackAnimationResult {
  triggerBossAttack: () => void;
  bossAttackFrame: string | null;
  isBossAttacking: boolean;
}

export function useBossAttackAnimation(
  attackFrames: string[],
  onComplete: () => void,
  frameDurationMs = 120,
): BossAttackAnimationResult {
  const [bossAttackFrame, setBossAttackFrame] = useState<string | null>(null);
  const [isBossAttacking, setIsBossAttacking] = useState(false);
  const isBossAttackingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const triggerBossAttack = useCallback(() => {
    if (isBossAttackingRef.current || attackFrames.length === 0) {
      onComplete();
      return;
    }

    cleanup();
    isBossAttackingRef.current = true;
    setIsBossAttacking(true);

    let frameIndex = 0;
    setBossAttackFrame(attackFrames[0]);

    intervalRef.current = setInterval(() => {
      frameIndex++;
      if (frameIndex < attackFrames.length) {
        setBossAttackFrame(attackFrames[frameIndex]);
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // Hold last frame briefly, then complete
        timeoutRef.current = setTimeout(() => {
          setBossAttackFrame(null);
          setIsBossAttacking(false);
          isBossAttackingRef.current = false;
          onComplete();
        }, frameDurationMs);
      }
    }, frameDurationMs);
  }, [attackFrames, onComplete, cleanup, frameDurationMs]);

  return { triggerBossAttack, bossAttackFrame, isBossAttacking };
}
