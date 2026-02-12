export default function ProfileLoading() {
  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="pixel-border p-6">
        <div className="flex items-center gap-6">
          <div className="h-24 w-24 pixel-border animate-shimmer" />
          <div className="space-y-2">
            <div className="h-7 w-48 rounded animate-shimmer" />
            <div className="h-4 w-32 rounded animate-shimmer" />
            <div className="h-3 w-56 rounded animate-shimmer" />
          </div>
        </div>
      </div>

      {/* Adventure Stats */}
      <div>
        <div className="h-5 w-36 rounded animate-shimmer mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="pixel-border p-4 space-y-2">
              <div className="h-5 w-5 mx-auto rounded animate-shimmer" />
              <div className="h-6 w-16 mx-auto rounded animate-shimmer" />
              <div className="h-3 w-12 mx-auto rounded animate-shimmer" />
            </div>
          ))}
        </div>
      </div>

      {/* Academic Performance */}
      <div>
        <div className="h-5 w-44 rounded animate-shimmer mb-3" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="pixel-border p-4 space-y-3">
              <div className="h-4 w-20 rounded animate-shimmer" />
              <div className="h-3 w-32 rounded animate-shimmer" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-3 w-20 rounded animate-shimmer" />
                <div className="h-3 w-20 rounded animate-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time & Activity */}
      <div>
        <div className="h-5 w-32 rounded animate-shimmer mb-3" />
        <div className="pixel-border p-4 space-y-3">
          <div className="h-5 w-28 rounded animate-shimmer" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-24 rounded animate-shimmer" />
              <div className="h-4 w-12 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
