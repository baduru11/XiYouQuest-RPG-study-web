import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavbarClient } from "@/components/shared/navbar-client";
import { ContentWrapper } from "@/components/shared/content-wrapper";
import { AchievementToastProvider } from "@/components/shared/achievement-toast";
import { AudioSettingsProvider } from "@/components/shared/audio-settings";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("total_xp, display_name, avatar_url, audio_volume, tts_volume, audio_muted")
      .eq("id", user.id)
      .single(),
    supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .eq("addressee_id", user.id)
      .eq("status", "pending"),
  ]);

  return (
    <AudioSettingsProvider
      initialMusicVolume={profile?.audio_volume ?? 1}
      initialTtsVolume={profile?.tts_volume ?? 1}
      initialMuted={profile?.audio_muted ?? false}
    >
      <AchievementToastProvider>
        <div className="min-h-screen">
          <NavbarClient
            totalXP={profile?.total_xp ?? 0}
            displayName={profile?.display_name ?? null}
            avatarUrl={profile?.avatar_url ?? null}
            pendingRequestCount={pendingCount ?? 0}
          />
          <main className="mx-auto max-w-screen-2xl px-4 lg:px-6">
            <ContentWrapper>{children}</ContentWrapper>
          </main>
        </div>
      </AchievementToastProvider>
    </AudioSettingsProvider>
  );
}
