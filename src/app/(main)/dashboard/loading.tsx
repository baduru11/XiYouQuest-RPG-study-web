export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 py-8">
      {/* Header tile */}
      <div className="pixel-border bg-card p-6">
        <div className="mx-auto h-7 w-48 rounded animate-shimmer" />
        <div className="mx-auto h-4 w-64 rounded animate-shimmer mt-2" />
      </div>

      {/* Menu tiles */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="pixel-border bg-card p-4">
          <div className="flex items-center gap-4">
            <div className="h-6 w-6 rounded animate-shimmer shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-36 rounded animate-shimmer" />
              <div className="h-3 w-52 rounded animate-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
