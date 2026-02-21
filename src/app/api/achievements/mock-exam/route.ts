import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Verify user actually completed all 5 exam components within the last 30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: recentSessions } = await supabase
      .from("practice_sessions")
      .select("component")
      .eq("user_id", user.id)
      .gte("created_at", thirtyMinAgo)
      .in("component", [1, 2, 3, 4, 5]);

    const completedComponents = new Set(recentSessions?.map((s) => s.component) ?? []);
    if (completedComponents.size < 5) {
      return NextResponse.json({ newAchievements: [] });
    }

    const newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
      type: 'mock_exam_complete',
    });
    return NextResponse.json({ newAchievements });
  } catch (err) {
    console.error("Mock exam achievement error:", err);
    return NextResponse.json({ newAchievements: [] });
  }
}
