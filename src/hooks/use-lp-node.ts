"use client";

import { useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithRetry } from "@/lib/fetch-retry";

/**
 * Hook for practice sessions launched from the learning path.
 * Reads `lpNode` from search params. When a session completes,
 * calls /api/learning/node/complete and navigates back.
 */
export function useLpNode() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lpNodeId = searchParams.get("lpNode");
  const completedRef = useRef(false);

  const completeLpNode = useCallback(
    async (score: number) => {
      if (!lpNodeId || completedRef.current) return;
      completedRef.current = true;

      try {
        await fetchWithRetry("/api/learning/node/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: lpNodeId,
            score: Math.round(score),
            xpEarned: Math.round(score * 0.5),
          }),
        });
      } catch (err) {
        console.error("Failed to complete LP node:", err);
      }

      router.push("/learning-path");
    },
    [lpNodeId, router],
  );

  return { lpNodeId, completeLpNode };
}
