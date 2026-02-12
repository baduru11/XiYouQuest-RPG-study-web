export default function MainLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded animate-shimmer" />
      <div className="h-4 w-72 rounded animate-shimmer" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 pixel-border animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
