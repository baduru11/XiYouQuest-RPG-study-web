import { createClient } from "@/lib/supabase/server";
import { CHARACTER_IMAGES } from "@/lib/character-images";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  const [{ data: profile }, { data: selectedCharacter }, { count: pendingCount }] =
    await Promise.all([
      supabase.from("profiles").select("display_name, total_xp, login_streak").eq("id", userId).single(),
      supabase
        .from("user_characters")
        .select("*, characters(*)")
        .eq("user_id", userId)
        .eq("is_selected", true)
        .single(),
      supabase
        .from("friendships")
        .select("*", { count: "exact", head: true })
        .eq("addressee_id", userId)
        .eq("status", "pending"),
    ]);

  const charName = selectedCharacter?.characters?.name ?? null;
  const charImage = selectedCharacter?.characters?.image_url || (charName ? CHARACTER_IMAGES[charName] : null) || null;

  return (
    <DashboardClient
      displayName={profile?.display_name ?? null}
      totalXP={profile?.total_xp ?? 0}
      loginStreak={profile?.login_streak ?? 0}
      charName={charName}
      charImage={charImage}
      pendingCount={pendingCount ?? 0}
      musicSrc="/audio/main-theme.mp3"
    />
  );
}
