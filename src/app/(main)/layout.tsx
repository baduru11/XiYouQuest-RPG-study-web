import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavbarClient } from "@/components/shared/navbar-client";
import { ContentWrapper } from "@/components/shared/content-wrapper";
import { MusicPlayer } from "@/components/shared/MusicPlayer";

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
      .select("total_xp, display_name, avatar_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .eq("addressee_id", user.id)
      .eq("status", "pending"),
  ]);

  return (
    <div className="min-h-screen">
      <MusicPlayer src="/audio/main-theme.mp3" pathname="/dashboard" />
      <NavbarClient
        totalXP={profile?.total_xp ?? 0}
        displayName={profile?.display_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
        pendingRequestCount={pendingCount ?? 0}
      />
      <main className="mx-auto max-w-screen-2xl px-4 py-3 lg:px-6">
        <ContentWrapper>{children}</ContentWrapper>
      </main>
    </div>
  );
}
