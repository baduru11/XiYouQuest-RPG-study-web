import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AchievementsClient } from "./achievements-client";

export default async function AchievementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: allAchievements },
    { data: userAchievements },
  ] = await Promise.all([
    supabase
      .from("achievements")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", user.id),
  ]);

  return (
    <AchievementsClient
      achievements={allAchievements ?? []}
      userAchievements={userAchievements ?? []}
    />
  );
}
