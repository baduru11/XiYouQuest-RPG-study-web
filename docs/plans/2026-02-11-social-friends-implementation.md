# Social & Friends Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a social system with friend codes, display-name search, Discord friend discovery, friend requests, and competitive stat comparison.

**Architecture:** Database-first approach — migrate schema, then build API routes bottom-up, then wire up the UI. The social page follows the existing pattern: server component fetches data, passes to a dynamic client component. Navbar gets a badge for pending requests.

**Tech Stack:** Supabase (PostgreSQL + RLS), Next.js App Router API routes, React client component, Tailwind + pixel-art theme, Discord REST API v10.

**Supabase Project ID:** `yfoifmqjhavxidomgids`

---

### Task 1: Database Migration — profiles columns + friend code trigger

**Files:**
- Modify: `src/types/database.ts:1-11` (Profile interface)

**Step 1: Apply migration via Supabase MCP**

Run `apply_migration` with name `add_social_columns_and_friend_code` and this SQL:

```sql
-- Add discord_id and friend_code columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discord_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friend_code text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_discord_id ON profiles(discord_id);
CREATE INDEX IF NOT EXISTS idx_profiles_friend_code ON profiles(friend_code);

-- Friend code auto-generation trigger
CREATE OR REPLACE FUNCTION generate_friend_code()
RETURNS trigger AS $$
DECLARE
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  LOOP
    new_code := 'PSC-';
    FOR i IN 1..4 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    BEGIN
      NEW.friend_code := new_code;
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      -- retry on collision
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_friend_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.friend_code IS NULL)
  EXECUTE FUNCTION generate_friend_code();

-- Backfill existing profiles with friend codes
DO $$
DECLARE
  r RECORD;
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE friend_code IS NULL LOOP
    LOOP
      new_code := 'PSC-';
      FOR i IN 1..4 LOOP
        new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      BEGIN
        UPDATE profiles SET friend_code = new_code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- retry
      END;
    END LOOP;
  END LOOP;
END $$;
```

**Step 2: Verify migration**

Run `execute_sql`: `SELECT id, friend_code FROM profiles LIMIT 5;`
Expected: All rows have a `PSC-XXXX` friend code.

**Step 3: Update TypeScript Profile interface**

In `src/types/database.ts`, add `discord_id` and `friend_code` to the Profile interface:

```typescript
export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_level: number;
  last_login_date: string | null;
  login_streak: number;
  created_at: string;
  discord_id: string | null;
  friend_code: string | null;
}
```

**Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(social): add discord_id and friend_code to profiles schema"
```

---

### Task 2: Database Migration — friendships table + RLS

**Step 1: Apply migration via Supabase MCP**

Run `apply_migration` with name `create_friendships_table` and this SQL:

```sql
CREATE TABLE friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);

-- Enable RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- SELECT: user is requester or addressee
CREATE POLICY "Users can view own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- INSERT: user is the requester, no existing friendship between the pair
CREATE POLICY "Users can send friend requests"
  ON friendships FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND NOT EXISTS (
      SELECT 1 FROM friendships f
      WHERE (f.requester_id = requester_id AND f.addressee_id = addressee_id)
         OR (f.requester_id = addressee_id AND f.addressee_id = requester_id)
    )
  );

-- UPDATE: only addressee can respond to pending requests
CREATE POLICY "Addressee can respond to pending requests"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id AND status = 'pending')
  WITH CHECK (auth.uid() = addressee_id);

-- DELETE: either party can remove
CREATE POLICY "Either party can remove friendship"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
```

**Step 2: Verify migration**

Run `execute_sql`: `SELECT table_name FROM information_schema.tables WHERE table_name = 'friendships';`
Expected: Returns one row.

Run `execute_sql`: `SELECT policyname FROM pg_policies WHERE tablename = 'friendships';`
Expected: 4 policies listed.

**Step 3: Add Friendship type to database.ts**

Append to `src/types/database.ts`:

```typescript
export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}
```

**Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(social): create friendships table with RLS policies"
```

---

### Task 3: Auth Callback — Extract Discord ID

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`

**Step 1: Update auth callback to extract Discord ID**

Replace the entire file content with:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Extract Discord ID if the user logged in via Discord
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const discordIdentity = user.identities?.find(
        (identity) => identity.provider === "discord"
      );
      if (discordIdentity) {
        await supabase
          .from("profiles")
          .update({ discord_id: discordIdentity.id })
          .eq("id", user.id);
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
```

**Step 2: Verify locally**

Run: `npm run build` (or `npm run dev` and check no TypeScript errors)
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add src/app/api/auth/callback/route.ts
git commit -m "feat(social): extract Discord ID on OAuth callback"
```

---

### Task 4: API Route — Search by display name

**Files:**
- Create: `src/app/api/social/search/route.ts`

**Step 1: Create the search route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  // Get IDs of users who already have a friendship with the current user
  const { data: existingFriendships } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const excludeIds = new Set<string>([user.id]);
  existingFriendships?.forEach((f) => {
    excludeIds.add(f.requester_id);
    excludeIds.add(f.addressee_id);
  });

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level, friend_code")
    .ilike("display_name", `%${q}%`)
    .not("id", "in", `(${Array.from(excludeIds).join(",")})`)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(profiles ?? []);
}
```

**Step 2: Verify**

Run: `npm run build`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add src/app/api/social/search/route.ts
git commit -m "feat(social): add display name search API route"
```

---

### Task 5: API Route — Lookup by friend code

**Files:**
- Create: `src/app/api/social/lookup/route.ts`

**Step 1: Create the lookup route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code || !/^PSC-[A-Z2-9]{4}$/.test(code)) {
    return NextResponse.json({ error: "Invalid friend code format" }, { status: 400 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, current_level")
    .eq("friend_code", code)
    .neq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(profile);
}
```

**Step 2: Commit**

```bash
git add src/app/api/social/lookup/route.ts
git commit -m "feat(social): add friend code lookup API route"
```

---

### Task 6: API Route — Send friend request

**Files:**
- Create: `src/app/api/social/request/route.ts`

**Step 1: Create the request route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { addressee_id } = (await request.json()) as { addressee_id: string };
  if (!addressee_id) {
    return NextResponse.json({ error: "Missing addressee_id" }, { status: 400 });
  }
  if (addressee_id === user.id) {
    return NextResponse.json({ error: "Cannot send request to yourself" }, { status: 400 });
  }

  // Check for existing friendship in either direction
  const { data: existing } = await supabase
    .from("friendships")
    .select("id")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${addressee_id}),and(requester_id.eq.${addressee_id},addressee_id.eq.${user.id})`
    )
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "Friendship already exists" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("friendships")
    .insert({ requester_id: user.id, addressee_id })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
```

**Step 2: Commit**

```bash
git add src/app/api/social/request/route.ts
git commit -m "feat(social): add send friend request API route"
```

---

### Task 7: API Route — Respond to friend request

**Files:**
- Create: `src/app/api/social/respond/route.ts`

**Step 1: Create the respond route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { friendship_id, action } = (await request.json()) as {
    friendship_id: string;
    action: "accept" | "reject";
  };

  if (!friendship_id || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("friendships")
    .update({ status: action === "accept" ? "accepted" : "rejected", updated_at: new Date().toISOString() })
    .eq("id", friendship_id)
    .eq("addressee_id", user.id)
    .eq("status", "pending")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Request not found or already responded" }, { status: 404 });
  }

  return NextResponse.json(data);
}
```

**Step 2: Commit**

```bash
git add src/app/api/social/respond/route.ts
git commit -m "feat(social): add respond to friend request API route"
```

---

### Task 8: API Route — Remove friend

**Files:**
- Create: `src/app/api/social/remove/route.ts`

**Step 1: Create the remove route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing friendship id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/social/remove/route.ts
git commit -m "feat(social): add remove friend API route"
```

---

### Task 9: API Route — Get friends list with competitive stats

**Files:**
- Create: `src/app/api/social/friends/route.ts`

**Step 1: Create the friends route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getUserStats(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [{ data: profile }, { data: sessions }, { data: selectedChar }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, current_level, total_xp, login_streak").eq("id", userId).single(),
    supabase.from("practice_sessions").select("component, score").eq("user_id", userId),
    supabase.from("user_characters").select("characters(name, image_url)").eq("user_id", userId).eq("is_selected", true).single(),
  ]);

  const totalSessions = sessions?.length ?? 0;
  const avgScores: Record<string, number> = {};
  if (sessions && sessions.length > 0) {
    const grouped: Record<number, number[]> = {};
    sessions.forEach((s) => {
      if (!grouped[s.component]) grouped[s.component] = [];
      grouped[s.component].push(s.score);
    });
    for (const [comp, scores] of Object.entries(grouped)) {
      avgScores[comp] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
  }

  const character = selectedChar?.characters as unknown as { name: string; image_url: string } | null;

  return {
    id: userId,
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    current_level: profile?.current_level ?? 0,
    total_xp: profile?.total_xp ?? 0,
    login_streak: profile?.login_streak ?? 0,
    total_sessions: totalSessions,
    avg_scores: avgScores,
    selected_character: character ?? null,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get accepted friendships
  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!friendships || friendships.length === 0) {
    const myStats = await getUserStats(supabase, user.id);
    return NextResponse.json({ friends: [], me: myStats });
  }

  // Get stats for all friends in parallel
  const friendEntries = await Promise.all(
    friendships.map(async (f) => {
      const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      const stats = await getUserStats(supabase, friendId);
      return { friendship_id: f.id, friend: stats };
    })
  );

  const myStats = await getUserStats(supabase, user.id);

  return NextResponse.json({ friends: friendEntries, me: myStats });
}
```

**Step 2: Commit**

```bash
git add src/app/api/social/friends/route.ts
git commit -m "feat(social): add friends list API with competitive stats"
```

---

### Task 10: API Routes — Requests list + request count

**Files:**
- Create: `src/app/api/social/requests/route.ts`
- Create: `src/app/api/social/request-count/route.ts`

**Step 1: Create the requests route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .eq("status", "pending")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const incoming = [];
  const outgoing = [];

  if (friendships) {
    // Collect all unique user IDs we need profiles for
    const userIds = new Set<string>();
    friendships.forEach((f) => {
      userIds.add(f.requester_id === user.id ? f.addressee_id : f.requester_id);
    });

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, current_level")
      .in("id", Array.from(userIds));

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

    for (const f of friendships) {
      const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      const profile = profileMap.get(otherId);
      const entry = {
        friendship_id: f.id,
        created_at: f.created_at,
        user: profile ?? { id: otherId, display_name: null, avatar_url: null, current_level: 0 },
      };

      if (f.addressee_id === user.id) {
        incoming.push(entry);
      } else {
        outgoing.push(entry);
      }
    }
  }

  return NextResponse.json({ incoming, outgoing });
}
```

**Step 2: Create the request-count route**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count, error } = await supabase
    .from("friendships")
    .select("*", { count: "exact", head: true })
    .eq("addressee_id", user.id)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
```

**Step 3: Commit**

```bash
git add src/app/api/social/requests/route.ts src/app/api/social/request-count/route.ts
git commit -m "feat(social): add requests list and request count API routes"
```

---

### Task 11: API Route — Discord friend suggestions

**Files:**
- Create: `src/app/api/social/discord-suggestions/route.ts`

**Step 1: Create the discord-suggestions route**

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
    // Get session to access provider_token
    const { data: { session } } = await supabase.auth.getSession();
    const providerToken = session?.provider_token;

    if (!providerToken) {
      return NextResponse.json([]);
    }

    // Fetch Discord relationships
    const discordRes = await fetch("https://discord.com/api/v10/users/@me/relationships", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });

    if (!discordRes.ok) {
      return NextResponse.json([]);
    }

    const relationships = await discordRes.json();

    // Filter to type 1 (friends) and extract Discord user IDs
    const friendDiscordIds = relationships
      .filter((r: { type: number }) => r.type === 1)
      .map((r: { id: string }) => r.id);

    if (friendDiscordIds.length === 0) {
      return NextResponse.json([]);
    }

    // Find app users with matching discord_ids
    const { data: matchedProfiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, current_level")
      .in("discord_id", friendDiscordIds)
      .neq("id", user.id);

    if (!matchedProfiles || matchedProfiles.length === 0) {
      return NextResponse.json([]);
    }

    // Exclude existing friends and pending requests
    const { data: existingFriendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const excludeIds = new Set<string>();
    existingFriendships?.forEach((f) => {
      excludeIds.add(f.requester_id);
      excludeIds.add(f.addressee_id);
    });

    const suggestions = matchedProfiles.filter((p) => !excludeIds.has(p.id));

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([]);
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/social/discord-suggestions/route.ts
git commit -m "feat(social): add Discord friend suggestions API route"
```

---

### Task 12: Navbar — Add Social link with badge

**Files:**
- Modify: `src/components/shared/navbar.tsx:47-51` (props interface), `~125` (desktop dropdown), `~175-183` (mobile menu)
- Modify: `src/components/shared/navbar-client.tsx:17-25` (props interface + pass-through)
- Modify: `src/app/(main)/layout.tsx:17-28` (data fetching)

**Step 1: Update NavbarClient props and pass-through**

In `src/components/shared/navbar-client.tsx`, add `pendingRequestCount` to the interface and pass it through:

```typescript
"use client";

import dynamic from "next/dynamic";

const Navbar = dynamic(
  () => import("@/components/shared/navbar").then((m) => m.Navbar),
  {
    ssr: false,
    loading: () => (
      <nav className="border-b-3 border-border bg-card pixel-border">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4" />
      </nav>
    ),
  }
);

interface NavbarClientProps {
  totalXP: number;
  displayName: string | null;
  avatarUrl: string | null;
  pendingRequestCount: number;
}

export function NavbarClient({ totalXP, displayName, avatarUrl, pendingRequestCount }: NavbarClientProps) {
  return <Navbar totalXP={totalXP} displayName={displayName} avatarUrl={avatarUrl} pendingRequestCount={pendingRequestCount} />;
}
```

**Step 2: Update Navbar props and add Social menu items**

In `src/components/shared/navbar.tsx`:

- Add `Users` to the lucide-react import (line ~35, check if already imported)
- Add `pendingRequestCount: number` to the NavbarProps interface
- Add a "Social" DropdownMenuItem after the Profile item (desktop dropdown, before the separator)
- Add a "Social" Link+Button after the Profile link (mobile menu)
- Show a badge when `pendingRequestCount > 0`

The Social menu item in the desktop dropdown (insert after the Profile DropdownMenuItem, before the DropdownMenuSeparator):

```tsx
<DropdownMenuItem onClick={() => router.push("/social")} className="text-lg font-bold px-3 py-2.5 gap-3">
  <Users className="h-5 w-5" />
  Social
  {pendingRequestCount > 0 && (
    <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
      {pendingRequestCount}
    </span>
  )}
</DropdownMenuItem>
```

The Social link in the mobile menu (insert after the Profile Link):

```tsx
<Link href="/social" onClick={() => setMobileOpen(false)}>
  <Button
    variant={pathname.startsWith("/social") ? "default" : "ghost"}
    className="w-full justify-start"
  >
    <Users className="h-4 w-4 mr-2" />
    Social
    {pendingRequestCount > 0 && (
      <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
        {pendingRequestCount}
      </span>
    )}
  </Button>
</Link>
```

**Step 3: Update main layout to fetch request count**

In `src/app/(main)/layout.tsx`, change the single profile query to use `Promise.all` with a request count query:

```typescript
const [{ data: profile }, { count: pendingCount }] = await Promise.all([
  supabase
    .from("profiles")
    .select("total_xp, display_name, avatar_url")
    .eq("id", user.id)
    .single(),
  supabase
    .from("friendships")
    .select("*", { count: "exact", head: true })
    .eq("addressee_id", user.id)
    .eq("status", "pending"),
]);
```

And pass the count to NavbarClient:

```tsx
<NavbarClient
  totalXP={profile?.total_xp ?? 0}
  displayName={profile?.display_name ?? null}
  avatarUrl={profile?.avatar_url ?? null}
  pendingRequestCount={pendingCount ?? 0}
/>
```

**Step 4: Verify**

Run: `npm run dev` — navigate to any page, confirm navbar renders without errors.
Expected: "Social" appears in the profile dropdown between Profile and Log Out.

**Step 5: Commit**

```bash
git add src/components/shared/navbar.tsx src/components/shared/navbar-client.tsx src/app/(main)/layout.tsx
git commit -m "feat(social): add Social link with badge to navbar"
```

---

### Task 13: Social Page — Server component + loading skeleton

**Files:**
- Create: `src/app/(main)/social/page.tsx`
- Create: `src/app/(main)/social/loading.tsx`

**Step 1: Create loading skeleton**

```typescript
export default function SocialLoading() {
  return (
    <div className="space-y-6">
      {/* Header + Friend Code */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded animate-shimmer" />
        <div className="h-8 w-32 rounded animate-shimmer" />
      </div>

      {/* Search Section */}
      <div className="pixel-border p-4 space-y-3">
        <div className="h-5 w-32 rounded animate-shimmer" />
        <div className="flex gap-4">
          <div className="h-10 flex-1 rounded animate-shimmer" />
          <div className="h-10 w-40 rounded animate-shimmer" />
        </div>
      </div>

      {/* Friends Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="pixel-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-sm animate-shimmer" />
              <div className="space-y-1">
                <div className="h-4 w-24 rounded animate-shimmer" />
                <div className="h-3 w-16 rounded animate-shimmer" />
              </div>
            </div>
            <div className="h-3 w-full rounded animate-shimmer" />
            <div className="h-3 w-3/4 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create server component page**

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const SocialClient = dynamic(
  () => import("./social-client").then((m) => m.SocialClient),
  { ssr: false }
);

export default async function SocialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: friendships },
    { data: pendingRequests },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("friend_code")
      .eq("id", user.id)
      .single(),
    supabase
      .from("friendships")
      .select("id, requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, created_at")
      .eq("status", "pending")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
  ]);

  // Check if user logged in with Discord (has provider_token)
  const { data: { session } } = await supabase.auth.getSession();
  const hasDiscord = !!session?.provider_token;

  return (
    <SocialClient
      userId={user.id}
      friendCode={profile?.friend_code ?? null}
      initialFriendCount={friendships?.length ?? 0}
      initialPendingCount={pendingRequests?.length ?? 0}
      hasDiscord={hasDiscord}
    />
  );
}
```

**Step 3: Create a placeholder client component** (full implementation in Task 14)

Create `src/app/(main)/social/social-client.tsx`:

```typescript
"use client";

interface SocialClientProps {
  userId: string;
  friendCode: string | null;
  initialFriendCount: number;
  initialPendingCount: number;
  hasDiscord: boolean;
}

export function SocialClient({ friendCode }: SocialClientProps) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Social</h1>
      <p className="font-body text-lg">Your friend code: {friendCode ?? "..."}</p>
      <p className="font-body text-muted-foreground">Full UI coming next...</p>
    </div>
  );
}
```

**Step 4: Verify**

Run: `npm run dev` — navigate to `/social`.
Expected: Page renders with heading and friend code.

**Step 5: Commit**

```bash
git add src/app/(main)/social/
git commit -m "feat(social): add social page skeleton and server component"
```

---

### Task 14: Social Page — Full client component

**Files:**
- Modify: `src/app/(main)/social/social-client.tsx` (replace placeholder)

This is the largest task. The client component has three sections: Add Friends (search + code + Discord), Pending Requests, and Friends List.

**Step 1: Implement the full SocialClient component**

Replace `src/app/(main)/social/social-client.tsx` with the full implementation. The component should:

1. **State:** `friends`, `requests` (incoming/outgoing), `discordSuggestions`, `searchResults`, `lookupResult`, search/code input values, loading states
2. **Effects:** On mount, fetch `/api/social/friends`, `/api/social/requests`, and if `hasDiscord` then `/api/social/discord-suggestions`
3. **Friend Code Display:** Top-right with copy button using `navigator.clipboard.writeText()`
4. **Add Friends Section:** Two inputs (search + code), inline results with "Add" buttons that call `POST /api/social/request`
5. **Discord Suggestions:** Rendered only if `hasDiscord` and suggestions are non-empty
6. **Pending Requests:** Incoming with Accept/Reject, Outgoing with Cancel. Accept calls `POST /api/social/respond`, Reject calls same with `reject`, Cancel calls `DELETE /api/social/remove`
7. **Friends List:** Responsive grid with competitive stat cards. Each card shows comparison arrows (green ArrowUp / red ArrowDown from lucide-react) by comparing friend stats to `me` stats from the friends API response
8. **Remove Friend:** AlertDialog confirmation, then `DELETE /api/social/remove`
9. **Toasts:** Use the existing toast system (`sonner` or shadcn toast) for success/error feedback

Key UI patterns to follow:
- `pixel-border` on card containers
- `pixel-btn` class or shadcn `Button` for actions
- `font-heading` (Press Start 2P) for section headers
- `font-body` (VT323) for body text, `text-lg` minimum
- `bg-background/80 backdrop-blur-sm` not needed (already on parent layout)
- Warm palette: `text-amber-700`, `text-amber-900`, `bg-amber-100` for badges

The full component code is too long to include inline — implement it following the patterns above and the design doc sections for each UI area. Debounce search with a 300ms timeout. Use `useCallback` for API call functions.

**Step 2: Verify**

Run: `npm run dev` — navigate to `/social`.
Expected: All three sections render. Search returns results. Friend code lookup works.

**Step 3: Commit**

```bash
git add src/app/(main)/social/social-client.tsx
git commit -m "feat(social): implement full social page client component"
```

---

### Task 15: Manual Verification + Final Commit

**Step 1: Configure Discord scope in Supabase Dashboard**

Manually go to Supabase Dashboard > Authentication > Providers > Discord.
Add `relationships.read` to the scopes field. Save.

**Step 2: End-to-end manual testing**

1. Log in with Discord — verify `discord_id` gets saved to profiles table
2. Navigate to `/social` — verify friend code shows and copy works
3. Search by display name — verify results appear
4. Look up by friend code — verify single result appears
5. Send friend request — verify it appears in the other user's incoming
6. Accept friend request — verify both users see each other in friends list
7. Check navbar badge — verify count shows for pending requests
8. Verify competitive stats — XP arrows show correctly
9. Remove friend — verify AlertDialog and removal works
10. Discord suggestions (if you have a Discord friend who also uses the app)

**Step 3: Build check**

Run: `npm run build`
Expected: No errors.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: add social friends feature with Discord integration"
```
