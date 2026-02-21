import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AFFECTION_LEVELS } from "@/types/gamification";
import { getAffectionLevel } from "@/lib/gamification/xp";
import { CharacterActions } from "./character-actions";
import { Lock, Heart, Sparkles, Swords } from "lucide-react";
import { STAGE_CONFIGS } from "@/lib/quest/stage-config";

import { CHARACTER_IMAGES } from "@/lib/character-images";

export default async function CharactersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user!.id;

  // Fetch all data in parallel
  const [{ data: characters }, { data: userCharacters }, , { data: questProgress }] =
    await Promise.all([
      supabase
        .from("characters")
        .select(`
          *,
          character_expressions (*),
          character_skins (*)
        `)
        .order("is_default", { ascending: false })
        .order("unlock_stage", { ascending: true, nullsFirst: true }),
      supabase.from("user_characters").select("*").eq("user_id", userId),
      supabase.from("profiles").select("total_xp").eq("id", userId).single(),
      supabase.from("quest_progress").select("stage, is_cleared").eq("user_id", userId),
    ]);

  const clearedStages = new Set(
    (questProgress ?? [])
      .filter((p: { is_cleared: boolean }) => p.is_cleared)
      .map((p: { stage: number }) => p.stage)
  );

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
          Choose your study companion. Unlock new characters by clearing quest stages!
        </p>
      </div>

      {/* Quest progress hint */}
      <div className="inline-flex items-center gap-2 pixel-border bg-accent/50 px-4 py-2">
        <Swords className="h-4 w-4 text-amber-600" />
        <span className="text-sm">Unlock companions by progressing through the <span className="font-bold text-foreground">Main Quest</span></span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(characters || []).map((character: {
          id: string;
          name: string;
          personality_description: string;
          image_url: string;
          unlock_cost_xp: number;
          unlock_stage: number | null;
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
          const stageCleared = character.unlock_stage ? clearedStages.has(character.unlock_stage) : true;
          const stageName = character.unlock_stage ? STAGE_CONFIGS[character.unlock_stage as keyof typeof STAGE_CONFIGS]?.name : null;

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
                    {!isUnlocked && character.unlock_stage && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Swords className="h-3 w-3" />
                        Stage {character.unlock_stage}
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
                      <span className="text-xs font-medium text-muted-foreground text-center px-2">
                        {character.unlock_stage
                          ? `Clear Stage ${character.unlock_stage}: ${stageName}`
                          : "Complete the tutorial"}
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
                  unlockStage={character.unlock_stage}
                  stageCleared={stageCleared}
                  stageName={stageName}
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
