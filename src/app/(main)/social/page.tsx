import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const SocialClient = dynamic(
  () => import("./social-client").then((m) => m.SocialClient),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 rounded animate-shimmer" />
          <div className="h-8 w-32 rounded animate-shimmer" />
        </div>
        <div className="pixel-border p-4 space-y-3">
          <div className="flex gap-4">
            <div className="h-10 flex-1 rounded animate-shimmer" />
            <div className="h-10 w-40 rounded animate-shimmer" />
          </div>
        </div>
      </div>
    ),
  }
);

export default async function SocialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("friend_code")
    .eq("id", user.id)
    .single();

  // Check if user logged in with Discord (has provider_token)
  const { data: { session } } = await supabase.auth.getSession();
  const hasDiscord = !!session?.provider_token;

  return (
    <SocialClient
      userId={user.id}
      friendCode={profile?.friend_code ?? null}
      hasDiscord={hasDiscord}
    />
  );
}
