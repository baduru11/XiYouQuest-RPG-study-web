import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const COMPONENTS = [
  { number: 1, name: "Monosyllabic Characters", chinese: "读单音节字词", path: "/component-1" },
  { number: 2, name: "Multisyllabic Words", chinese: "读多音节词语", path: "/component-2" },
  { number: 3, name: "Judgment", chinese: "选择判断", path: "/component-3" },
  { number: 4, name: "Passage Reading", chinese: "朗读短文", path: "/component-4" },
  { number: 5, name: "Prompted Speaking", chinese: "命题说话", path: "/component-5" },
];

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return "text-pixel-green";
  if (accuracy >= 50) return "text-pixel-gold";
  return "text-pixel-red";
}

export default async function PracticePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  const [{ data: progress }, { data: sessions }] =
    await Promise.all([
      supabase.from("user_progress").select("*").eq("user_id", userId),
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
      <h1 className="font-pixel text-sm text-foreground">Quest Board</h1>
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
  );
}
