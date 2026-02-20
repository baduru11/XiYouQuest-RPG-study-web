// src/app/(main)/main-quest/loading.tsx
export default function MainQuestLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 w-48 bg-muted rounded" />
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded pixel-border" />
        ))}
      </div>
    </div>
  );
}
