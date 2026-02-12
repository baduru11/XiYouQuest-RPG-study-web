import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AFFECTION_LEVELS } from "@/types/gamification";
import { getAffectionLevel } from "@/lib/gamification/xp";
import { CharacterActions } from "./character-actions";
import { Lock, Heart, Sparkles } from "lucide-react";

import { CHARACTER_IMAGES } from "@/lib/character-images";

export default async function CharactersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  // Fetch all data in parallel
  const [{ data: characters }, { data: userCharacters }, { data: profile }] =
    await Promise.all([
      supabase
        .from("characters")
        .select(`
          *,
          character_expressions (*),
          character_skins (*)
        `)
        .order("is_default", { ascending: false }),
      supabase.from("user_characters").select("*").eq("user_id", userId),
      supabase.from("profiles").select("total_xp").eq("id", userId).single(),
    ]);

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
        <h1 className="font-pixel text-base text-primary pixel-glow">Characters</h1>
        <p className="text-muted-foreground mt-1">
          Choose your study companion. Unlock new characters with XP!
        </p>
      </div>

      {/* XP display badge */}
      <div className="inline-flex items-center gap-2 pixel-border bg-accent/50 px-4 py-2">
        <Sparkles className="h-4 w-4 text-yellow-600" />
        <span className="text-sm">Your XP: <span className="font-bold text-foreground">{totalXP}</span></span>
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
              className={`relative hover:pixel-border-primary transition-all cursor-pointer ${
                isSelected ? "pixel-border-primary" : ""
              }`}
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
                {/* Character image */}
                <div className="relative h-48 w-full pixel-border bg-muted overflow-hidden">
                  {(character.image_url || CHARACTER_IMAGES[character.name]) ? (
                    <Image
                      src={character.image_url || CHARACTER_IMAGES[character.name]}
                      alt={character.name}
                      fill
                      className={`object-contain transition-all duration-300 ${
                        !isUnlocked ? "blur-[2px] brightness-50" : ""
                      }`}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {character.name}
                    </div>
                  )}

                  {/* Locked overlay */}
                  {!isUnlocked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60">
                      <Lock className="h-8 w-8 text-muted-foreground mb-1" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {character.unlock_cost_xp} XP to unlock
                      </span>
                    </div>
                  )}
                </div>

                {/* Affection level display (unlocked only) */}
                {isUnlocked && (
                  <div className="bg-accent/50 p-2 pixel-border space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 font-medium">
                        <Heart className="h-3 w-3 text-pink-500" />
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
        <div className="text-center py-12">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground font-medium">No characters available yet</p>
          <p className="text-sm text-muted-foreground mt-1">Check back later for new companions!</p>
        </div>
      )}
    </div>
  );
}
