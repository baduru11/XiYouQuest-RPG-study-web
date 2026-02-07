"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { selectCharacter, unlockCharacter } from "./actions";

interface CharacterActionsProps {
  characterId: string;
  isUnlocked: boolean;
  isSelected: boolean;
  canAfford: boolean;
  unlockCost: number;
  userXP: number;
}

export function CharacterActions({
  characterId,
  isUnlocked,
  isSelected,
  canAfford,
  unlockCost,
  userXP,
}: CharacterActionsProps) {
  const [loading, setLoading] = useState(false);

  async function handleSelect() {
    setLoading(true);
    await selectCharacter(characterId);
    setLoading(false);
  }

  async function handleUnlock() {
    setLoading(true);
    await unlockCharacter(characterId);
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

  if (canAfford) {
    return (
      <Button
        onClick={handleUnlock}
        disabled={loading}
        className="w-full"
        size="sm"
      >
        {loading ? "Unlocking..." : `Unlock (${unlockCost} XP)`}
      </Button>
    );
  }

  return (
    <Button disabled variant="outline" className="w-full" size="sm">
      Need {unlockCost - userXP} more XP
    </Button>
  );
}
