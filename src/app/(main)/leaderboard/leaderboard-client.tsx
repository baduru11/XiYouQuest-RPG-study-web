"use client";

// Placeholder — full implementation in Task 3
export function LeaderboardClient({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
        Leaderboard
      </h1>
      <p className="text-muted-foreground">Loading leaderboard for {userId}...</p>
    </div>
  );
}
