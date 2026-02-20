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
    const newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
      type: 'mock_exam_complete',
    });
    return NextResponse.json({ newAchievements });
  } catch (err) {
    console.error("Mock exam achievement error:", err);
    return NextResponse.json({ newAchievements: [] });
  }
}
