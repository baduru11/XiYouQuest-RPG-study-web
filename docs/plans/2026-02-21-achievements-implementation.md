# Achievement System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Steam-like achievement system with 31 achievements across 4 rarity tiers, toast notifications, an achievement page, and friend activity feed.

**Architecture:** Achievements defined as TypeScript constants (not fetched from DB at runtime). Two new Supabase tables (`achievements` for catalog, `user_achievements` for unlocks). Server-side `checkAndUnlockAchievements()` called from existing API routes returns newly unlocked achievements in API responses. Client shows toasts via a React context provider. Achievement page at `/achievements` with grid + friend feed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (DB + RLS), Tailwind CSS 4, shadcn/ui, lucide-react, sonner (already installed for toasts in root layout).

---

## Task 1: Database Migration — Create Tables + Seed Data

**Files:**
- Migration applied via Supabase MCP `apply_migration`

**Step 1: Apply the migration to create tables, RLS policies, and seed all 31 achievements**

Use `mcp__supabase__apply_migration` with project ID (get from `mcp__supabase__list_projects`).

```sql
-- Create achievements catalog table
CREATE TABLE achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('common', 'uncommon', 'rare', 'epic')),
  sort_order  INT NOT NULL DEFAULT 0
);

-- Create user_achievements table
CREATE TABLE user_achievements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id  UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_unlocked ON user_achievements(unlocked_at DESC);

-- RLS
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read achievements catalog"
  ON achievements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can read own achievements"
  ON user_achievements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Seed all 31 achievements
INSERT INTO achievements (key, name, description, emoji, tier, sort_order) VALUES
  ('account_created',     'First Steps',        'Create an account and begin your journey',                    '🎒', 'common',   1),
  ('stage_failed',        'Honorable Defeat',   'Fall in battle during a quest stage',                         '💀', 'common',   2),
  ('friend_added',        'Fellow Traveler',    'Add a friend to your companions list',                        '👥', 'common',   3),
  ('mock_exam_complete',  'Trial by Fire',      'Complete a full mock exam',                                   '📝', 'common',   4),
  ('stage_1_cleared',     'Stage 1 Cleared',    'Clear Stage 1: Prologue',                                    '⚔️', 'uncommon',  5),
  ('stage_2_cleared',     'Stage 2 Cleared',    'Clear Stage 2: River of Shattered Tone',                     '⚔️', 'uncommon',  6),
  ('stage_3_cleared',     'Stage 3 Cleared',    'Clear Stage 3: Desert of Illusion',                          '⚔️', 'uncommon',  7),
  ('stage_4_cleared',     'Stage 4 Cleared',    'Clear Stage 4: Moonlit Mountain',                            '⚔️', 'uncommon',  8),
  ('stage_5_cleared',     'Stage 5 Cleared',    'Clear Stage 5: Misty Bamboo Forest',                         '⚔️', 'uncommon',  9),
  ('stage_6_cleared',     'Stage 6 Cleared',    'Clear Stage 6: Plains of Fading Echoes',                     '⚔️', 'uncommon', 10),
  ('stage_7_cleared',     'Stage 7 Cleared',    'Clear Stage 7: Western Palace',                              '⚔️', 'uncommon', 11),
  ('sessions_5_wukong',   'Wukong Apprentice',  'Complete 5 practice sessions with Sun Wukong',               '🤝', 'uncommon', 12),
  ('sessions_5_sanzang',  'Sanzang Apprentice', 'Complete 5 practice sessions with Tang Sanzang',             '🤝', 'uncommon', 13),
  ('sessions_5_wujing',   'Wujing Apprentice',  'Complete 5 practice sessions with Sha Wujing',               '🤝', 'uncommon', 14),
  ('sessions_5_bajie',    'Bajie Apprentice',   'Complete 5 practice sessions with Zhu Bajie',                '🤝', 'uncommon', 15),
  ('no_hit_stage_1',      'Stage 1 Flawless',   'Clear Stage 1 without taking any damage',                    '🛡️', 'rare',     16),
  ('no_hit_stage_2',      'Stage 2 Flawless',   'Clear Stage 2 without taking any damage',                    '🛡️', 'rare',     17),
  ('no_hit_stage_3',      'Stage 3 Flawless',   'Clear Stage 3 without taking any damage',                    '🛡️', 'rare',     18),
  ('no_hit_stage_4',      'Stage 4 Flawless',   'Clear Stage 4 without taking any damage',                    '🛡️', 'rare',     19),
  ('no_hit_stage_5',      'Stage 5 Flawless',   'Clear Stage 5 without taking any damage',                    '🛡️', 'rare',     20),
  ('no_hit_stage_6',      'Stage 6 Flawless',   'Clear Stage 6 without taking any damage',                    '🛡️', 'rare',     21),
  ('no_hit_stage_7',      'Stage 7 Flawless',   'Clear Stage 7 without taking any damage',                    '🛡️', 'rare',     22),
  ('sessions_10_wukong',  'Wukong Adept',       'Complete 10 practice sessions with Sun Wukong',              '💪', 'rare',     23),
  ('sessions_10_sanzang', 'Sanzang Adept',      'Complete 10 practice sessions with Tang Sanzang',            '💪', 'rare',     24),
  ('sessions_10_wujing',  'Wujing Adept',       'Complete 10 practice sessions with Sha Wujing',              '💪', 'rare',     25),
  ('sessions_10_bajie',   'Bajie Adept',        'Complete 10 practice sessions with Zhu Bajie',               '💪', 'rare',     26),
  ('all_stages_cleared',  'Journey Complete',    'Clear all 7 stages of the Main Quest',                      '🏆', 'epic',     27),
  ('sessions_20_wukong',  'Wukong Master',      'Complete 20 practice sessions with Sun Wukong',              '⭐', 'epic',     28),
  ('sessions_20_sanzang', 'Sanzang Master',     'Complete 20 practice sessions with Tang Sanzang',            '⭐', 'epic',     29),
  ('sessions_20_wujing',  'Wujing Master',      'Complete 20 practice sessions with Sha Wujing',              '⭐', 'epic',     30),
  ('sessions_20_bajie',   'Bajie Master',       'Complete 20 practice sessions with Zhu Bajie',               '⭐', 'epic',     31);
```

**Step 2: Verify migration**

Run `mcp__supabase__list_tables` to confirm both tables exist. Run `mcp__supabase__execute_sql` with `SELECT count(*) FROM achievements;` to verify 31 rows.

**Step 3: Commit**

```bash
git add docs/plans/2026-02-21-achievements-design.md docs/plans/2026-02-21-achievements-implementation.md
git commit -m "feat(achievements): add design + implementation plan and DB migration"
```

---

## Task 2: TypeScript Types & Achievement Definitions

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/achievements/types.ts`
- Create: `src/lib/achievements/definitions.ts`

**Step 1: Add DB interfaces to `src/types/database.ts`**

Append after the `Friendship` interface:

```typescript
export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  emoji: string;
  tier: 'common' | 'uncommon' | 'rare' | 'epic';
  sort_order: number;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}
```

**Step 2: Create `src/lib/achievements/types.ts`**

```typescript
export type AchievementTier = 'common' | 'uncommon' | 'rare' | 'epic';

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  emoji: string;
  tier: AchievementTier;
  sortOrder: number;
}

export type AchievementContext =
  | { type: 'quest_clear'; stage: number; damageTaken: number }
  | { type: 'quest_fail' }
  | { type: 'session_complete'; characterId: string }
  | { type: 'friend_added' }
  | { type: 'mock_exam_complete' }
  | { type: 'account_created' };

export interface UnlockedAchievement {
  key: string;
  name: string;
  emoji: string;
  tier: AchievementTier;
}

export const TIER_COLORS: Record<AchievementTier, string> = {
  common: '#CD7F32',
  uncommon: '#C0C0C0',
  rare: '#FFD700',
  epic: '#9B59B6',
};
```

**Step 3: Create `src/lib/achievements/definitions.ts`**

```typescript
import type { AchievementDef } from './types';

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'account_created',     name: 'First Steps',        description: 'Create an account and begin your journey',                emoji: '🎒', tier: 'common',   sortOrder: 1 },
  { key: 'stage_failed',        name: 'Honorable Defeat',   description: 'Fall in battle during a quest stage',                     emoji: '💀', tier: 'common',   sortOrder: 2 },
  { key: 'friend_added',        name: 'Fellow Traveler',    description: 'Add a friend to your companions list',                    emoji: '👥', tier: 'common',   sortOrder: 3 },
  { key: 'mock_exam_complete',  name: 'Trial by Fire',      description: 'Complete a full mock exam',                               emoji: '📝', tier: 'common',   sortOrder: 4 },
  { key: 'stage_1_cleared',     name: 'Stage 1 Cleared',    description: 'Clear Stage 1: Prologue',                                emoji: '⚔️', tier: 'uncommon', sortOrder: 5 },
  { key: 'stage_2_cleared',     name: 'Stage 2 Cleared',    description: 'Clear Stage 2: River of Shattered Tone',                 emoji: '⚔️', tier: 'uncommon', sortOrder: 6 },
  { key: 'stage_3_cleared',     name: 'Stage 3 Cleared',    description: 'Clear Stage 3: Desert of Illusion',                      emoji: '⚔️', tier: 'uncommon', sortOrder: 7 },
  { key: 'stage_4_cleared',     name: 'Stage 4 Cleared',    description: 'Clear Stage 4: Moonlit Mountain',                        emoji: '⚔️', tier: 'uncommon', sortOrder: 8 },
  { key: 'stage_5_cleared',     name: 'Stage 5 Cleared',    description: 'Clear Stage 5: Misty Bamboo Forest',                     emoji: '⚔️', tier: 'uncommon', sortOrder: 9 },
  { key: 'stage_6_cleared',     name: 'Stage 6 Cleared',    description: 'Clear Stage 6: Plains of Fading Echoes',                 emoji: '⚔️', tier: 'uncommon', sortOrder: 10 },
  { key: 'stage_7_cleared',     name: 'Stage 7 Cleared',    description: 'Clear Stage 7: Western Palace',                          emoji: '⚔️', tier: 'uncommon', sortOrder: 11 },
  { key: 'sessions_5_wukong',   name: 'Wukong Apprentice',  description: 'Complete 5 practice sessions with Sun Wukong',           emoji: '🤝', tier: 'uncommon', sortOrder: 12 },
  { key: 'sessions_5_sanzang',  name: 'Sanzang Apprentice', description: 'Complete 5 practice sessions with Tang Sanzang',         emoji: '🤝', tier: 'uncommon', sortOrder: 13 },
  { key: 'sessions_5_wujing',   name: 'Wujing Apprentice',  description: 'Complete 5 practice sessions with Sha Wujing',           emoji: '🤝', tier: 'uncommon', sortOrder: 14 },
  { key: 'sessions_5_bajie',    name: 'Bajie Apprentice',   description: 'Complete 5 practice sessions with Zhu Bajie',            emoji: '🤝', tier: 'uncommon', sortOrder: 15 },
  { key: 'no_hit_stage_1',      name: 'Stage 1 Flawless',   description: 'Clear Stage 1 without taking any damage',                emoji: '🛡️', tier: 'rare',     sortOrder: 16 },
  { key: 'no_hit_stage_2',      name: 'Stage 2 Flawless',   description: 'Clear Stage 2 without taking any damage',                emoji: '🛡️', tier: 'rare',     sortOrder: 17 },
  { key: 'no_hit_stage_3',      name: 'Stage 3 Flawless',   description: 'Clear Stage 3 without taking any damage',                emoji: '🛡️', tier: 'rare',     sortOrder: 18 },
  { key: 'no_hit_stage_4',      name: 'Stage 4 Flawless',   description: 'Clear Stage 4 without taking any damage',                emoji: '🛡️', tier: 'rare',     sortOrder: 19 },
  { key: 'no_hit_stage_5',      name: 'Stage 5 Flawless',   description: 'Clear Stage 5 without taking any damage',                emoji: '🛡️', tier: 'rare',     sortOrder: 20 },
  { key: 'no_hit_stage_6',      name: 'Stage 6 Flawless',   description: 'Clear Stage 6 without taking any damage',                emoji: '🛡️', tier: 'rare',     sortOrder: 21 },
  { key: 'no_hit_stage_7',      name: 'Stage 7 Flawless',   description: 'Clear Stage 7 without taking any damage',                emoji: '🛡️', tier: 'rare',     sortOrder: 22 },
  { key: 'sessions_10_wukong',  name: 'Wukong Adept',       description: 'Complete 10 practice sessions with Sun Wukong',          emoji: '💪', tier: 'rare',     sortOrder: 23 },
  { key: 'sessions_10_sanzang', name: 'Sanzang Adept',      description: 'Complete 10 practice sessions with Tang Sanzang',        emoji: '💪', tier: 'rare',     sortOrder: 24 },
  { key: 'sessions_10_wujing',  name: 'Wujing Adept',       description: 'Complete 10 practice sessions with Sha Wujing',          emoji: '💪', tier: 'rare',     sortOrder: 25 },
  { key: 'sessions_10_bajie',   name: 'Bajie Adept',        description: 'Complete 10 practice sessions with Zhu Bajie',           emoji: '💪', tier: 'rare',     sortOrder: 26 },
  { key: 'all_stages_cleared',  name: 'Journey Complete',    description: 'Clear all 7 stages of the Main Quest',                  emoji: '🏆', tier: 'epic',     sortOrder: 27 },
  { key: 'sessions_20_wukong',  name: 'Wukong Master',      description: 'Complete 20 practice sessions with Sun Wukong',          emoji: '⭐', tier: 'epic',     sortOrder: 28 },
  { key: 'sessions_20_sanzang', name: 'Sanzang Master',     description: 'Complete 20 practice sessions with Tang Sanzang',        emoji: '⭐', tier: 'epic',     sortOrder: 29 },
  { key: 'sessions_20_wujing',  name: 'Wujing Master',      description: 'Complete 20 practice sessions with Sha Wujing',          emoji: '⭐', tier: 'epic',     sortOrder: 30 },
  { key: 'sessions_20_bajie',   name: 'Bajie Master',       description: 'Complete 20 practice sessions with Zhu Bajie',           emoji: '⭐', tier: 'epic',     sortOrder: 31 },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;
```

**Step 4: Commit**

```bash
git add src/types/database.ts src/lib/achievements/types.ts src/lib/achievements/definitions.ts
git commit -m "feat(achievements): add types and achievement definitions"
```

---

## Task 3: Server-Side Achievement Checking Logic

**Files:**
- Create: `src/lib/achievements/check.ts`

**Step 1: Implement `checkAndUnlockAchievements`**

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { ACHIEVEMENT_MAP } from './definitions';
import type { AchievementContext, UnlockedAchievement } from './types';

// Character name mapping: DB character name → achievement key suffix
const CHARACTER_KEY_MAP: Record<string, string> = {
  'Sun Wukong (孙悟空)': 'wukong',
  'Tang Sanzang (三藏)': 'sanzang',
  'Sha Wujing (沙悟净)': 'wujing',
  'Zhu Bajie (猪八戒)': 'bajie',
};

export async function checkAndUnlockAchievements(
  supabase: SupabaseClient,
  userId: string,
  context: AchievementContext
): Promise<UnlockedAchievement[]> {
  // 1. Determine candidate achievement keys based on context
  const candidateKeys = getCandidateKeys(context);
  if (candidateKeys.length === 0) return [];

  // 2. Check which candidates are already unlocked
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('achievement_id, achievements!inner(key)')
    .eq('user_id', userId)
    .in('achievements.key', candidateKeys);

  const alreadyUnlocked = new Set(
    (existing ?? []).map((e: { achievements: { key: string } }) => e.achievements.key)
  );

  const remaining = candidateKeys.filter((k) => !alreadyUnlocked.has(k));
  if (remaining.length === 0) return [];

  // 3. Verify conditions and collect keys to unlock
  const toUnlock = await verifyConditions(supabase, userId, context, remaining);
  if (toUnlock.length === 0) return [];

  // 4. Get achievement IDs from DB
  const { data: achievementRows } = await supabase
    .from('achievements')
    .select('id, key')
    .in('key', toUnlock);

  if (!achievementRows || achievementRows.length === 0) return [];

  // 5. Insert unlocks
  const inserts = achievementRows.map((a) => ({
    user_id: userId,
    achievement_id: a.id,
  }));

  await supabase.from('user_achievements').insert(inserts);

  // 6. Return newly unlocked achievements for toast display
  return toUnlock
    .map((key) => {
      const def = ACHIEVEMENT_MAP[key];
      if (!def) return null;
      return { key, name: def.name, emoji: def.emoji, tier: def.tier };
    })
    .filter((a): a is UnlockedAchievement => a !== null);
}

function getCandidateKeys(context: AchievementContext): string[] {
  switch (context.type) {
    case 'quest_clear': {
      const keys = [`stage_${context.stage}_cleared`];
      if (context.damageTaken === 0) {
        keys.push(`no_hit_stage_${context.stage}`);
      }
      keys.push('all_stages_cleared');
      return keys;
    }
    case 'quest_fail':
      return ['stage_failed'];
    case 'session_complete': {
      const charKey = CHARACTER_KEY_MAP[context.characterName];
      if (!charKey) return [];
      return [
        `sessions_5_${charKey}`,
        `sessions_10_${charKey}`,
        `sessions_20_${charKey}`,
      ];
    }
    case 'friend_added':
      return ['friend_added'];
    case 'mock_exam_complete':
      return ['mock_exam_complete'];
    case 'account_created':
      return ['account_created'];
  }
}

async function verifyConditions(
  supabase: SupabaseClient,
  userId: string,
  context: AchievementContext,
  candidates: string[]
): Promise<string[]> {
  const verified: string[] = [];

  for (const key of candidates) {
    // Simple one-time achievements — if we're here, the event happened
    if (['stage_failed', 'friend_added', 'mock_exam_complete', 'account_created'].includes(key)) {
      verified.push(key);
      continue;
    }

    // Stage cleared — the event itself is the proof
    if (key.startsWith('stage_') && key.endsWith('_cleared')) {
      verified.push(key);
      continue;
    }

    // No-hit stage — already filtered by damageTaken === 0 in getCandidateKeys
    if (key.startsWith('no_hit_stage_')) {
      verified.push(key);
      continue;
    }

    // All stages cleared — need to verify all 7 are cleared
    if (key === 'all_stages_cleared') {
      const { count } = await supabase
        .from('quest_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_cleared', true);
      if ((count ?? 0) >= 7) {
        verified.push(key);
      }
      continue;
    }

    // Session count achievements
    const sessionMatch = key.match(/^sessions_(\d+)_(\w+)$/);
    if (sessionMatch) {
      const threshold = parseInt(sessionMatch[1], 10);
      const charKey = sessionMatch[2];

      // Find the character name from the key
      const charName = Object.entries(CHARACTER_KEY_MAP).find(
        ([, v]) => v === charKey
      )?.[0];
      if (!charName) continue;

      // Get character ID
      const { data: character } = await supabase
        .from('characters')
        .select('id')
        .eq('name', charName)
        .single();
      if (!character) continue;

      // Count sessions
      const { count } = await supabase
        .from('practice_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('character_id', character.id);

      if ((count ?? 0) >= threshold) {
        verified.push(key);
      }
    }
  }

  return verified;
}
```

**Important:** The `AchievementContext` for `session_complete` needs `characterName` (DB name) instead of just `characterId`. Update the type in `src/lib/achievements/types.ts`:

```typescript
export type AchievementContext =
  | { type: 'quest_clear'; stage: number; damageTaken: number }
  | { type: 'quest_fail' }
  | { type: 'session_complete'; characterName: string }
  | { type: 'friend_added' }
  | { type: 'mock_exam_complete' }
  | { type: 'account_created' };
```

**Step 2: Commit**

```bash
git add src/lib/achievements/check.ts src/lib/achievements/types.ts
git commit -m "feat(achievements): add server-side achievement checking logic"
```

---

## Task 4: Integrate Achievement Checks into Existing API Routes

**Files:**
- Modify: `src/app/api/quest/progress/route.ts`
- Modify: `src/app/api/progress/update/route.ts`
- Modify: `src/app/api/social/respond/route.ts`
- Modify: `src/app/api/auth/callback/route.ts`
- Create: `src/app/api/achievements/mock-exam/route.ts`

**Step 1: Modify quest progress API (`src/app/api/quest/progress/route.ts`)**

Add `damage_taken` to the POST body. After the upsert/insert logic, call `checkAndUnlockAchievements`. Return `newAchievements` in the response.

In the POST handler, after the `const body = await request.json();` line, update the destructuring:

```typescript
const { stage, is_cleared, score, damage_taken } = body as {
  stage: StageNumber;
  is_cleared: boolean;
  score: number;
  damage_taken?: number;
};
```

At the end, before `return NextResponse.json({ success: true });`, add:

```typescript
import { checkAndUnlockAchievements } from "@/lib/achievements/check";
import type { AchievementContext } from "@/lib/achievements/types";

// Check achievements
let newAchievements: { key: string; name: string; emoji: string; tier: string }[] = [];
try {
  const context: AchievementContext = is_cleared
    ? { type: 'quest_clear', stage, damageTaken: damage_taken ?? 999 }
    : { type: 'quest_fail' };
  newAchievements = await checkAndUnlockAchievements(supabase, user.id, context);
} catch (err) {
  console.error("Achievement check error:", err);
}

return NextResponse.json({ success: true, newAchievements });
```

**Step 2: Modify progress update API (`src/app/api/progress/update/route.ts`)**

After the character affection update (line ~167), before the final return, add:

```typescript
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

// Check session count achievements
let newAchievements: { key: string; name: string; emoji: string; tier: string }[] = [];
try {
  // Get character name for achievement context
  const { data: charData } = await supabase
    .from('characters')
    .select('name')
    .eq('id', characterId)
    .single();

  if (charData) {
    newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
      type: 'session_complete',
      characterName: charData.name,
    });
  }
} catch (err) {
  console.error("Achievement check error:", err);
}
```

Add `newAchievements` to the JSON response:

```typescript
return NextResponse.json({
  totalXP: newTotalXP,
  level: levelInfo.level,
  affectionXP,
  affectionLevel,
  dailyBonus,
  newAchievements,
});
```

**Step 3: Modify social respond API (`src/app/api/social/respond/route.ts`)**

After the successful update (line ~58), before the return, add:

```typescript
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

let newAchievements: { key: string; name: string; emoji: string; tier: string }[] = [];
if (action === "accept") {
  try {
    // Check for both users (both get the achievement)
    const [achUser, achFriend] = await Promise.all([
      checkAndUnlockAchievements(supabase, user.id, { type: 'friend_added' }),
      checkAndUnlockAchievements(supabase, friendship.requester_id, { type: 'friend_added' }),
    ]);
    newAchievements = achUser;
  } catch (err) {
    console.error("Achievement check error:", err);
  }
}

return NextResponse.json({ ...updated, newAchievements });
```

**Step 4: Modify auth callback (`src/app/api/auth/callback/route.ts`)**

After the session exchange succeeds and before the redirect, add:

```typescript
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

// Check account_created achievement (idempotent — won't double-award)
try {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await checkAndUnlockAchievements(supabase, user.id, { type: 'account_created' });
  }
} catch (err) {
  console.error("Achievement check error:", err);
}
```

**Step 5: Create mock exam achievement endpoint (`src/app/api/achievements/mock-exam/route.ts`)**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const newAchievements = await checkAndUnlockAchievements(supabase, user.id, {
      type: 'mock_exam_complete',
    });
    return NextResponse.json({ newAchievements });
  } catch (err) {
    console.error("Mock exam achievement error:", err);
    return NextResponse.json({ newAchievements: [] });
  }
}
```

**Step 6: Commit**

```bash
git add src/app/api/quest/progress/route.ts src/app/api/progress/update/route.ts src/app/api/social/respond/route.ts src/app/api/auth/callback/route.ts src/app/api/achievements/mock-exam/route.ts
git commit -m "feat(achievements): integrate checks into existing API routes"
```

---

## Task 5: Send `damage_taken` from Victory/Defeat Screens

**Files:**
- Modify: `src/components/quest/victory-screen.tsx`
- Modify: `src/components/quest/defeat-screen.tsx`
- Modify: `src/app/(main)/mock-exam/exam-runner.tsx`

**Step 1: Modify victory screen to send `damage_taken`**

In `victory-screen.tsx` line 80-84, update the POST body:

```typescript
body: JSON.stringify({
  stage,
  is_cleared: true,
  score: xp,
  damage_taken: battleState.playerMaxHP - battleState.playerHP,
}),
```

Also update the `handleContinue` to capture `newAchievements` from the response and pass them up. Add to the `VictoryScreenProps` interface:

```typescript
onAchievements?: (achievements: { key: string; name: string; emoji: string; tier: string }[]) => void;
```

After the POST response:

```typescript
if (postRes.ok) {
  const postData = await postRes.json();
  if (postData.newAchievements?.length > 0) {
    onAchievements?.(postData.newAchievements);
  }
}
```

**Step 2: Update defeat screen similarly**

In `defeat-screen.tsx`, update the fetch call (line 35-45) to also capture achievements:

Add `onAchievements` prop. After the POST succeeds:

```typescript
fetch("/api/quest/progress", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    stage,
    is_cleared: false,
    score: 0,
    damage_taken: battleState.playerMaxHP - battleState.playerHP,
  }),
})
  .then((res) => res.ok ? res.json() : null)
  .then((data) => {
    if (data?.newAchievements?.length > 0) {
      onAchievements?.(data.newAchievements);
    }
  })
  .catch(() => {});
```

**Step 3: Add mock exam achievement call**

In `exam-runner.tsx`, in the results screen section (around line 621), add a `useEffect` that fires once when results are shown:

```typescript
const [mockExamAchievementChecked, setMockExamAchievementChecked] = useState(false);

// In the results phase block:
useEffect(() => {
  if (examPhase === "results" && !mockExamAchievementChecked) {
    setMockExamAchievementChecked(true);
    fetch("/api/achievements/mock-exam", { method: "POST" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.newAchievements?.length > 0) {
          onAchievements?.(data.newAchievements);
        }
      })
      .catch(() => {});
  }
}, [examPhase, mockExamAchievementChecked]);
```

(If `exam-runner.tsx` doesn't have `onAchievements` prop, we'll use the toast context directly — see Task 6.)

**Step 4: Commit**

```bash
git add src/components/quest/victory-screen.tsx src/components/quest/defeat-screen.tsx src/app/(main)/mock-exam/exam-runner.tsx
git commit -m "feat(achievements): send damage_taken and handle achievement responses"
```

---

## Task 6: Achievement Toast System

**Files:**
- Create: `src/components/shared/achievement-toast.tsx`
- Modify: `src/app/(main)/layout.tsx`

**Step 1: Create achievement toast provider and component**

Create `src/components/shared/achievement-toast.tsx`:

```typescript
"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { UnlockedAchievement } from "@/lib/achievements/types";
import { TIER_COLORS } from "@/lib/achievements/types";

interface AchievementToastContextValue {
  showAchievementToasts: (achievements: UnlockedAchievement[]) => void;
}

const AchievementToastContext = createContext<AchievementToastContextValue>({
  showAchievementToasts: () => {},
});

export function useAchievementToast() {
  return useContext(AchievementToastContext);
}

interface ToastItem {
  id: string;
  achievement: UnlockedAchievement;
  visible: boolean;
}

export function AchievementToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const showAchievementToasts = useCallback((achievements: UnlockedAchievement[]) => {
    const newToasts = achievements.map((achievement, i) => {
      counterRef.current += 1;
      const id = `ach-toast-${counterRef.current}`;

      // Stagger appearance
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
      }, i * 300);

      // Auto-dismiss after 4s
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 400);
      }, 4000 + i * 300);

      return { id, achievement, visible: false };
    });

    setToasts((prev) => [...prev, ...newToasts]);
  }, []);

  return (
    <AchievementToastContext.Provider value={{ showAchievementToasts }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto pixel-border bg-card p-3 flex items-center gap-3 min-w-[280px] max-w-[340px] transition-all duration-400 ${
              toast.visible
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
            style={{ borderLeftWidth: 4, borderLeftColor: TIER_COLORS[toast.achievement.tier] }}
          >
            <span className="text-2xl shrink-0">{toast.achievement.emoji}</span>
            <div className="min-w-0">
              <p className="font-pixel text-[10px] text-muted-foreground leading-relaxed">
                Achievement Unlocked!
              </p>
              <p className="font-retro text-base font-bold text-foreground truncate">
                {toast.achievement.name}
              </p>
            </div>
          </div>
        ))}
      </div>
    </AchievementToastContext.Provider>
  );
}
```

**Step 2: Wrap `(main)/layout.tsx` with the provider**

In `src/app/(main)/layout.tsx`, import and wrap children:

```typescript
import { AchievementToastProvider } from "@/components/shared/achievement-toast";

// In the return, wrap the <main> content:
return (
  <AchievementToastProvider>
    <div className="min-h-screen">
      <NavbarClient ... />
      <main ...>
        <ContentWrapper>{children}</ContentWrapper>
      </main>
    </div>
  </AchievementToastProvider>
);
```

**Step 3: Commit**

```bash
git add src/components/shared/achievement-toast.tsx src/app/(main)/layout.tsx
git commit -m "feat(achievements): add toast notification system with provider"
```

---

## Task 7: Achievement Feed API

**Files:**
- Create: `src/app/api/achievements/feed/route.ts`

**Step 1: Create the feed endpoint**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get friend IDs
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const userIds = [user.id];
    for (const f of friendships ?? []) {
      userIds.push(f.requester_id === user.id ? f.addressee_id : f.requester_id);
    }

    // Fetch recent achievements for all relevant users
    const { data: feed } = await supabase
      .from("user_achievements")
      .select("unlocked_at, user_id, achievements(key, name, emoji, tier), profiles!user_id(display_name, avatar_url)")
      .in("user_id", userIds)
      .order("unlocked_at", { ascending: false })
      .limit(20);

    const entries = (feed ?? []).map((entry) => ({
      unlocked_at: entry.unlocked_at,
      user_id: entry.user_id,
      display_name: (entry as any).profiles?.display_name ?? "Unknown",
      avatar_url: (entry as any).profiles?.avatar_url ?? null,
      achievement_key: (entry as any).achievements?.key,
      achievement_name: (entry as any).achievements?.name,
      achievement_emoji: (entry as any).achievements?.emoji,
      achievement_tier: (entry as any).achievements?.tier,
      is_self: entry.user_id === user.id,
    }));

    return NextResponse.json({ feed: entries });
  } catch (err) {
    console.error("Achievement feed error:", err);
    return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/achievements/feed/route.ts
git commit -m "feat(achievements): add friend activity feed API endpoint"
```

---

## Task 8: Achievement Count in Social Friends API

**Files:**
- Modify: `src/app/api/social/friends/route.ts`

**Step 1: Add achievement count to friend stats**

In the `getUserStats` function, add a parallel query to count achievements:

Add to the `Promise.all` array (alongside profile, sessions, selectedChar):

```typescript
supabase
  .from("user_achievements")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId),
```

Add to the destructured result:

```typescript
const [profileResult, sessionsResult, selectedCharResult, achievementCountResult] = await Promise.all([...]);
```

Add `achievement_count` to the `UserStats` interface and return value:

```typescript
interface UserStats {
  // ... existing fields
  achievement_count: number;
}

// In the return:
return {
  ...existingFields,
  achievement_count: achievementCountResult.count ?? 0,
};
```

**Step 2: Commit**

```bash
git add src/app/api/social/friends/route.ts
git commit -m "feat(achievements): add achievement count to friend stats API"
```

---

## Task 9: Navigation Updates — Navbar + Dashboard

**Files:**
- Modify: `src/components/shared/navbar.tsx`
- Modify: `src/app/(main)/dashboard/dashboard-client.tsx`

**Step 1: Add Achievements to navbar dropdown**

In `navbar.tsx`, add `Trophy` to the lucide-react imports. Between the Social menu item and the separator (line 117-118), add:

```typescript
<DropdownMenuItem onClick={() => router.push("/achievements")} className="text-lg font-bold px-3 py-2.5 gap-3">
  <Trophy className="h-5 w-5" />
  Achievements
</DropdownMenuItem>
```

**Step 2: Add Achievements tile to dashboard**

In `dashboard-client.tsx`, update the bottom grid from 2-column to 3-column. Replace the existing `grid grid-cols-2 gap-3` div (lines 257-275) with:

```typescript
<div className="grid grid-cols-3 gap-3">
  <Link href="/profile" className="group block">
    <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all flex items-center gap-4">
      <UserCircle className="h-6 w-6 text-primary shrink-0" />
      <p className="font-pixel text-sm text-foreground leading-relaxed">Profile</p>
    </div>
  </Link>
  <Link href="/achievements" className="group block">
    <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all flex items-center gap-4">
      <Trophy className="h-6 w-6 text-primary shrink-0" />
      <p className="font-pixel text-sm text-foreground leading-relaxed">Achievements</p>
    </div>
  </Link>
  <Link href="/social" className="group block">
    <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all flex items-center gap-4">
      <Users className="h-6 w-6 text-primary shrink-0" />
      <p className="font-pixel text-sm text-foreground leading-relaxed">Social</p>
      {pendingCount > 0 && (
        <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
          {pendingCount}
        </span>
      )}
    </div>
  </Link>
</div>
```

**Step 3: Commit**

```bash
git add src/components/shared/navbar.tsx src/app/(main)/dashboard/dashboard-client.tsx
git commit -m "feat(achievements): add achievements to navbar and dashboard"
```

---

## Task 10: Achievement Page — Server Component + Loading Skeleton

**Files:**
- Create: `src/app/(main)/achievements/page.tsx`
- Create: `src/app/(main)/achievements/loading.tsx`

**Step 1: Create server component**

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const AchievementsClient = dynamic(
  () => import("./achievements-client").then((m) => m.AchievementsClient),
  { ssr: false }
);

export default async function AchievementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: allAchievements },
    { data: userAchievements },
  ] = await Promise.all([
    supabase
      .from("achievements")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", user.id),
  ]);

  return (
    <AchievementsClient
      achievements={allAchievements ?? []}
      userAchievements={userAchievements ?? []}
      userId={user.id}
    />
  );
}
```

**Step 2: Create loading skeleton**

```typescript
export default function AchievementsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-48 rounded animate-shimmer" />
      <div className="pixel-border p-4 space-y-3">
        <div className="h-8 w-32 mx-auto rounded animate-shimmer" />
        <div className="h-4 w-64 mx-auto rounded animate-shimmer" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-2">
            <div className="h-8 w-8 rounded animate-shimmer" />
            <div className="h-4 w-20 rounded animate-shimmer" />
            <div className="h-3 w-full rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/(main)/achievements/page.tsx src/app/(main)/achievements/loading.tsx
git commit -m "feat(achievements): add achievements page server component + skeleton"
```

---

## Task 11: Achievement Page — Client Component

**Files:**
- Create: `src/app/(main)/achievements/achievements-client.tsx`

**Step 1: Build the full client component**

This is the main UI component with:
- Progress summary section
- Filter tabs (All / Common / Uncommon / Rare / Epic)
- Achievement grid with tier-colored borders
- Friend activity feed section

```typescript
"use client";

import { useState, useEffect } from "react";
import { Trophy, User } from "lucide-react";
import type { Achievement } from "@/types/database";
import { TIER_COLORS, type AchievementTier } from "@/lib/achievements/types";
import { TOTAL_ACHIEVEMENTS } from "@/lib/achievements/definitions";

interface AchievementsClientProps {
  achievements: Achievement[];
  userAchievements: { achievement_id: string; unlocked_at: string }[];
  userId: string;
}

interface FeedEntry {
  unlocked_at: string;
  display_name: string;
  avatar_url: string | null;
  achievement_name: string;
  achievement_emoji: string;
  achievement_tier: string;
  is_self: boolean;
}

const TIER_FILTERS: { label: string; value: AchievementTier | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Common", value: "common" },
  { label: "Uncommon", value: "uncommon" },
  { label: "Rare", value: "rare" },
  { label: "Epic", value: "epic" },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function AchievementsClient({
  achievements,
  userAchievements,
  userId,
}: AchievementsClientProps) {
  const [filter, setFilter] = useState<AchievementTier | "all">("all");
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Build unlocked set
  const unlockedMap = new Map(
    userAchievements.map((ua) => [ua.achievement_id, ua.unlocked_at])
  );
  const unlockedCount = unlockedMap.size;
  const percentage = Math.round((unlockedCount / TOTAL_ACHIEVEMENTS) * 100);

  // Tier counts
  const tierCounts = { common: { total: 0, unlocked: 0 }, uncommon: { total: 0, unlocked: 0 }, rare: { total: 0, unlocked: 0 }, epic: { total: 0, unlocked: 0 } };
  for (const a of achievements) {
    const tier = a.tier as AchievementTier;
    tierCounts[tier].total++;
    if (unlockedMap.has(a.id)) tierCounts[tier].unlocked++;
  }

  // Filtered achievements
  const filtered = filter === "all"
    ? achievements
    : achievements.filter((a) => a.tier === filter);

  // Fetch feed on mount
  useEffect(() => {
    fetch("/api/achievements/feed")
      .then((res) => (res.ok ? res.json() : { feed: [] }))
      .then((data) => setFeed(data.feed ?? []))
      .catch(() => setFeed([]))
      .finally(() => setFeedLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="font-pixel text-base text-primary pixel-glow">Achievements</h1>

      {/* Progress Summary */}
      <div className="pixel-border chinese-corner bg-card/60 p-4 text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          <span className="font-pixel text-lg text-foreground">
            {unlockedCount} / {TOTAL_ACHIEVEMENTS}
          </span>
          <span className="font-retro text-lg text-muted-foreground">
            ({percentage}%)
          </span>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {(Object.entries(tierCounts) as [AchievementTier, { total: number; unlocked: number }][]).map(
            ([tier, counts]) => (
              <span
                key={tier}
                className="font-retro text-sm px-2 py-0.5 pixel-border"
                style={{ borderLeftWidth: 3, borderLeftColor: TIER_COLORS[tier] }}
              >
                {counts.unlocked}/{counts.total} {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </span>
            )
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TIER_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-pixel text-[10px] px-3 py-1.5 pixel-border transition-all ${
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent/50 text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Achievement Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((achievement) => {
          const unlocked = unlockedMap.has(achievement.id);
          const unlockedAt = unlockedMap.get(achievement.id);
          return (
            <div
              key={achievement.id}
              className={`pixel-border p-3 space-y-1 transition-all ${
                unlocked ? "bg-card/60" : "bg-card/30 opacity-50 grayscale"
              }`}
              style={{
                borderLeftWidth: 4,
                borderLeftColor: TIER_COLORS[achievement.tier as AchievementTier],
              }}
            >
              <span className="text-2xl">{achievement.emoji}</span>
              <p className="font-retro text-base font-bold text-foreground leading-tight">
                {achievement.name}
              </p>
              <p className="font-retro text-sm text-muted-foreground leading-snug">
                {achievement.description}
              </p>
              {unlocked && unlockedAt && (
                <p className="font-retro text-xs text-primary">
                  {timeAgo(unlockedAt)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Friend Activity Feed */}
      <div className="space-y-3">
        <h2 className="font-pixel text-xs text-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Recent Activity
        </h2>

        {feedLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="h-8 w-8 rounded-sm animate-shimmer" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-48 rounded animate-shimmer" />
                  <div className="h-3 w-24 rounded animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!feedLoading && feed.length === 0 && (
          <div className="pixel-border bg-card/60 p-6 text-center">
            <p className="text-base font-retro text-muted-foreground">
              No recent activity &mdash; add friends to see their achievements!
            </p>
          </div>
        )}

        {!feedLoading && feed.length > 0 && (
          <div className="space-y-1">
            {feed.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 pixel-border bg-card/40"
              >
                <div className="h-8 w-8 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {entry.avatar_url ? (
                    <img
                      src={entry.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-retro text-foreground truncate">
                    <span className="font-bold">
                      {entry.is_self ? "You" : entry.display_name}
                    </span>{" "}
                    unlocked {entry.achievement_emoji}{" "}
                    <span className="font-bold">{entry.achievement_name}</span>
                  </p>
                  <p className="text-sm font-retro text-muted-foreground">
                    {timeAgo(entry.unlocked_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(main)/achievements/achievements-client.tsx
git commit -m "feat(achievements): add achievements page client component with grid and feed"
```

---

## Task 12: Social Tab — Add Achievement Count to Friend Cards

**Files:**
- Modify: `src/app/(main)/social/social-client.tsx`

**Step 1: Add `achievement_count` to the `FriendStats` interface**

```typescript
interface FriendStats {
  // ... existing fields
  achievement_count: number;
}
```

**Step 2: Add achievement count display in `FriendCard`**

After the "Sessions" line (line ~863), add:

```typescript
<p className="text-base font-retro text-muted-foreground flex items-center gap-1.5">
  <Trophy className="h-3.5 w-3.5 text-primary" />
  Achievements: <span className="text-foreground font-bold">{friend.achievement_count}/31</span>
</p>
```

Add `Trophy` to the lucide-react imports.

**Step 3: Commit**

```bash
git add src/app/(main)/social/social-client.tsx
git commit -m "feat(achievements): show achievement count on friend cards"
```

---

## Task 13: Wire Toast Context into Quest + Practice Flows

**Files:**
- Modify: `src/app/(main)/main-quest/main-quest-client.tsx` — pass `onAchievements` to VictoryScreen and DefeatScreen, using `useAchievementToast`
- Modify: `src/app/(main)/mock-exam/exam-runner.tsx` — use `useAchievementToast` for mock exam achievement
- Modify: various practice session client components — read `newAchievements` from progress update response

**Step 1: Wire quest screens**

In `main-quest-client.tsx`, import the toast hook:

```typescript
import { useAchievementToast } from "@/components/shared/achievement-toast";
```

Inside the component:

```typescript
const { showAchievementToasts } = useAchievementToast();
```

Pass to VictoryScreen and DefeatScreen:

```typescript
onAchievements={(achs) => showAchievementToasts(achs)}
```

**Step 2: Wire mock exam**

In `exam-runner.tsx`, import and use:

```typescript
import { useAchievementToast } from "@/components/shared/achievement-toast";

// Inside component:
const { showAchievementToasts } = useAchievementToast();
```

In the results phase useEffect, replace `onAchievements?.(...)` with `showAchievementToasts(...)`.

**Step 3: Wire practice sessions**

Find all places that call `/api/progress/update` and read the response. Add:

```typescript
if (data.newAchievements?.length > 0) {
  showAchievementToasts(data.newAchievements);
}
```

Key files to check (search for `fetch.*progress/update`):
- `src/components/practice/PracticeSession.tsx` or similar
- Any component that calls the progress update API

**Step 4: Wire social respond**

In `social-client.tsx`, in the `respondToRequest` callback, after `"Friend added!"` toast:

```typescript
import { useAchievementToast } from "@/components/shared/achievement-toast";

// In component:
const { showAchievementToasts } = useAchievementToast();

// In respondToRequest, after res.ok:
const data = await res.json();
if (data.newAchievements?.length > 0) {
  showAchievementToasts(data.newAchievements);
}
```

**Step 5: Commit**

```bash
git add src/app/(main)/main-quest/main-quest-client.tsx src/app/(main)/mock-exam/exam-runner.tsx src/app/(main)/social/social-client.tsx
git commit -m "feat(achievements): wire toast notifications into all achievement trigger points"
```

---

## Task 14: Build Verification & Smoke Test

**Step 1: Run build**

```bash
npm run build
```

Verify no TypeScript errors.

**Step 2: Run lint**

```bash
npm run lint
```

Fix any lint issues.

**Step 3: Manual smoke test checklist**

- [ ] Visit `/achievements` — page loads, shows all 31 achievements (all locked for new user)
- [ ] Filter tabs work (All / Common / Uncommon / Rare / Epic)
- [ ] Dashboard shows 3-column bottom row with Achievements tile
- [ ] Navbar dropdown shows Achievements between Social and Log Out
- [ ] Friend cards in Social show achievement count
- [ ] Activity feed loads (empty state if no friends)

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(achievements): build and lint fixes"
```

---

## Task 15: Final Review & Cleanup

**Step 1: Run security advisors**

Use `mcp__supabase__get_advisors` with type `"security"` to check for missing RLS policies on the new tables.

**Step 2: Verify RLS policies**

Run `mcp__supabase__execute_sql`:

```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('achievements', 'user_achievements');
```

Should show:
- achievements: SELECT for authenticated
- user_achievements: SELECT + INSERT for authenticated (with user_id check)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(achievements): complete achievement system implementation"
```
