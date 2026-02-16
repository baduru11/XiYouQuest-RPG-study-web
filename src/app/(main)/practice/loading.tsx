function CardSkeleton() {
  return (
    <div className="pixel-border p-4 space-y-3">
      <div className="h-5 w-40 rounded animate-shimmer" />
      <div className="h-4 w-24 rounded animate-shimmer" />
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded animate-shimmer" />
        <div className="h-3 w-16 rounded animate-shimmer" />
      </div>
      <div className="h-2 w-full rounded animate-shimmer" />
      <div className="h-9 w-full rounded animate-shimmer" />
    </div>
  );
}

export default function PracticeLoading() {
  return (
    <div className="space-y-8">
      <div className="h-5 w-32 rounded animate-shimmer" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="h-5 w-48 rounded animate-shimmer" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
