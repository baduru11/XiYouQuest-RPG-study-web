"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, Target, Flame, Trophy, Crown, User } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface RankingEntry {
  rank: number;
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_level: number;
  value: number;
}

interface LeaderboardClientProps {
  userId: string;
}

type Tab = "xp" | "accuracy" | "streak";
type Scope = "global" | "friends";

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Star }[] = [
  { key: "xp", label: "XP", icon: Star },
  { key: "accuracy", label: "Accuracy", icon: Target },
  { key: "streak", label: "Streak", icon: Flame },
];

function formatValue(value: number, tab: Tab): string {
  switch (tab) {
    case "xp":
      return `${value.toLocaleString()} XP`;
    case "accuracy":
      return `${value}%`;
    case "streak":
      return `${value} days`;
  }
}

export function LeaderboardClient({ userId }: LeaderboardClientProps) {
  const [scope, setScope] = useState<Scope>("global");
  const [tab, setTab] = useState<Tab>("xp");
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [userRank, setUserRank] = useState<{
    rank: number;
    value: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/leaderboard?tab=${tab}&scope=${scope}`
      );
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      setRankings(data.rankings ?? []);
      setUserRank(data.user_rank ?? null);
    } catch {
      const message = "Failed to load leaderboard";
      toast.error(message);
      setError(message);
      setRankings([]);
      setUserRank(null);
    } finally {
      setLoading(false);
    }
  }, [tab, scope]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  const userInRankings = rankings.some((r) => r.id === userId);
  const showUserRankBanner =
    scope === "global" && userRank !== null && !userInRankings;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          Leaderboard
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setScope("global")}
            className={`font-pixel text-[10px] px-4 py-2 cursor-pointer transition-colors ${
              scope === "global"
                ? "pixel-border-primary bg-primary text-primary-foreground pixel-glow"
                : "pixel-border bg-card/60 text-muted-foreground hover:bg-accent/50"
            }`}
          >
            Global
          </button>
          <button
            onClick={() => setScope("friends")}
            className={`font-pixel text-[10px] px-4 py-2 cursor-pointer transition-colors ${
              scope === "friends"
                ? "pixel-border-primary bg-primary text-primary-foreground pixel-glow"
                : "pixel-border bg-card/60 text-muted-foreground hover:bg-accent/50"
            }`}
          >
            Friends
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2">
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 font-retro text-lg cursor-pointer transition-colors ${
              tab === key
                ? "pixel-border-primary bg-primary/10 text-primary font-bold"
                : "pixel-border bg-card/60 text-muted-foreground hover:bg-accent/30"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && <LoadingSkeleton />}

      {/* Error State */}
      {!loading && error && (
        <div className="pixel-border bg-destructive/10 p-4 text-center">
          <p className="text-base font-retro text-destructive">{error}</p>
          <button
            onClick={fetchLeaderboard}
            className="mt-2 px-4 py-1 pixel-border bg-card/60 font-retro text-base text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && rankings.length === 0 && (
        <EmptyState scope={scope} />
      )}

      {!loading && !error && rankings.length > 0 && (
        <>
          {/* Top 3 Podium */}
          <Podium entries={top3} tab={tab} />

          {/* Rows 4+ */}
          {rest.length > 0 && (
            <div className="space-y-2">
              {rest.map((entry, index) => (
                <RankRow
                  key={entry.id}
                  entry={entry}
                  tab={tab}
                  isCurrentUser={entry.id === userId}
                  isEven={index % 2 === 0}
                />
              ))}
            </div>
          )}

          {/* Your Rank Banner */}
          {showUserRankBanner && (
            <div className="pixel-border-primary bg-card/90 p-4 mt-4 animate-fade-in-up">
              <p className="font-retro text-muted-foreground text-center mb-3">
                &middot; &middot; &middot; &middot; &middot;
              </p>
              <div className="flex items-center gap-3">
                <span className="font-pixel text-xs text-primary">
                  #{userRank.rank}
                </span>
                <span className="font-retro text-lg font-bold text-foreground flex-1">
                  Your Rank
                </span>
                <span className="font-retro text-lg font-bold text-primary">
                  {formatValue(userRank.value, tab)}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Podium                                                             */
/* ------------------------------------------------------------------ */

function Podium({
  entries,
  tab,
}: {
  entries: RankingEntry[];
  tab: Tab;
}) {
  if (entries.length === 0) return null;

  // Build the visual order: [2nd, 1st, 3rd]
  const orderedEntries: (RankingEntry | null)[] = [];

  if (entries.length >= 2) {
    orderedEntries.push(entries[1]); // 2nd
  } else {
    orderedEntries.push(null);
  }

  orderedEntries.push(entries[0]); // 1st always present

  if (entries.length >= 3) {
    orderedEntries.push(entries[2]); // 3rd
  } else {
    orderedEntries.push(null);
  }

  return (
    <div className="flex items-end justify-center gap-4 py-4">
      {orderedEntries.map((entry, index) => {
        if (!entry) return null;

        // index 0 = 2nd place, index 1 = 1st place, index 2 = 3rd place
        const place = index === 0 ? 2 : index === 1 ? 1 : 3;
        return (
          <PodiumCard key={entry.id} entry={entry} place={place} tab={tab} />
        );
      })}
    </div>
  );
}

function PodiumCard({
  entry,
  place,
  tab,
}: {
  entry: RankingEntry;
  place: 1 | 2 | 3;
  tab: Tab;
}) {
  const widthClass = place === 1 ? "w-36" : "w-32";
  const minHeightClass =
    place === 1
      ? "min-h-[13rem]"
      : place === 2
        ? "min-h-[10.5rem]"
        : "min-h-[9.5rem]";
  const bgClass =
    place === 1
      ? "bg-amber-100/80"
      : place === 2
        ? "bg-slate-100/80"
        : "bg-orange-100/80";

  return (
    <div
      className={`pixel-border ${widthClass} ${minHeightClass} ${bgClass} flex flex-col items-center justify-center gap-2 p-3`}
    >
      {/* Trophy / Crown */}
      {place === 1 ? (
        <div className="animate-pixel-pulse">
          <Crown className="text-pixel-gold h-8 w-8" />
        </div>
      ) : (
        <Trophy
          className={`h-6 w-6 ${place === 2 ? "text-pixel-blue" : "text-pixel-amber"}`}
        />
      )}

      {/* Avatar */}
      <div className="h-12 w-12 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {entry.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar_url}
            alt={entry.display_name || "User avatar"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <User className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      {/* Display Name */}
      <p className="font-retro text-lg font-bold text-foreground truncate max-w-[7rem] text-center">
        {entry.display_name}
      </p>

      {/* Level Badge */}
      <span className="text-sm font-retro text-amber-700 bg-amber-100 px-1.5 py-0.5">
        Lv.{entry.current_level}
      </span>

      {/* Stat Value */}
      <span className="font-pixel text-xs text-primary">
        {tab === "streak" ? (
          <span className="flex items-center gap-1">
            <Flame className="h-3 w-3" />
            {entry.value} days
          </span>
        ) : tab === "accuracy" ? (
          `${entry.value}%`
        ) : (
          `${entry.value.toLocaleString()} XP`
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rank Row (4+)                                                      */
/* ------------------------------------------------------------------ */

function RankRow({
  entry,
  tab,
  isCurrentUser,
  isEven,
}: {
  entry: RankingEntry;
  tab: Tab;
  isCurrentUser: boolean;
  isEven: boolean;
}) {
  const bgClass = isEven ? "bg-card/60" : "bg-accent/20";
  const highlightClass = isCurrentUser ? "ring-2 ring-primary/50 bg-primary/5" : "";

  return (
    <div
      className={`pixel-border ${bgClass} ${highlightClass} flex items-center gap-3 p-3`}
    >
      {/* Rank */}
      <span className="font-pixel text-[10px] text-muted-foreground w-8 text-center">
        {entry.rank}
      </span>

      {/* Avatar */}
      <div className="h-8 w-8 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {entry.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar_url}
            alt={entry.display_name || "User avatar"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <User className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Name + Level */}
      <div className="flex-1 min-w-0">
        <p className="font-retro text-lg font-bold text-foreground truncate">
          {entry.display_name}
        </p>
        <span className="text-sm font-retro text-amber-700 bg-amber-100 px-1.5 py-0.5">
          Lv.{entry.current_level}
        </span>
      </div>

      {/* Stat Value */}
      <div className="flex items-center gap-2 shrink-0">
        {tab === "accuracy" && (
          <Progress
            value={entry.value}
            className="h-2 w-16 [&>[data-slot=progress-indicator]]:bg-pixel-green"
          />
        )}
        {tab === "streak" && (
          <Flame className="h-4 w-4 text-pixel-gold" />
        )}
        <span className="font-retro text-lg font-bold text-primary">
          {tab === "xp"
            ? entry.value.toLocaleString()
            : tab === "accuracy"
              ? `${entry.value}%`
              : entry.value}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({ scope }: { scope: Scope }) {
  return (
    <div className="pixel-border bg-card/60 p-8 text-center">
      <Trophy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <p className="font-retro text-lg text-muted-foreground">
        {scope === "global"
          ? "No rankings yet \u2014 start practicing!"
          : "No friends to compare with \u2014 add some friends first!"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Podium shimmer */}
      <div className="flex items-end justify-center gap-4 py-4">
        <div className="h-40 w-32 pixel-border animate-shimmer" />
        <div className="h-52 w-36 pixel-border animate-shimmer" />
        <div className="h-36 w-32 pixel-border animate-shimmer" />
      </div>

      {/* Row shimmers */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 pixel-border">
            <div className="h-6 w-6 rounded animate-shimmer" />
            <div className="h-8 w-8 rounded-sm animate-shimmer" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-32 rounded animate-shimmer" />
              <div className="h-3 w-16 rounded animate-shimmer" />
            </div>
            <div className="h-4 w-20 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
