"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Swords,
  BookOpen,
  ClipboardCheck,
  Trophy,
  Users,
  UserCircle,
  LogOut,
  ArrowRight,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MENU_ITEMS = [
  {
    href: "/practice",
    icon: BookOpen,
    label: "Practice Session",
    description: "Train all 5 PSC components",
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

export default function DashboardPage() {
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 py-6">
      {/* Header */}
      <div className="py-4 text-center">
        <h1 className="font-pixel text-3xl text-primary pixel-glow leading-relaxed">
          PSC Quest
        </h1>
        <p className="text-lg text-muted-foreground mt-1">
          Master the Putonghua Proficiency Test
        </p>
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

      {/* Profile / Social / Logout row */}
      <div className="grid grid-cols-3 gap-4">
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
          </div>
        </Link>
        <button onClick={() => setLogoutOpen(true)} className="group block w-full text-left">
          <div className="pixel-border bg-card px-5 py-3 hover:pixel-border-primary transition-all flex items-center gap-5">
            <LogOut className="h-8 w-8 text-destructive shrink-0" />
            <p className="font-pixel text-sm text-destructive leading-relaxed">Logout</p>
          </div>
        </button>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save & Quit?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress is saved. You can sign back in anytime to continue your quest.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>
              Quit Game
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
