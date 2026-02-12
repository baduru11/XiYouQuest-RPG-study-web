export default function SocialLoading() {
  return (
    <div className="space-y-6">
      {/* Header + Friend Code */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded animate-shimmer" />
        <div className="h-8 w-32 rounded animate-shimmer" />
      </div>

      {/* Search Section */}
      <div className="pixel-border p-4 space-y-3">
        <div className="h-5 w-32 rounded animate-shimmer" />
        <div className="flex gap-4">
          <div className="h-10 flex-1 rounded animate-shimmer" />
          <div className="h-10 w-40 rounded animate-shimmer" />
        </div>
      </div>

      {/* Friends Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-sm animate-shimmer" />
              <div className="space-y-1">
                <div className="h-4 w-24 rounded animate-shimmer" />
                <div className="h-3 w-16 rounded animate-shimmer" />
              </div>
            </div>
            <div className="h-3 w-full rounded animate-shimmer" />
            <div className="h-3 w-3/4 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
