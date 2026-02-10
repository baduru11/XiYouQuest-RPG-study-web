import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookOpen, Mic, Users, Trophy } from "lucide-react";

const FEATURES = [
  {
    icon: BookOpen,
    title: "5 Quests",
    description: "Full PSC exam coverage",
  },
  {
    icon: Mic,
    title: "AI Scoring",
    description: "Real-time pronunciation feedback",
  },
  {
    icon: Users,
    title: "Companions",
    description: "Anime study partners",
  },
  {
    icon: Trophy,
    title: "Level Up",
    description: "XP, unlocks, and rewards",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="animate-fade-in-up text-center space-y-6 max-w-lg pixel-border bg-card p-8">
        <h1 className="font-pixel text-2xl text-primary pixel-glow leading-relaxed">
          PSC Study Companion
        </h1>
        <p className="text-lg text-muted-foreground">
          Master the Putonghua Proficiency Test with AI-powered practice and your personal anime study companion.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login">
            <Button size="lg" className="pixel-border-primary text-base">
              Start Game
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground mt-8">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="p-3 pixel-border hover:pixel-border-primary transition-all cursor-default"
            >
              <feature.icon className="h-5 w-5 mb-1.5 text-primary mx-auto" />
              <p className="font-pixel text-xs text-foreground">{feature.title}</p>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
