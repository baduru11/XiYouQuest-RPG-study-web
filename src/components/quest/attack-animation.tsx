"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { QUEST_CHARACTERS } from "@/lib/quest/stage-config";

export type AttackState = "idle" | "dashing" | "attacking" | "impact" | "returning";

interface AttackAnimationResult {
  triggerAttack: (score: number) => void;
  attackState: AttackState;
  dashOffset: number;
  currentFrame: string | null;
  damageText: string | null;
  damageType: "damage" | "block" | "miss";
  showDamage: boolean;
  isBossHit: boolean;
}

/** Score threshold matching battle-logic.ts */
const ATTACK_THRESHOLD = 80;

function getDamageDisplay(score: number): { text: string; type: "damage" | "miss"; hit: boolean } {
  if (score >= ATTACK_THRESHOLD) {
    return { text: `${Math.round(score)}`, type: "damage", hit: true };
  }
  return { text: "MISS!", type: "miss", hit: false };
}

export function useAttackAnimation(
  onComplete: (score: number) => void
): AttackAnimationResult {
  const [attackState, setAttackState] = useState<AttackState>("idle");
  const [dashOffset, setDashOffset] = useState(0);
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [damageText, setDamageText] = useState<string | null>(null);
  const [damageType, setDamageType] = useState<"damage" | "block" | "miss">("damage");
  const [showDamage, setShowDamage] = useState(false);
  const [isBossHit, setIsBossHit] = useState(false);
  const scoreRef = useRef(0);

  const attackFrames = useMemo(
    () => QUEST_CHARACTERS["Son Wukong"]?.attackFrames ?? [],
    []
  );

  const doImpact = useCallback((score: number, cb: () => void) => {
    const display = getDamageDisplay(score);

    setAttackState("impact");
    setCurrentFrame(null);
    setDamageText(display.text);
    setDamageType(display.type);
    setShowDamage(true);

    if (display.hit) {
      setIsBossHit(true);
      setTimeout(() => setIsBossHit(false), 400);
    }

    setTimeout(() => {
      setShowDamage(false);
      setDamageText(null);
    }, 800);

    setTimeout(cb, 500);
  }, []);

  const doReturn = useCallback((cb: () => void) => {
    setAttackState("returning");
    setDashOffset(0);
    setTimeout(() => {
      setAttackState("idle");
      cb();
    }, 350);
  }, []);

  const triggerAttack = useCallback(
    (score: number) => {
      if (attackState !== "idle") return;
      scoreRef.current = score;

      // Phase 1: Dash forward (scale with screen width)
      setAttackState("dashing");
      const dashDist = typeof window !== "undefined" ? Math.min(120, window.innerWidth * 0.18) : 120;
      setDashOffset(dashDist);

      setTimeout(() => {
        // Phase 2: Attack frames
        setAttackState("attacking");
        let frameIndex = 0;

        if (attackFrames.length > 0) {
          setCurrentFrame(attackFrames[0]);
          const frameInterval = setInterval(() => {
            frameIndex++;
            if (frameIndex < attackFrames.length) {
              setCurrentFrame(attackFrames[frameIndex]);
            } else {
              clearInterval(frameInterval);
              // Phase 3: Impact → Phase 4: Return
              doImpact(score, () => {
                doReturn(() => onComplete(scoreRef.current));
              });
            }
          }, 200);
        } else {
          // No frames — skip to impact
          doImpact(score, () => {
            doReturn(() => onComplete(scoreRef.current));
          });
        }
      }, 350);
    },
    [attackState, attackFrames, onComplete, doImpact, doReturn]
  );

  return {
    triggerAttack,
    attackState,
    dashOffset,
    currentFrame,
    damageText,
    damageType,
    showDamage,
    isBossHit,
  };
}
