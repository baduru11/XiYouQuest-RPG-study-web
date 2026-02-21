"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { selectCharacter, unlockCharacterByQuest } from "./actions";
import Link from "next/link";

interface CharacterActionsProps {
  characterId: string;
  isUnlocked: boolean;
  isSelected: boolean;
  unlockStage: number | null;
  stageCleared: boolean;
  stageName: string | null;
}

export function CharacterActions({
  characterId,
  isUnlocked,
  isSelected,
  unlockStage,
  stageCleared,
}: CharacterActionsProps) {
  const [loading, setLoading] = useState(false);

  async function handleSelect() {
    setLoading(true);
    await selectCharacter(characterId);
    setLoading(false);
  }

  async function handleUnlock() {
    setLoading(true);
    await unlockCharacterByQuest(characterId);
    setLoading(false);
  }

  if (isSelected) {
    return (
      <Button disabled variant="outline" className="w-full" size="sm">
        Currently Active
      </Button>
    );
  }

  if (isUnlocked) {
    return (
      <Button
        onClick={handleSelect}
        disabled={loading}
        className="w-full"
        size="sm"
      >
        {loading ? "Selecting..." : "Select"}
      </Button>
    );
  }

  // Stage cleared but not yet in user_characters — allow claiming
  if (stageCleared) {
    return (
      <Button
        onClick={handleUnlock}
        disabled={loading}
        className="w-full"
        size="sm"
      >
        {loading ? "Unlocking..." : "Claim Companion"}
      </Button>
    );
  }

  // Stage not cleared yet — show quest link
  return (
    <Button asChild variant="outline" className="w-full" size="sm">
      <Link href="/main-quest">
        {unlockStage ? `Clear Stage ${unlockStage}` : "Start Quest"}
      </Link>
    </Button>
  );
}
