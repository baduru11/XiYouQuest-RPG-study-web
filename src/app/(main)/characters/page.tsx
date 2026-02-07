import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AFFECTION_LEVELS } from "@/types/gamification";
import { getAffectionLevel } from "@/lib/gamification/xp";
import { CharacterActions } from "./character-actions";

export default async function CharactersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all characters with their expressions and skins
  const { data: characters } = await supabase
    .from("characters")
    .select(`
      *,
      character_expressions (*),
      character_skins (*)
    `)
    .order("is_default", { ascending: false });

  // Fetch the user's unlocked characters
  const { data: userCharacters } = await supabase
    .from("user_characters")
    .select("*")
    .eq("user_id", user.id);

  // Fetch user profile for XP
  const { data: profile } = await supabase
    .from("profiles")
    .select("total_xp")
    .eq("id", user.id)
    .single();

  const totalXP = profile?.total_xp ?? 0;

  const userCharacterMap = new Map(
    (userCharacters || []).map((uc: {
      character_id: string;
      is_selected: boolean;
      affection_xp: number;
    }) => [uc.character_id, uc])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Character Gallery</h1>
        <p className="text-muted-foreground">
          Choose your study companion. Unlock new characters with XP!
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Your XP: <span className="font-semibold text-foreground">{totalXP}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(characters || []).map((character: {
          id: string;
          name: string;
          personality_description: string;
          image_url: string;
          unlock_cost_xp: number;
          is_default: boolean;
          character_expressions: Array<{
            expression_name: string;
            image_url: string;
          }>;
          character_skins: Array<{
            id: string;
            skin_name: string;
            image_url: string;
            required_affection_level: number;
          }>;
        }) => {
          const userChar = userCharacterMap.get(character.id) as {
            is_selected: boolean;
            affection_xp: number;
          } | undefined;
          const isUnlocked = !!userChar;
          const isSelected = userChar?.is_selected ?? false;
          const affectionXP = userChar?.affection_xp ?? 0;
          const affection = getAffectionLevel(affectionXP);
          const canAfford = totalXP >= character.unlock_cost_xp;

          // Calculate progress to next affection level
          const currentLevelConfig = AFFECTION_LEVELS[affection.level];
          const nextLevelConfig = AFFECTION_LEVELS[affection.level + 1];
          let affectionProgress = 100;
          if (nextLevelConfig) {
            const xpInLevel = affectionXP - currentLevelConfig.xpRequired;
            const xpNeeded = nextLevelConfig.xpRequired - currentLevelConfig.xpRequired;
            affectionProgress = Math.round((xpInLevel / xpNeeded) * 100);
          }

          return (
            <Card
              key={character.id}
              className={`relative transition-all ${
                !isUnlocked ? "opacity-60 grayscale" : ""
              } ${isSelected ? "ring-2 ring-primary" : ""}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{character.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {character.personality_description}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isSelected && (
                      <Badge variant="default">Active</Badge>
                    )}
                    {!isUnlocked && (
                      <Badge variant="secondary">
                        {character.unlock_cost_xp} XP
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Character image placeholder */}
                <div className="h-40 w-full rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">
                  {character.name}
                </div>

                {/* Affection level display (unlocked only) */}
                {isUnlocked && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">
                        {affection.name} (Lv.{affection.level})
                      </span>
                      {affection.xpToNext !== null && (
                        <span className="text-muted-foreground">
                          {affection.xpToNext} XP to next
                        </span>
                      )}
                    </div>
                    <Progress value={affectionProgress} className="h-1.5" />
                  </div>
                )}

                {/* Action buttons */}
                <CharacterActions
                  characterId={character.id}
                  isUnlocked={isUnlocked}
                  isSelected={isSelected}
                  canAfford={canAfford}
                  unlockCost={character.unlock_cost_xp}
                  userXP={totalXP}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(!characters || characters.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          No characters available yet. Check back later!
        </div>
      )}
    </div>
  );
}
