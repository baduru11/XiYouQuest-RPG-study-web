# Leaderboard Feature Design

## Overview

A dedicated leaderboard page (`/leaderboard`) where users can view rankings by different stats across two scopes: global (all users) and friends-only. Styled as a gamified pixel-art RPG tournament screen.

## Scopes

- **Global**: Top 20 users + current user's rank (if outside top 20)
- **Friends**: All accepted friends + current user, ranked together

## Ranking Tabs

Three sortable categories, each a tab:

| Tab | Stat | Source | Calculation |
|-----|------|--------|-------------|
| XP | Total XP | `profiles.total_xp` | Direct value, DESC |
| Accuracy | Overall avg accuracy | `user_progress` | `SUM(questions_correct) / SUM(questions_attempted) * 100`, DESC. Min 1 attempt required |
| Streak | Login streak | `profiles.login_streak` | Direct value, DESC |

## UI Layout

### Scope Toggle
Two `pixel-btn` buttons ("Global" / "Friends") styled as RPG menu options. Active button has amber `pixel-glow`.

### Tab Bar
Three tabs with Lucide icons:
- Star icon → XP
- Target icon → Accuracy
- Flame icon → Streak

Styled as RPG inventory category buttons.

### Top 3 Podium
Special display for ranks 1-3 arranged as a podium (2nd | 1st | 3rd), 1st place elevated:
- Each block: avatar, display name, stat value, pixel trophy icon
- Trophy colors: gold (`pixel-gold`), silver (`pixel-blue`), bronze (`pixel-amber`)
- 1st place trophy gets `pixel-pulse` animation
- Each card uses `pixel-border` with position-specific background tint

### Rows 4-20
Numbered list below the podium:
- Alternating row backgrounds (`bg-card/60` / `bg-accent/20`)
- Each row: rank number in `pixel-border` square, avatar, display name, level badge (`Lv.X` amber pill), stat value
- Stat-specific display: Progress bar for accuracy, Flame icon for streak, plain number for XP

### Your Rank Banner (Global Only)
If current user is outside top 20, a fixed banner at the bottom:
- Styled as RPG status bar (dark background)
- Shows: avatar, rank number, stat value
- Dotted separator (`···`) between rank 20 and user's rank to show gap

## API

### `GET /api/leaderboard`

**Query params:**
- `tab`: `xp` | `accuracy` | `streak`
- `scope`: `global` | `friends`

**Response:**
```json
{
  "rankings": [
    {
      "rank": 1,
      "id": "uuid",
      "display_name": "string",
      "avatar_url": "string | null",
      "current_level": 5,
      "value": 12450
    }
  ],
  "user_rank": {
    "rank": 47,
    "value": 3200
  }
}
```

`user_rank` is `null` if the user is already within the top 20 rankings.

**SQL logic:**
- **XP (global):** `SELECT` from `profiles` ordered by `total_xp DESC LIMIT 20`. User rank via `ROW_NUMBER() OVER (ORDER BY total_xp DESC)`.
- **Accuracy (global):** `SELECT user_id, SUM(questions_correct)::float / NULLIF(SUM(questions_attempted), 0) * 100` from `user_progress` grouped by `user_id`, ordered DESC, limit 20. Filter `SUM(questions_attempted) > 0`.
- **Streak (global):** `SELECT` from `profiles` ordered by `login_streak DESC LIMIT 20`. User rank via `ROW_NUMBER()`.
- **Friends scope:** Same queries filtered to `user_id IN (friend_ids + current_user_id)`. No `user_rank` needed (all shown).

## Component Architecture

```
src/app/(main)/leaderboard/
├── page.tsx                 # Server component — getUser(), renders client
├── loading.tsx              # Pixel skeleton (podium placeholders + row shimmers)
└── leaderboard-client.tsx   # Client component — scope/tab state, fetch, render
```

### `page.tsx`
Server component. Calls `getUser()`, passes `userId` to `LeaderboardClient`. Redirects if unauthenticated (handled by `(main)` layout).

### `leaderboard-client.tsx`
Client component managing:
- `scope` state: `"global"` | `"friends"`
- `tab` state: `"xp"` | `"accuracy"` | `"streak"`
- Fetches `/api/leaderboard?tab=...&scope=...` on state change
- Renders: scope toggle, tab bar, podium (top 3), list (4-20), your-rank banner

### `/api/leaderboard/route.ts`
Single GET handler:
1. Validate `tab` and `scope` params
2. Authenticate via Supabase server client
3. For `friends` scope: fetch friend IDs from `friendships` where `status = 'accepted'`
4. Run appropriate SQL query
5. Return `{ rankings, user_rank }`

## Navigation

Add "Leaderboard" entry to `(main)` layout navbar with `Trophy` icon from Lucide.

## No New Database Tables

All data computed from existing `profiles` and `user_progress` tables. No migrations needed.
