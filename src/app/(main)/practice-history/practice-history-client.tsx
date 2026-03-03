"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  Sparkles,
  Loader2,
  Swords,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { fetchWithRetry } from "@/lib/fetch-retry";

// ---------- Types ----------

interface Session {
  id: string;
  component: number;
  score: number;
  xp_earned: number;
  duration_seconds: number;
  created_at: string;
  characters: { name: string }[] | { name: string } | null;
}

interface Progress {
  component: number;
  questions_attempted: number;
  questions_correct: number;
  best_streak: number;
  total_practice_time_seconds: number;
  last_practiced_at: string;
}

interface QuestProgress {
  stage: number;
  is_cleared: boolean;
  attempts: number;
  best_score: number;
  cleared_at: string | null;
}

interface PracticeHistoryClientProps {
  sessions: Session[];
  progress: Progress[];
  questProgress: QuestProgress[];
}

// ---------- Constants ----------

const COMPONENT_NAMES: Record<number, string> = {
  1: "C1",
  2: "C2",
  3: "C3",
  4: "C4",
  5: "C5",
  6: "C6",
  7: "C7",
};

const COMPONENT_FULL_NAMES: Record<number, string> = {
  1: "Monosyllabic",
  2: "Multisyllabic",
  3: "Vocab & Grammar",
  4: "Passage Reading",
  5: "Prompted Speaking",
  6: "Cantonese Mistakes",
  7: "Polyphonic",
};

const COMPONENT_COLORS: Record<number, string> = {
  1: "hsl(0, 80%, 60%)",
  2: "hsl(30, 80%, 55%)",
  3: "hsl(60, 70%, 45%)",
  4: "hsl(120, 60%, 45%)",
  5: "hsl(200, 70%, 50%)",
  6: "hsl(260, 60%, 55%)",
  7: "hsl(320, 60%, 55%)",
};

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "1", label: "C1" },
  { value: "2", label: "C2" },
  { value: "3", label: "C3" },
  { value: "4", label: "C4" },
  { value: "5", label: "C5" },
  { value: "6", label: "C6" },
  { value: "7", label: "C7" },
];

// ---------- Helpers ----------

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

// ---------- Main Component ----------

export function PracticeHistoryClient({
  sessions,
  progress,
  questProgress,
}: PracticeHistoryClientProps) {
  const [filter, setFilter] = useState("all");
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const [trendPeriod, setTrendPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");

  // ---------- Computed stats ----------

  const stats = useMemo(() => {
    const totalSessions = sessions.length;
    const avgScore =
      totalSessions > 0
        ? Math.round(
            sessions.reduce((sum, s) => sum + s.score, 0) / totalSessions,
          )
        : 0;
    const totalTimeSeconds = progress.reduce(
      (sum, p) => sum + (p.total_practice_time_seconds ?? 0),
      0,
    );
    const totalXP = sessions.reduce((sum, s) => sum + s.xp_earned, 0);
    const bestStreak = Math.max(
      0,
      ...progress.map((p) => p.best_streak ?? 0),
    );

    // Best component by accuracy
    const withAccuracy = progress
      .filter((p) => p.questions_attempted > 0)
      .map((p) => ({
        component: p.component,
        accuracy: Math.round(
          (p.questions_correct / p.questions_attempted) * 100,
        ),
      }))
      .sort((a, b) => b.accuracy - a.accuracy);

    const bestComponent = withAccuracy[0];

    return {
      totalSessions,
      avgScore,
      totalTimeSeconds,
      totalXP,
      bestStreak,
      bestComponent,
    };
  }, [sessions, progress]);

  // ---------- Chart data ----------

  // Aggregate sessions by day: per-component avg + overall avg
  const trendData = useMemo(() => {
    const periodDays = { "7d": 7, "30d": 30, "90d": 90, all: Infinity } as const;
    const days = periodDays[trendPeriod];
    const cutoff = days === Infinity ? 0 : Date.now() - days * 86400000;

    // Group sessions by date string
    const byDay = new Map<
      string,
      { all: number[]; byComp: Map<number, number[]> }
    >();

    for (const s of sessions) {
      if (new Date(s.created_at).getTime() < cutoff) continue;
      const dateKey = new Date(s.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (!byDay.has(dateKey)) {
        byDay.set(dateKey, { all: [], byComp: new Map() });
      }
      const day = byDay.get(dateKey)!;
      day.all.push(s.score);
      if (!day.byComp.has(s.component)) {
        day.byComp.set(s.component, []);
      }
      day.byComp.get(s.component)!.push(s.score);
    }

    const entries = [...byDay.entries()].reverse();
    return entries.map(([date, day]) => {
      const avg = Math.round(
        day.all.reduce((a, b) => a + b, 0) / day.all.length,
      );
      const row: Record<string, string | number | undefined> = {
        date,
        avg,
        sessions: day.all.length,
      };
      for (let c = 1; c <= 7; c++) {
        const scores = day.byComp.get(c);
        row[`c${c}`] = scores
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : undefined;
      }
      return row;
    });
  }, [sessions, trendPeriod]);

  // Compute Y-axis domain from actual data to avoid wasted space
  const yDomain = useMemo<[number, number]>(() => {
    let min = 100;
    let max = 0;
    for (const row of trendData) {
      if (typeof row.avg === "number") {
        min = Math.min(min, row.avg);
        max = Math.max(max, row.avg);
      }
      for (let c = 1; c <= 7; c++) {
        const v = row[`c${c}`];
        if (typeof v === "number") {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    return [Math.max(0, Math.floor(min / 5) * 5 - 5), Math.min(100, Math.ceil(max / 5) * 5 + 5)];
  }, [trendData]);

  // Which components actually have data (to avoid rendering empty lines)
  const activeComponents = useMemo(() => {
    const set = new Set<number>();
    for (const s of sessions) set.add(s.component);
    return [...set].sort();
  }, [sessions]);

  const trendChartConfig: ChartConfig = {
    avg: { label: "Average", color: "#888888" },
    ...Object.fromEntries(
      activeComponents.map((c) => [
        `c${c}`,
        { label: COMPONENT_NAMES[c], color: COMPONENT_COLORS[c] },
      ]),
    ),
  };

  const radarData = useMemo(() => {
    return [1, 2, 3, 4, 5, 6, 7].map((comp) => {
      const p = progress.find((pr) => pr.component === comp);
      const accuracy =
        p && p.questions_attempted > 0
          ? Math.round((p.questions_correct / p.questions_attempted) * 100)
          : 0;
      return {
        component: COMPONENT_NAMES[comp],
        accuracy,
        fullMark: 100,
      };
    });
  }, [progress]);

  const radarChartConfig: ChartConfig = {
    accuracy: { label: "Accuracy %", color: "hsl(var(--primary))" },
  };

  // ---------- Filtered sessions ----------

  const filteredSessions = useMemo(() => {
    if (filter === "all") return sessions;
    return sessions.filter((s) => s.component === Number(filter));
  }, [sessions, filter]);

  const toggleLine = (key: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---------- AI insights ----------

  const generateInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await fetchWithRetry("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progress,
          recentSessions: sessions.slice(0, 20),
          questProgress,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights);
      }
    } catch {
      setInsights(
        "Unable to generate insights at this time. Please try again later.",
      );
    } finally {
      setInsightsLoading(false);
    }
  };

  // ---------- Empty state ----------

  if (sessions.length === 0) {
    return (
      <div className="pixel-border bg-card p-8 text-center space-y-4">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="font-pixel text-sm text-primary">No Practice Yet</h2>
        <p className="text-muted-foreground">
          Complete your first practice session to see your history and analytics
          here.
        </p>
        <Button asChild>
          <Link href="/practice">Start Practicing</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Summary Stats — compact inline */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <div className="pixel-border bg-card px-2 py-1.5">
          <p className="text-sm text-muted-foreground leading-none">Sessions</p>
          <p className="text-2xl font-bold leading-snug">{stats.totalSessions}</p>
        </div>
        <div className="pixel-border bg-card px-2 py-1.5">
          <p className="text-sm text-muted-foreground leading-none">Avg Score</p>
          <p className={`text-2xl font-bold leading-snug ${scoreColor(stats.avgScore)}`}>{stats.avgScore}</p>
        </div>
        <div className="pixel-border bg-card px-2 py-1.5">
          <p className="text-sm text-muted-foreground leading-none">Time</p>
          <p className="text-2xl font-bold leading-snug">{formatDuration(stats.totalTimeSeconds)}</p>
        </div>
        <div className="pixel-border bg-card px-2 py-1.5">
          <p className="text-sm text-muted-foreground leading-none">Total XP</p>
          <p className="text-2xl font-bold leading-snug text-yellow-600">{stats.totalXP}</p>
        </div>
        <div className="pixel-border bg-card px-2 py-1.5">
          <p className="text-sm text-muted-foreground leading-none">Streak</p>
          <p className="text-2xl font-bold leading-snug">{stats.bestStreak}</p>
        </div>
        {stats.bestComponent && (
          <div className="pixel-border bg-card px-2 py-1.5">
            <p className="text-sm text-muted-foreground leading-none">Best</p>
            <p className="text-2xl font-bold leading-snug text-green-600">{COMPONENT_NAMES[stats.bestComponent.component]} {stats.bestComponent.accuracy}%</p>
          </div>
        )}
      </div>

      {/* Section 2: AI Insights */}
      <div className="pixel-border bg-card px-3 py-2 space-y-2">
        {insights ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-pixel text-base text-primary flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Study Insights
              </h2>
              <Button
                size="sm"
                onClick={generateInsights}
                disabled={insightsLoading}
              >
                {insightsLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Refreshing...
                  </>
                ) : (
                  "Refresh"
                )}
              </Button>
            </div>
            <div className="bg-accent/30 rounded-lg px-3 py-2 text-base whitespace-pre-wrap leading-relaxed">
              {insights}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-6 w-6 text-primary shrink-0" />
              <span className="text-2xl font-medium text-muted-foreground">
                Generate AI-powered study insights
              </span>
            </div>
            <Button
              size="sm"
              onClick={generateInsights}
              disabled={insightsLoading}
              className="shrink-0"
            >
              {insightsLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Analyzing...
                </>
              ) : (
                "Generate Analysis"
              )}
            </Button>
          </div>
        )}

        {insightsLoading && !insights && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-4 rounded animate-shimmer"
                style={{ width: `${80 - i * 10}%` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Charts row */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Score Trend Chart */}
        <div className="pixel-border bg-card px-3 py-2 space-y-2 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-pixel text-base text-primary shrink-0">Score Trend</h2>
            <div className="flex items-center gap-1">
              {(["7d", "30d", "90d", "all"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTrendPeriod(p)}
                  className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    trendPeriod === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {p === "all" ? "All" : p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {trendData.length > 0 ? (
            <>
            {/* Toggle pills — click to show/hide lines */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => toggleLine("avg")}
                className={`inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                  hiddenLines.has("avg")
                    ? "border-border bg-transparent text-muted-foreground opacity-50"
                    : "border-foreground/30 bg-foreground/10 text-foreground"
                }`}
              >
                <span
                  className="inline-block w-3.5 border-t-2 border-dotted"
                  style={{ borderColor: hiddenLines.has("avg") ? "currentColor" : "#888888" }}
                />
                Avg
              </button>
              {activeComponents.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleLine(`c${c}`)}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                    hiddenLines.has(`c${c}`)
                      ? "border-border bg-transparent opacity-40"
                      : "border-current/30"
                  }`}
                  style={{
                    color: COMPONENT_COLORS[c],
                    backgroundColor: hiddenLines.has(`c${c}`) ? "transparent" : `color-mix(in srgb, ${COMPONENT_COLORS[c]} 15%, transparent)`,
                  }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: COMPONENT_COLORS[c] }}
                  />
                  {COMPONENT_NAMES[c]}
                </button>
              ))}
            </div>
            <div className="w-full" style={{ height: 200 }}>
              <ChartContainer
                config={trendChartConfig}
                className="h-full w-full"
              >
                <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -15 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => {
                          const item = payload?.[0]?.payload;
                          return item
                            ? `${item.date} (${item.sessions} session${item.sessions > 1 ? "s" : ""})`
                            : "";
                        }}
                      />
                    }
                  />
                  {/* Per-component lines — always mounted, hide via prop */}
                  {activeComponents.map((c) => (
                    <Line
                      key={c}
                      type="monotone"
                      dataKey={`c${c}`}
                      stroke={COMPONENT_COLORS[c]}
                      strokeWidth={1.5}
                      dot={{ r: 2.5 }}
                      connectNulls
                      hide={hiddenLines.has(`c${c}`)}
                    />
                  ))}
                  {/* Average line — always mounted, dotted */}
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="#888888"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: "#888888" }}
                    connectNulls
                    hide={hiddenLines.has("avg")}
                  />
                </LineChart>
              </ChartContainer>
            </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sessions in this period.
            </p>
          )}
        </div>

        {/* Component Breakdown */}
        <div className="pixel-border bg-card px-3 py-2 space-y-2">
          <h2 className="font-pixel text-base text-primary">
            Component Breakdown
          </h2>
            {progress.length > 0 ? (
              <>
                <ChartContainer
                  config={radarChartConfig}
                  className="h-[180px] w-full"
                >
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis
                      dataKey="component"
                      tick={{ fontSize: 13, fontWeight: 600 }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                      tickCount={5}
                    />
                    <Radar
                      name="Accuracy"
                      dataKey="accuracy"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ChartContainer>
                {/* Per-component accuracy bars */}
                <div className="space-y-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((comp) => {
                    const p = progress.find((pr) => pr.component === comp);
                    const accuracy =
                      p && p.questions_attempted > 0
                        ? Math.round(
                            (p.questions_correct / p.questions_attempted) * 100,
                          )
                        : 0;
                    return (
                      <div key={comp} className="flex items-center gap-2">
                        <span
                          className="text-base font-bold w-8 shrink-0"
                          style={{ color: COMPONENT_COLORS[comp] }}
                        >
                          {COMPONENT_NAMES[comp]}
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-accent/40 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${accuracy}%`,
                              backgroundColor: COMPONENT_COLORS[comp],
                              opacity: accuracy > 0 ? 0.8 : 0,
                            }}
                          />
                        </div>
                        <span className="text-base font-bold tabular-nums w-12 text-right">
                          {accuracy > 0 ? `${accuracy}%` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground py-4 text-center">
                Practice different components to see your skill shape.
              </p>
            )}
        </div>
      </div>

      {/* Section 4: Filter Tabs + Session List */}
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {FILTER_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={filter === tab.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(tab.value)}
              className="font-pixel text-sm"
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {filteredSessions.length === 0 ? (
          <div className="pixel-border bg-card p-6 text-center">
            <p className="text-muted-foreground">
              No sessions for this component yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSessions.slice(0, visibleCount).map((session, i) => (
              <div
                key={session.id}
                className={`pixel-border p-3 sm:p-4 flex items-center justify-between gap-3 ${
                  i % 2 === 0 ? "bg-card/60" : "bg-accent/20"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    variant="outline"
                    className="text-base px-2 py-0.5"
                    style={{
                      borderColor: COMPONENT_COLORS[session.component],
                      color: COMPONENT_COLORS[session.component],
                    }}
                  >
                    {COMPONENT_NAMES[session.component]}
                  </Badge>
                  <span className="text-base text-muted-foreground hidden sm:inline">
                    {COMPONENT_FULL_NAMES[session.component]}
                  </span>
                </div>

                <div className="flex items-center gap-3 sm:gap-5">
                  <span className={`text-lg font-bold tabular-nums ${scoreColor(session.score)}`}>
                    {session.score}
                  </span>
                  <span className="text-yellow-600 text-base font-medium">
                    +{session.xp_earned} XP
                  </span>
                  {session.duration_seconds > 0 && (
                    <span className="text-muted-foreground text-base hidden md:inline">
                      {formatDuration(session.duration_seconds)}
                    </span>
                  )}
                  {session.characters && (
                    <span className="text-muted-foreground text-base hidden lg:inline">
                      {Array.isArray(session.characters)
                        ? session.characters[0]?.name
                        : session.characters.name}
                    </span>
                  )}
                  <span className="text-muted-foreground text-base">
                    {timeAgo(session.created_at)}
                  </span>
                </div>
              </div>
            ))}

            {filteredSessions.length > visibleCount && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                Show More ({filteredSessions.length - visibleCount} remaining)
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Section 5: Quest Progress */}
      {questProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-pixel text-base text-primary flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Quest Progress
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {questProgress.map((qp) => (
              <Card
                key={qp.stage}
                className={`pixel-border ${qp.is_cleared ? "border-green-500/50" : ""}`}
              >
                <CardContent className="px-2.5 py-2 text-center space-y-1">
                  <p className="font-pixel text-sm">Stage {qp.stage}</p>
                  <Badge variant={qp.is_cleared ? "default" : "secondary"}>
                    {qp.is_cleared ? "Cleared" : `${qp.attempts} tries`}
                  </Badge>
                  {qp.best_score > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Best: {qp.best_score}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

