import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import {
  Swords,
  BookOpen,
  ClipboardCheck,
  Trophy,
  Users,
  UserCircle,
  ArrowRight,
} from "lucide-react";
import { CHARACTER_IMAGES } from "@/lib/character-images";

const MENU_ITEMS = [
  {
    href: "/practice",
    icon: BookOpen,
    label: "Practice Session",
    description: "Train all 5 PSC components + supplementary drills",
  },
  {
    href: "/mock-exam",
    icon: ClipboardCheck,
    label: "Mock Exam",
    description: "Full 5-component exam simulation",
  },
  {
    href: "/leaderboard",
    icon: Trophy,
    label: "Leaderboard",
    description: "See how you rank",
  },
  {
    href: "/characters",
    icon: Users,
    label: "Characters",
    description: "Gallery, unlocks, and affection",
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  const [{ data: profile }, { data: selectedCharacter }, { count: pendingCount }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", userId).single(),
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

  const charName = selectedCharacter?.characters?.name;
  const charImage = selectedCharacter?.characters?.image_url || (charName ? CHARACTER_IMAGES[charName] : null);

  return (
    <div className="mx-auto max-w-2xl space-y-3 py-6">
      {/* Greeting with character */}
      <div className="flex items-center gap-5 py-4">
        <div className="relative h-24 w-24 pixel-border bg-muted overflow-hidden shrink-0">
          {charImage ? (
            <Image
              src={charImage}
              alt={charName || "Character"}
              fill
              className="object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {charName || "?"}
            </div>
          )}
        </div>
        <div>
          <h1 className="font-pixel text-xl text-primary pixel-glow leading-relaxed">
            Welcome back, {profile?.display_name || "Adventurer"}!
          </h1>
          <p className="text-lg text-muted-foreground mt-1">
            Ready to continue your quest?
          </p>
        </div>
      </div>

      {/* Main Quest — coming soon */}
      <div className="pixel-border bg-card px-5 py-3 opacity-50 cursor-not-allowed">
        <div className="flex items-center gap-5">
          <Swords className="h-8 w-8 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-pixel text-sm text-muted-foreground leading-relaxed">
              Main Quest
            </p>
            <p className="text-base text-muted-foreground">Story-driven campaign</p>
          </div>
          <span className="shrink-0 text-xs font-pixel px-3 py-1.5 pixel-border bg-muted text-muted-foreground">
            Coming Soon
          </span>
        </div>
      </div>

      {/* Menu tiles */}
      {MENU_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="group block">
          <div className="pixel-border bg-card px-5 py-3 hover:pixel-border-primary transition-all">
            <div className="flex items-center gap-5">
              <item.icon className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-pixel text-sm text-foreground leading-relaxed">
                  {item.label}
                </p>
                <p className="text-base text-muted-foreground">{item.description}</p>
              </div>
              <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </Link>
      ))}

      {/* Profile / Social row */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/profile" className="group block">
          <div className="pixel-border bg-card px-5 py-3 hover:pixel-border-primary transition-all flex items-center gap-5">
            <UserCircle className="h-8 w-8 text-primary shrink-0" />
            <p className="font-pixel text-sm text-foreground leading-relaxed">Profile</p>
          </div>
        </Link>
        <Link href="/social" className="group block">
          <div className="pixel-border bg-card px-5 py-3 hover:pixel-border-primary transition-all flex items-center gap-5">
            <Users className="h-8 w-8 text-primary shrink-0" />
            <p className="font-pixel text-sm text-foreground leading-relaxed">Social</p>
            {(pendingCount ?? 0) > 0 && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
                {pendingCount}
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
