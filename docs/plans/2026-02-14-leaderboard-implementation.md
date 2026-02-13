# Leaderboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a gamified leaderboard page with global/friends scopes and XP/Accuracy/Streak ranking tabs.

**Architecture:** New `/leaderboard` route under `(main)` layout with a single API endpoint. Client component manages scope/tab state and fetches rankings. All data from existing `profiles` and `user_progress` tables — no migrations.

**Tech Stack:** Next.js App Router, Supabase (server client), React 19, Tailwind CSS 4, shadcn/ui, Lucide icons, Zod validation

**Design doc:** `docs/plans/2026-02-14-leaderboard-design.md`

**No test framework configured** — verify each task via dev server (`npm run dev`) and `npm run build`.

---

### Task 1: API Route — `/api/leaderboard/route.ts`

**Files:**
- Create: `src/app/api/leaderboard/route.ts`
- Modify: `src/lib/validations.ts` (add leaderboard query param schema)

**Step 1: Add Zod schema to validations.ts**

Open `src/lib/validations.ts` and add at the end, before the `// --- Helpers ---` section:

```typescript
// --- Leaderboard API Schemas ---

export const leaderboardQuerySchema = z.object({
  tab: z.enum(["xp", "accuracy", "streak"]),
  scope: z.enum(["global", "friends"]),
});
```

**Step 2: Create the API route**

Create `src/app/api/leaderboard/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leaderboardQuerySchema } from "@/lib/validations";

interface RankingEntry {
  rank: number;
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_level: number;
  value: number;
}

interface LeaderboardResponse {
  rankings: RankingEntry[];
  user_rank: { rank: number; value: number } | null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tab = request.nextUrl.searchParams.get("tab");
  const scope = request.nextUrl.searchParams.get("scope");

  const parsed = leaderboardQuerySchema.safeParse({ tab, scope });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters. Required: tab (xp|accuracy|streak), scope (global|friends)" },
      { status: 400 }
    );
  }

  const { tab: validTab, scope: validScope } = parsed.data;

  try {
    // For friends scope, get friend IDs first
    let friendIds: string[] | null = null;
    if (validScope === "friends") {
      const { data: friendships, error: fErr } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (fErr) {
        console.error("Leaderboard friends fetch error:", fErr);
        return NextResponse.json({ error: "Failed to fetch friends" }, { status: 500 });
      }

      friendIds = [
        user.id,
        ...(friendships ?? []).map((f) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        ),
      ];
    }

    let rankings: RankingEntry[] = [];
    let userRank: { rank: number; value: number } | null = null;

    if (validTab === "xp") {
      ({ rankings, userRank } = await fetchXPRankings(supabase, user.id, validScope, friendIds));
    } else if (validTab === "accuracy") {
      ({ rankings, userRank } = await fetchAccuracyRankings(supabase, user.id, validScope, friendIds));
    } else {
      ({ rankings, userRank } = await fetchStreakRankings(supabase, user.id, validScope, friendIds));
    }

    const response: LeaderboardResponse = {
      rankings,
      user_rank: userRank,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}

async function fetchXPRankings(
  supabase: ReturnType<Awaited<typeof import("@/lib/supabase/server")>["createClient"]> extends Promise<infer T> ? T : never,
  userId: string,
  scope: "global" | "friends",
  friendIds: string[] | null
) {
  let query = supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level, total_xp")
    .order("total_xp", { ascending: false });

  if (scope === "friends" && friendIds) {
    query = query.in("id", friendIds);
  } else {
    query = query.limit(20);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rankings: RankingEntry[] = (data ?? []).map((row, i) => ({
    rank: i + 1,
    id: row.id,
    display_name: row.display_name ?? "Anonymous",
    avatar_url: row.avatar_url,
    current_level: row.current_level,
    value: row.total_xp,
  }));

  let userRank: { rank: number; value: number } | null = null;
  if (scope === "global" && !rankings.some((r) => r.id === userId)) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gt("total_xp", (await supabase.from("profiles").select("total_xp").eq("id", userId).single()).data?.total_xp ?? 0);

    const { data: selfProfile } = await supabase
      .from("profiles")
      .select("total_xp")
      .eq("id", userId)
      .single();

    userRank = {
      rank: (count ?? 0) + 1,
      value: selfProfile?.total_xp ?? 0,
    };
  }

  return { rankings, userRank };
}

async function fetchAccuracyRankings(
  supabase: ReturnType<Awaited<typeof import("@/lib/supabase/server")>["createClient"]> extends Promise<infer T> ? T : never,
  userId: string,
  scope: "global" | "friends",
  friendIds: string[] | null
) {
  // Fetch all user_progress rows, then aggregate in JS
  let query = supabase
    .from("user_progress")
    .select("user_id, questions_attempted, questions_correct");

  if (scope === "friends" && friendIds) {
    query = query.in("user_id", friendIds);
  }

  const { data: progressData, error: pErr } = await query;
  if (pErr) throw pErr;

  // Aggregate per user
  const userMap = new Map<string, { attempted: number; correct: number }>();
  for (const row of progressData ?? []) {
    const existing = userMap.get(row.user_id) ?? { attempted: 0, correct: 0 };
    existing.attempted += row.questions_attempted;
    existing.correct += row.questions_correct;
    userMap.set(row.user_id, existing);
  }

  // Filter users with at least 1 attempt and calculate accuracy
  const accuracyList: { user_id: string; accuracy: number }[] = [];
  for (const [uid, stats] of userMap) {
    if (stats.attempted > 0) {
      accuracyList.push({
        user_id: uid,
        accuracy: Math.round((stats.correct / stats.attempted) * 1000) / 10,
      });
    }
  }

  // Sort by accuracy DESC, take top 20 for global
  accuracyList.sort((a, b) => b.accuracy - a.accuracy);
  const topList = scope === "global" ? accuracyList.slice(0, 20) : accuracyList;

  // Fetch profile info for these users
  const topIds = topList.map((r) => r.user_id);
  const { data: profiles, error: prErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level")
    .in("id", topIds.length > 0 ? topIds : ["__none__"]);

  if (prErr) throw prErr;

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rankings: RankingEntry[] = topList.map((row, i) => {
    const profile = profileMap.get(row.user_id);
    return {
      rank: i + 1,
      id: row.user_id,
      display_name: profile?.display_name ?? "Anonymous",
      avatar_url: profile?.avatar_url ?? null,
      current_level: profile?.current_level ?? 1,
      value: row.accuracy,
    };
  });

  let userRank: { rank: number; value: number } | null = null;
  if (scope === "global" && !rankings.some((r) => r.id === userId)) {
    const userIdx = accuracyList.findIndex((r) => r.user_id === userId);
    if (userIdx >= 0) {
      userRank = {
        rank: userIdx + 1,
        value: accuracyList[userIdx].accuracy,
      };
    } else {
      userRank = { rank: accuracyList.length + 1, value: 0 };
    }
  }

  return { rankings, userRank };
}

async function fetchStreakRankings(
  supabase: ReturnType<Awaited<typeof import("@/lib/supabase/server")>["createClient"]> extends Promise<infer T> ? T : never,
  userId: string,
  scope: "global" | "friends",
  friendIds: string[] | null
) {
  let query = supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level, login_streak")
    .order("login_streak", { ascending: false });

  if (scope === "friends" && friendIds) {
    query = query.in("id", friendIds);
  } else {
    query = query.limit(20);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rankings: RankingEntry[] = (data ?? []).map((row, i) => ({
    rank: i + 1,
    id: row.id,
    display_name: row.display_name ?? "Anonymous",
    avatar_url: row.avatar_url,
    current_level: row.current_level,
    value: row.login_streak,
  }));

  let userRank: { rank: number; value: number } | null = null;
  if (scope === "global" && !rankings.some((r) => r.id === userId)) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gt("login_streak", (await supabase.from("profiles").select("login_streak").eq("id", userId).single()).data?.login_streak ?? 0);

    const { data: selfProfile } = await supabase
      .from("profiles")
      .select("login_streak")
      .eq("id", userId)
      .single();

    userRank = {
      rank: (count ?? 0) + 1,
      value: selfProfile?.login_streak ?? 0,
    };
  }

  return { rankings, userRank };
}
```

Note on the `supabase` parameter type: The helper functions use the Supabase client. In practice, use `SupabaseClient` from `@supabase/supabase-js` or simply type it with the same approach as `src/app/api/social/friends/route.ts`. Replace the complex conditional type with:

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
```

and type each helper's first param as `supabase: SupabaseClient`.

**Step 3: Verify**

Run `npm run build` — should compile with no errors.

**Step 4: Commit**

```bash
git add src/app/api/leaderboard/route.ts src/lib/validations.ts
git commit -m "feat: add leaderboard API route with XP/accuracy/streak rankings"
```

---

### Task 2: Leaderboard Page & Loading Skeleton

**Files:**
- Create: `src/app/(main)/leaderboard/page.tsx`
- Create: `src/app/(main)/leaderboard/loading.tsx`

**Step 1: Create the server page**

Create `src/app/(main)/leaderboard/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const LeaderboardClient = dynamic(
  () =>
    import("./leaderboard-client").then((m) => m.LeaderboardClient),
  { ssr: false }
);

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LeaderboardClient userId={user!.id} />;
}
```

**Step 2: Create the loading skeleton**

Create `src/app/(main)/leaderboard/loading.tsx`:

```typescript
export default function LeaderboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded animate-shimmer" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded animate-shimmer" />
          <div className="h-9 w-24 rounded animate-shimmer" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-9 w-20 rounded animate-shimmer" />
        <div className="h-9 w-28 rounded animate-shimmer" />
        <div className="h-9 w-24 rounded animate-shimmer" />
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-3 py-4">
        <div className="h-40 w-32 pixel-border animate-shimmer" />
        <div className="h-52 w-36 pixel-border animate-shimmer" />
        <div className="h-36 w-32 pixel-border animate-shimmer" />
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 pixel-border">
            <div className="h-6 w-6 rounded animate-shimmer" />
            <div className="h-8 w-8 rounded-sm animate-shimmer" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-32 rounded animate-shimmer" />
            </div>
            <div className="h-4 w-20 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Verify**

Run `npm run build` — should compile (client component doesn't exist yet, but dynamic import won't break build).

**Step 4: Commit**

```bash
git add src/app/(main)/leaderboard/page.tsx src/app/(main)/leaderboard/loading.tsx
git commit -m "feat: add leaderboard page and loading skeleton"
```

---

### Task 3: Leaderboard Client Component

**Files:**
- Create: `src/app/(main)/leaderboard/leaderboard-client.tsx`

**Step 1: Create the full client component**

Create `src/app/(main)/leaderboard/leaderboard-client.tsx`. This is the main UI component — it should use the `ui-ux-pro-max` skill for pixel-art RPG styling. Key structure:

- **Props**: `{ userId: string }`
- **State**: `scope` (`"global"` | `"friends"`), `tab` (`"xp"` | `"accuracy"` | `"streak"`), `rankings`, `userRank`, `loading`
- **Fetch**: `useEffect` triggers `GET /api/leaderboard?tab=...&scope=...` when `scope` or `tab` changes
- **Render sections**:
  1. Header: "Leaderboard" title with `pixel-glow`
  2. Scope toggle: two `pixel-btn` buttons, active has amber glow
  3. Tab bar: three tabs with icons — `Star` (XP), `Target` (Accuracy), `Flame` (Streak)
  4. Podium: top 3 in podium layout (2nd | 1st | 3rd), 1st elevated
     - Trophy icons: gold/silver/bronze colored
     - 1st place trophy gets `pixel-pulse` animation
  5. Rows 4-20: alternating backgrounds, rank badge, avatar, name, level pill, stat value
  6. Your-rank banner: shown only in global scope if user outside top 20

**Imports needed:**
- `useState`, `useEffect`, `useCallback` from React
- `Star`, `Target`, `Flame`, `Trophy`, `User`, `Crown` from `lucide-react`
- `Progress` from `@/components/ui/progress` (for accuracy bars)
- `toast` from `sonner`

**Key styling classes** (from existing codebase):
- `font-pixel text-base text-primary pixel-glow` — page titles
- `pixel-border bg-card/60` — card containers
- `font-retro` — body text
- `text-sm font-retro text-amber-700 bg-amber-100 px-1.5 py-0.5` — level badge
- `animate-shimmer` — loading placeholders
- `pixel-btn` — button style (use `pixel-border` + hover effects)

**Step 2: Verify**

Run `npm run dev`, navigate to `/leaderboard`. Verify:
- Scope toggle switches between global/friends
- Tab switching fetches new data
- Podium renders top 3 with trophy styling
- Rows 4-20 display with alternating backgrounds
- Your-rank banner appears if user is outside top 20 (global only)
- Loading states show shimmer placeholders

**Step 3: Commit**

```bash
git add src/app/(main)/leaderboard/leaderboard-client.tsx
git commit -m "feat: add leaderboard client component with podium and rankings UI"
```

---

### Task 4: Add Leaderboard to Navbar

**Files:**
- Modify: `src/components/shared/navbar.tsx` (lines 37-45: `NAV_ITEMS` array)

**Step 1: Add nav item**

In `src/components/shared/navbar.tsx`, add a leaderboard entry to `NAV_ITEMS` (line 44, after `characters`):

```typescript
const NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/component-1", label: "C1" },
  { href: "/component-2", label: "C2" },
  { href: "/component-3", label: "C3" },
  { href: "/component-4", label: "C4" },
  { href: "/component-5", label: "C5" },
  { href: "/characters", label: "Character" },
  { href: "/leaderboard", label: "Ranks" },
];
```

Use "Ranks" as the label — short enough not to crowd the navbar, and thematic with the RPG aesthetic.

Also add the `Trophy` import from `lucide-react` at the top of the file if you want to use a trophy icon in the mobile nav. Check existing icon imports and add `Trophy` to the destructured import.

**Step 2: Verify**

Run `npm run dev`. Check:
- Desktop navbar shows "Ranks" link
- Mobile nav sheet shows "Ranks" entry
- Clicking navigates to `/leaderboard`
- Active state highlights correctly when on leaderboard page

**Step 3: Commit**

```bash
git add src/components/shared/navbar.tsx
git commit -m "feat: add leaderboard link to navbar"
```

---

### Task 5: Polish & Final Verification

**Step 1: Run full build**

```bash
npm run build
```

Fix any TypeScript errors.

**Step 2: Run lint**

```bash
npm run lint
```

Fix any lint issues.

**Step 3: Manual smoke test on dev server**

```bash
npm run dev
```

Verify full flow:
- Navigate to `/leaderboard` from navbar
- Global XP tab shows top 20 users ranked by XP
- Switch to Accuracy tab — re-fetches and ranks by accuracy %
- Switch to Streak tab — ranks by login streak
- Toggle to Friends scope — shows only friends + self
- If user is not in top 20 globally, "Your Rank" banner appears at bottom
- Loading skeleton shows while fetching
- Empty state if no data
- Responsive: check mobile layout

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete leaderboard feature with gamified RPG styling"
```
