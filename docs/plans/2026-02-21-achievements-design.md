# Steam-like Achievement System Design

**Date:** 2026-02-21
**Status:** Approved

## Overview

A Steam-inspired achievement system with 4 rarity tiers, emoji-based icons, toast notifications, and a friend activity feed. Achievements are cosmetic only (no XP rewards).

---

## Achievement Catalog (31 total)

### Tiers

| Tier | Color | Border Style | Count |
|------|-------|-------------|-------|
| Common | `#CD7F32` (bronze) | `pixel-border` | 4 |
| Uncommon | `#C0C0C0` (silver) | `pixel-border` + subtle glow | 11 |
| Rare | `#FFD700` (gold) | `pixel-border` + `pixel-glow` | 11 |
| Epic | `#9B59B6` (purple) | `pixel-border` + animated shimmer | 5 |

### Full Catalog

| # | Emoji | Key | Name | Tier | Trigger |
|---|-------|-----|------|------|---------|
| 1 | 🎒 | `account_created` | First Steps | Common | Create an account |
| 2 | 💀 | `stage_failed` | Honorable Defeat | Common | Fail 1 quest stage |
| 3 | 👥 | `friend_added` | Fellow Traveler | Common | Add a friend |
| 4 | 📝 | `mock_exam_complete` | Trial by Fire | Common | Complete 1 mock exam |
| 5 | ⚔️ | `stage_1_cleared` | Stage 1 Cleared | Uncommon | Clear quest stage 1 |
| 6 | ⚔️ | `stage_2_cleared` | Stage 2 Cleared | Uncommon | Clear quest stage 2 |
| 7 | ⚔️ | `stage_3_cleared` | Stage 3 Cleared | Uncommon | Clear quest stage 3 |
| 8 | ⚔️ | `stage_4_cleared` | Stage 4 Cleared | Uncommon | Clear quest stage 4 |
| 9 | ⚔️ | `stage_5_cleared` | Stage 5 Cleared | Uncommon | Clear quest stage 5 |
| 10 | ⚔️ | `stage_6_cleared` | Stage 6 Cleared | Uncommon | Clear quest stage 6 |
| 11 | ⚔️ | `stage_7_cleared` | Stage 7 Cleared | Uncommon | Clear quest stage 7 |
| 12 | 🤝 | `sessions_5_wukong` | Wukong Apprentice | Uncommon | 5 sessions with Wukong |
| 13 | 🤝 | `sessions_5_sanzang` | Sanzang Apprentice | Uncommon | 5 sessions with Sanzang |
| 14 | 🤝 | `sessions_5_wujing` | Wujing Apprentice | Uncommon | 5 sessions with Wujing |
| 15 | 🤝 | `sessions_5_bajie` | Bajie Apprentice | Uncommon | 5 sessions with Bajie |
| 16 | 🛡️ | `no_hit_stage_1` | Stage 1 Flawless | Rare | No-hit clear stage 1 |
| 17 | 🛡️ | `no_hit_stage_2` | Stage 2 Flawless | Rare | No-hit clear stage 2 |
| 18 | 🛡️ | `no_hit_stage_3` | Stage 3 Flawless | Rare | No-hit clear stage 3 |
| 19 | 🛡️ | `no_hit_stage_4` | Stage 4 Flawless | Rare | No-hit clear stage 4 |
| 20 | 🛡️ | `no_hit_stage_5` | Stage 5 Flawless | Rare | No-hit clear stage 5 |
| 21 | 🛡️ | `no_hit_stage_6` | Stage 6 Flawless | Rare | No-hit clear stage 6 |
| 22 | 🛡️ | `no_hit_stage_7` | Stage 7 Flawless | Rare | No-hit clear stage 7 |
| 23 | 💪 | `sessions_10_wukong` | Wukong Adept | Rare | 10 sessions with Wukong |
| 24 | 💪 | `sessions_10_sanzang` | Sanzang Adept | Rare | 10 sessions with Sanzang |
| 25 | 💪 | `sessions_10_wujing` | Wujing Adept | Rare | 10 sessions with Wujing |
| 26 | 💪 | `sessions_10_bajie` | Bajie Adept | Rare | 10 sessions with Bajie |
| 27 | 🏆 | `all_stages_cleared` | Journey Complete | Epic | Clear all 7 stages |
| 28 | ⭐ | `sessions_20_wukong` | Wukong Master | Epic | 20 sessions with Wukong |
| 29 | ⭐ | `sessions_20_sanzang` | Sanzang Master | Epic | 20 sessions with Sanzang |
| 30 | ⭐ | `sessions_20_wujing` | Wujing Master | Epic | 20 sessions with Wujing |
| 31 | ⭐ | `sessions_20_bajie` | Bajie Master | Epic | 20 sessions with Bajie |

---

## Database Schema

### `achievements` (static definition, seeded once)

```sql
CREATE TABLE achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('common', 'uncommon', 'rare', 'epic')),
  sort_order  INT NOT NULL DEFAULT 0
);
```

### `user_achievements` (per-user unlock records)

```sql
CREATE TABLE user_achievements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id  UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_unlocked ON user_achievements(unlocked_at DESC);
```

### RLS Policies

- `achievements`: SELECT for all authenticated users (public catalog)
- `user_achievements`: SELECT WHERE `user_id = auth.uid()` (own achievements)
- `user_achievements`: INSERT WHERE `user_id = auth.uid()` (unlock own)
- Friend achievement counts read via server-side queries (no direct RLS needed)

---

## Achievement Checking (Server-Side, Event-Driven)

Shared function: `src/lib/achievements/check.ts`

```typescript
checkAndUnlockAchievements(userId: string, context: AchievementContext): Promise<UnlockedAchievement[]>
```

### Trigger Points

| Event | Where Checked | Achievements Checked |
|-------|--------------|---------------------|
| Quest stage clear | `/api/quest/progress` | `stage_N_cleared`, `no_hit_stage_N`, `all_stages_cleared` |
| Quest stage fail | `/api/quest/progress` | `stage_failed` |
| Practice session complete | `/api/progress/update` | `sessions_5/10/20_CHARACTER` |
| Friend request accepted | `/api/social/respond` | `friend_added` |
| Mock exam complete | Mock exam completion flow | `mock_exam_complete` |
| Account created | Auth callback / first login | `account_created` |

### Context Types

```typescript
type AchievementContext =
  | { type: 'quest_clear'; stage: number; damageTaken: number }
  | { type: 'quest_fail' }
  | { type: 'session_complete'; characterId: string }
  | { type: 'friend_added' }
  | { type: 'mock_exam_complete' }
  | { type: 'account_created' }
```

### Checking Logic

1. Based on context type, determine which achievement keys are candidates
2. Query `user_achievements` to filter out already-unlocked ones
3. For remaining candidates, verify the condition is met (e.g. count sessions for character)
4. Insert newly unlocked achievements into `user_achievements`
5. Return the list of newly unlocked achievements for client-side toast display

---

## Navigation

### Profile Dropdown (navbar.tsx)

Add "Achievements" item between Social and Log Out:
- Icon: `Trophy` (lucide-react)
- Route: `/achievements`
- No badge needed

### Dashboard (dashboard-client.tsx)

Replace current 2-column bottom grid (`Profile | Social`) with 3-column:
- Profile | Achievements (Trophy icon) | Social

---

## Achievement Page (`/achievements`)

### Route: `src/app/(main)/achievements/`

### Top Section — Progress Summary

- Completion percentage: "17 / 31 (55%)"
- Tier breakdown as 4 small badges: "4/4 Common · 8/11 Uncommon · 4/11 Rare · 1/5 Epic"
- `pixel-border` card with `chinese-corner` decoration

### Middle Section — Achievement Grid

- 2 columns mobile, 3-4 columns desktop
- Each card: emoji (large), name, description, tier-colored left border
- Unlocked: full color, relative timestamp ("2 days ago")
- Locked: grayscale/dimmed, description visible (so users know what to aim for)
- Filter tab bar: All / Common / Uncommon / Rare / Epic

### Bottom Section — Friend Activity Feed

- Chronological list: "[Avatar] [Name] unlocked [emoji] [Achievement Name] · 3 hours ago"
- Last ~20 events from friends + yourself
- Empty state: "No recent activity — add friends to see their achievements!"
- Compact rows with subtle `pixel-border`

---

## Toast Notification System

### Component: `src/components/shared/achievement-toast.tsx`

- Position: fixed bottom-right, `z-50`, 16px from edges
- Animation: slide in from right (`translate-x-full → 0`) with `fade-in-up`
- Content: tier-colored left border + emoji (large) + "Achievement Unlocked!" label + achievement name
- Auto-dismiss after 4 seconds with fade-out
- Stacking: multiple toasts stack upward with 8px gap, dismiss independently

### Provider: `AchievementToastProvider`

- Wraps `(main)/layout.tsx`
- Exposes `showAchievementToast(achievement)` via React context
- No external toast library needed

### Triggering

- API responses include `newAchievements` array when achievements are unlocked
- Client components read this array and call `showAchievementToast()` for each
- No WebSocket or polling required

---

## Social Tab Integration

### Friend Card Addition

- New line in each `FriendCard`: `Trophy 12/31` showing friend's achievement count
- Fetched alongside existing friend stats in `/api/social/friends`

### Achievement Feed API

- `GET /api/achievements/feed`
- Returns recent `user_achievements` from user + accepted friends
- Joined with `achievements` (for display data) and `profiles` (for names/avatars)
- Ordered by `unlocked_at DESC`, limited to 20 entries

---

## File Structure

```
src/
├── app/(main)/achievements/
│   ├── page.tsx                    # Server component — fetch achievements + user progress
│   ├── achievements-client.tsx     # Client component — grid, filters, feed
│   └── loading.tsx                 # Skeleton
├── app/api/achievements/
│   └── feed/route.ts              # Friend activity feed endpoint
├── lib/achievements/
│   ├── definitions.ts             # Achievement catalog as TypeScript constants
│   ├── check.ts                   # checkAndUnlockAchievements() logic
│   └── types.ts                   # Achievement-related TypeScript types
├── components/shared/
│   └── achievement-toast.tsx       # Toast component + context provider
└── types/
    └── database.ts                # Add achievements + user_achievements interfaces
```
