import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck, Users, ArrowRight } from "lucide-react";

const CHARACTER_IMAGES: Record<string, string> = {
  Kaede: "/img/character/Kaede/pcs1.png",
};

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

  const [{ data: profile }, { data: progress }, { data: selectedCharacter }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("user_progress").select("*").eq("user_id", userId),
      supabase
        .from("user_characters")
        .select("*, characters(*)")
        .eq("user_id", userId)
        .eq("is_selected", true)
        .single(),
    ]);

  const progressMap = new Map(
    (progress || []).map((p: { component: number }) => [p.component, p])
  );

  return (
    <div className="space-y-6">
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
          <h1 className="font-pixel text-sm text-primary pixel-glow leading-relaxed">
            Welcome back, {profile?.display_name || "Adventurer"}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Ready to continue your quest?
          </p>
        </div>
      </div>

      {/* Quest Board */}
      <div>
        <h2 className="font-pixel text-[10px] text-foreground mb-4">Quest Board</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {COMPONENTS.map((comp) => {
            const p = progressMap.get(comp.number) as { questions_attempted: number; questions_correct: number } | undefined;
            const accuracy = p && p.questions_attempted > 0
              ? Math.round((p.questions_correct / p.questions_attempted) * 100)
              : 0;

            return (
              <Link key={comp.number} href={comp.path} className="group">
                <Card className="h-full hover:pixel-border-primary transition-all cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Quest {comp.number}
                      </CardTitle>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-sm text-muted-foreground font-retro">{comp.name}</p>
                    <p className="text-xs text-muted-foreground">{comp.chinese}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>{p?.questions_attempted || 0} attempted</span>
                        <span className={getAccuracyColor(accuracy)}>{accuracy}%</span>
                      </div>
                      <Progress value={accuracy} className="h-3" />
                      <Button className="w-full" size="sm">
                        Start Quest
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-4">
        <Link href="/mock-exam">
          <Button variant="outline">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Final Exam
          </Button>
        </Link>
        <Link href="/characters">
          <Button variant="outline">
            <Users className="h-4 w-4 mr-2" />
            Party
          </Button>
        </Link>
      </div>
    </div>
  );
}
