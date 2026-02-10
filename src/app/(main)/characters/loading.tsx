export default function CharactersLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-48 rounded animate-shimmer" />
        <div className="h-4 w-72 rounded animate-shimmer mt-2" />
        <div className="h-3 w-24 rounded animate-shimmer mt-2" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-3">
            <div className="h-5 w-32 rounded animate-shimmer" />
            <div className="h-4 w-48 rounded animate-shimmer" />
            <div className="h-40 w-full rounded animate-shimmer" />
            <div className="h-9 w-full rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
