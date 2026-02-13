import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const LeaderboardClient = dynamic(
  () =>
    import("./leaderboard-client").then((m) => m.LeaderboardClient),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-48 rounded animate-shimmer" />
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded animate-shimmer" />
            <div className="h-9 w-24 rounded animate-shimmer" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded animate-shimmer" />
          <div className="h-9 w-28 rounded animate-shimmer" />
          <div className="h-9 w-24 rounded animate-shimmer" />
        </div>
        <div className="flex items-end justify-center gap-3 py-4">
          <div className="h-40 w-32 pixel-border animate-shimmer" />
          <div className="h-52 w-36 pixel-border animate-shimmer" />
          <div className="h-36 w-32 pixel-border animate-shimmer" />
        </div>
      </div>
    ),
  }
);

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LeaderboardClient userId={user!.id} />;
}
