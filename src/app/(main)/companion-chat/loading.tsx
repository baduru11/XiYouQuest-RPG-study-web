export default function CompanionChatLoading() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 rounded animate-shimmer" />
      <div className="grid gap-4 grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-3">
            <div className="h-24 w-24 mx-auto rounded animate-shimmer" />
            <div className="h-4 w-20 mx-auto rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
