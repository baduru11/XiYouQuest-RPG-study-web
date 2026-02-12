import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Users, ArrowRight } from "lucide-react";

import { CHARACTER_IMAGES } from "@/lib/character-images";

const COMPONENTS = [
  { number: 1, name: "Monosyllabic Characters", chinese: "\u8BFB\u5355\u97F3\u8282\u5B57\u8BCD", path: "/component-1" },
  { number: 2, name: "Multisyllabic Words", chinese: "\u8BFB\u591A\u97F3\u8282\u8BCD\u8BED", path: "/component-2" },
  { number: 3, name: "Judgment", chinese: "\u9009\u62E9\u5224\u65AD", path: "/component-3" },
  { number: 4, name: "Passage Reading", chinese: "\u6717\u8BFB\u77ED\u6587", path: "/component-4" },
  { number: 5, name: "Prompted Speaking", chinese: "\u547D\u9898\u8BF4\u8BDD", path: "/component-5" },
];

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return "text-pixel-green";
  if (accuracy >= 50) return "text-pixel-gold";
  return "text-pixel-red";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  const [{ data: profile }, { data: progress }, { data: selectedCharacter }, { data: sessions }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("user_progress").select("*").eq("user_id", userId),
      supabase
        .from("user_characters")
        .select("*, characters(*)")
        .eq("user_id", userId)
        .eq("is_selected", true)
        .single(),
      supabase
        .from("practice_sessions")
        .select("component, score")
        .eq("user_id", userId),
    ]);

  const progressMap = new Map(
    (progress || []).map((p: { component: number }) => [p.component, p])
  );

  // Calculate average score per component from practice sessions
  const avgScoreMap = new Map<number, number>();
  if (sessions && sessions.length > 0) {
    const grouped = new Map<number, number[]>();
    for (const s of sessions) {
      const scores = grouped.get(s.component) || [];
      scores.push(s.score);
      grouped.set(s.component, scores);
    }
    for (const [comp, scores] of grouped) {
      avgScoreMap.set(comp, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
    }
  }

  return (
    <div className="space-y-8">
      {/* Greeting Section */}
      <div className="flex items-center gap-6">
        <div className="relative h-32 w-32 pixel-border bg-muted overflow-hidden">
          {(() => {
            const charName = selectedCharacter?.characters?.name;
            const charImage = selectedCharacter?.characters?.image_url || (charName ? CHARACTER_IMAGES[charName] : null);
            return charImage ? (
              <Image
                src={charImage}
                alt={charName || "Character"}
                fill
                className="object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {charName || "No character"}
              </div>
            );
          })()}
        </div>
        <div>
          <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
            Welcome back, {profile?.display_name || "Adventurer"}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Ready to continue your quest?
          </p>
        </div>
      </div>

      {/* Quest Board */}
      <div>
        <h2 className="font-pixel text-sm text-foreground mb-4">Quest Board</h2>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {COMPONENTS.map((comp) => {
            const p = progressMap.get(comp.number) as { questions_attempted: number } | undefined;
            const avgScore = avgScoreMap.get(comp.number) || 0;
            const attempts = p?.questions_attempted || 0;

            return (
              <Link key={comp.number} href={comp.path} className="group">
                <Card className="h-full hover:pixel-border-primary transition-all cursor-pointer">
                  <CardContent className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-2xl font-bold leading-none">
                        Quest {comp.number}
                      </CardTitle>
                      <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-lg text-muted-foreground font-retro leading-none mt-1">{comp.name}</p>
                    <p className="text-base text-muted-foreground leading-none mt-0.5">{comp.chinese}</p>
                    <div className="flex items-center justify-between text-lg font-medium mt-2">
                      <span>{attempts} attempted</span>
                      {attempts > 0 && (
                        <span className={getAccuracyColor(avgScore)}>avg {avgScore}%</span>
                      )}
                    </div>
                    <Button className="w-full text-base mt-2" size="sm">
                      Start Quest
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-5">
        <Link href="/mock-exam">
          <Button variant="outline">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Mock Exam
          </Button>
        </Link>
        <Link href="/characters">
          <Button variant="outline">
            <Users className="h-4 w-4 mr-2" />
            Character
          </Button>
        </Link>
      </div>
    </div>
  );
}
