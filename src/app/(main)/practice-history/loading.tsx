export default function PracticeHistoryLoading() {
  return (
    <div className="space-y-4">
      <div>
        <div className="h-7 w-64 rounded animate-shimmer" />
        <div className="h-4 w-full max-w-96 rounded animate-shimmer mt-2" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-2">
            <div className="h-4 w-20 rounded animate-shimmer" />
            <div className="h-8 w-16 rounded animate-shimmer" />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="pixel-border p-4 sm:p-6 space-y-4">
        <div className="h-5 w-40 rounded animate-shimmer" />
        <div className="h-48 w-full rounded animate-shimmer" />
      </div>

      {/* Session list placeholder */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-16 rounded animate-shimmer" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 h-16 animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
