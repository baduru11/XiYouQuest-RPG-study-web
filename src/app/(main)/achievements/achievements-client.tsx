"use client";

import { useState, useEffect } from "react";
import { Trophy, User } from "lucide-react";
import type { Achievement } from "@/types/database";
import { TIER_COLORS, type AchievementTier } from "@/lib/achievements/types";
import { TOTAL_ACHIEVEMENTS } from "@/lib/achievements/definitions";
import { timeAgo } from "@/lib/utils";

interface AchievementsClientProps {
  achievements: Achievement[];
  userAchievements: { achievement_id: string; unlocked_at: string }[];
}

interface FeedEntry {
  unlocked_at: string;
  display_name: string;
  avatar_url: string | null;
  achievement_name: string;
  achievement_emoji: string;
  achievement_tier: string;
  is_self: boolean;
}

const TIER_FILTERS: { label: string; value: AchievementTier | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Common", value: "common" },
  { label: "Uncommon", value: "uncommon" },
  { label: "Rare", value: "rare" },
  { label: "Epic", value: "epic" },
];

export function AchievementsClient({
  achievements,
  userAchievements,
}: AchievementsClientProps) {
  const [filter, setFilter] = useState<AchievementTier | "all">("all");
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Build unlocked set
  const unlockedMap = new Map(
    userAchievements.map((ua) => [ua.achievement_id, ua.unlocked_at])
  );
  const unlockedCount = unlockedMap.size;
  const percentage = Math.round((unlockedCount / TOTAL_ACHIEVEMENTS) * 100);

  // Tier counts
  const tierCounts: Record<AchievementTier, { total: number; unlocked: number }> = {
    common: { total: 0, unlocked: 0 },
    uncommon: { total: 0, unlocked: 0 },
    rare: { total: 0, unlocked: 0 },
    epic: { total: 0, unlocked: 0 },
  };
  for (const a of achievements) {
    const tier = a.tier as AchievementTier;
    tierCounts[tier].total++;
    if (unlockedMap.has(a.id)) tierCounts[tier].unlocked++;
  }

  // Filtered achievements
  const filtered = filter === "all"
    ? achievements
    : achievements.filter((a) => a.tier === filter);

  // Fetch feed on mount
  useEffect(() => {
    fetch("/api/achievements/feed")
      .then((res) => (res.ok ? res.json() : { feed: [] }))
      .then((data) => setFeed(data.feed ?? []))
      .catch(() => setFeed([]))
      .finally(() => setFeedLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="font-pixel text-base text-primary pixel-glow">Achievements</h1>

      {/* Progress Summary */}
      <div className="pixel-border chinese-corner bg-card/60 p-4 text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          <span className="font-pixel text-lg text-foreground">
            {unlockedCount} / {TOTAL_ACHIEVEMENTS}
          </span>
          <span className="font-retro text-lg text-muted-foreground">
            ({percentage}%)
          </span>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {(Object.entries(tierCounts) as [AchievementTier, { total: number; unlocked: number }][]).map(
            ([tier, counts]) => (
              <span
                key={tier}
                className="font-retro text-sm px-2 py-0.5 pixel-border"
                style={{ borderLeftWidth: 3, borderLeftColor: TIER_COLORS[tier] }}
              >
                {counts.unlocked}/{counts.total} {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </span>
            )
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TIER_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-pixel text-[10px] px-3 py-1.5 pixel-border transition-all ${
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent/50 text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Achievement Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((achievement) => {
          const unlocked = unlockedMap.has(achievement.id);
          const unlockedAt = unlockedMap.get(achievement.id);
          return (
            <div
              key={achievement.id}
              className={`pixel-border px-3 py-2.5 transition-all ${
                unlocked ? "bg-card/60" : "bg-card/30 opacity-50 grayscale"
              }`}
              style={{
                borderLeftWidth: 4,
                borderLeftColor: TIER_COLORS[achievement.tier as AchievementTier],
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-4xl leading-none shrink-0">{achievement.emoji}</span>
                <div className="min-w-0">
                  <p className="font-retro text-xl font-bold text-foreground leading-tight truncate">
                    {achievement.name}
                  </p>
                  <p className="font-retro text-lg text-muted-foreground leading-snug">
                    {achievement.description}
                  </p>
                  {unlocked && unlockedAt && (
                    <p className="font-retro text-base text-primary mt-0.5">
                      {timeAgo(unlockedAt)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Friend Activity Feed */}
      <div className="space-y-3">
        <h2 className="font-pixel text-xs text-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Recent Activity
        </h2>

        {feedLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="h-8 w-8 rounded-sm animate-shimmer" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-48 rounded animate-shimmer" />
                  <div className="h-3 w-24 rounded animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!feedLoading && feed.length === 0 && (
          <div className="pixel-border bg-card/60 p-6 text-center">
            <p className="text-base font-retro text-muted-foreground">
              No recent activity &mdash; add friends to see their achievements!
            </p>
          </div>
        )}

        {!feedLoading && feed.length > 0 && (
          <div className="space-y-2">
            {feed.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 pixel-border bg-card/40"
              >
                <div className="h-10 w-10 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {entry.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-retro text-foreground truncate">
                    <span className="font-bold">
                      {entry.is_self ? "You" : entry.display_name}
                    </span>{" "}
                    unlocked {entry.achievement_emoji}{" "}
                    <span className="font-bold">{entry.achievement_name}</span>
                  </p>
                  <p className="text-base font-retro text-muted-foreground">
                    {timeAgo(entry.unlocked_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
