import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/shared/navbar";
import { TooltipProvider } from "@/components/ui/tooltip";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("total_xp")
    .eq("id", user.id)
    .single();

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <Navbar totalXP={profile?.total_xp ?? 0} />
        <main className="mx-auto max-w-7xl p-4">
          <div className="pixel-border bg-card/80 backdrop-blur-sm p-6">
            {children}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
