"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { UnlockedAchievement } from "@/lib/achievements/types";
import { TIER_COLORS } from "@/lib/achievements/types";

interface AchievementToastContextValue {
  showAchievementToasts: (achievements: UnlockedAchievement[]) => void;
}

const AchievementToastContext = createContext<AchievementToastContextValue>({
  showAchievementToasts: () => {},
});

export function useAchievementToast() {
  return useContext(AchievementToastContext);
}

interface ToastItem {
  id: string;
  achievement: UnlockedAchievement;
  visible: boolean;
}

export function AchievementToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const showAchievementToasts = useCallback((achievements: UnlockedAchievement[]) => {
    const newToasts = achievements.map((achievement, i) => {
      counterRef.current += 1;
      const id = `ach-toast-${counterRef.current}`;

      // Stagger appearance
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
      }, i * 300);

      // Auto-dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 400); // cleanup after fade-out
      }, 4000 + i * 300);

      return { id, achievement, visible: false };
    });

    setToasts((prev) => [...prev, ...newToasts]);
  }, []);

  return (
    <AchievementToastContext.Provider value={{ showAchievementToasts }}>
      {children}
      {/* Toast container - fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto pixel-border bg-card p-3 flex items-center gap-3 min-w-[280px] max-w-[340px] transition-all duration-400 ${
              toast.visible
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
            style={{ borderLeftWidth: 4, borderLeftColor: TIER_COLORS[toast.achievement.tier] }}
          >
            <span className="text-2xl shrink-0">{toast.achievement.emoji}</span>
            <div className="min-w-0">
              <p className="font-pixel text-[10px] text-muted-foreground leading-relaxed">
                Achievement Unlocked!
              </p>
              <p className="font-retro text-base font-bold text-foreground truncate">
                {toast.achievement.name}
              </p>
            </div>
          </div>
        ))}
      </div>
    </AchievementToastContext.Provider>
  );
}
