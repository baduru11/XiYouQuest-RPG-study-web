export default function AchievementsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-48 rounded animate-shimmer" />
      <div className="pixel-border p-4 space-y-3">
        <div className="h-8 w-32 mx-auto rounded animate-shimmer" />
        <div className="h-4 w-64 mx-auto rounded animate-shimmer" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-2">
            <div className="h-8 w-8 rounded animate-shimmer" />
            <div className="h-4 w-20 rounded animate-shimmer" />
            <div className="h-3 w-full rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
