export default function LeaderboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded animate-shimmer" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded animate-shimmer" />
          <div className="h-9 w-24 rounded animate-shimmer" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-9 w-20 rounded animate-shimmer" />
        <div className="h-9 w-28 rounded animate-shimmer" />
        <div className="h-9 w-24 rounded animate-shimmer" />
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-3 py-4">
        <div className="h-40 w-32 pixel-border animate-shimmer" />
        <div className="h-52 w-36 pixel-border animate-shimmer" />
        <div className="h-36 w-32 pixel-border animate-shimmer" />
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 pixel-border">
            <div className="h-6 w-6 rounded animate-shimmer" />
            <div className="h-8 w-8 rounded-sm animate-shimmer" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-32 rounded animate-shimmer" />
            </div>
            <div className="h-4 w-20 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
