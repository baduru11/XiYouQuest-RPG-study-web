# Social & Friends Feature Design

## Overview

Add a social system where users can discover Discord friends on the platform, search by display name, add friends via unique friend codes, send/accept friend requests, and view competitive stats. Discord OAuth `relationships.read` scope enables automatic friend discovery for Discord-login users.

## Database

### Schema Changes

**Add columns to `profiles`:**

```sql
ALTER TABLE profiles ADD COLUMN discord_id text;
ALTER TABLE profiles ADD COLUMN friend_code text UNIQUE;

CREATE INDEX idx_profiles_discord_id ON profiles(discord_id);
CREATE INDEX idx_profiles_friend_code ON profiles(friend_code);
```

**Friend code auto-generation trigger:**

```sql
CREATE OR REPLACE FUNCTION generate_friend_code()
RETURNS trigger AS $$
DECLARE
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1 to avoid confusion
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
```

**Backfill existing profiles:**

```sql
-- Run after trigger is created
UPDATE profiles SET friend_code = NULL WHERE friend_code IS NULL;
-- The trigger fires on INSERT only, so backfill needs a one-time script:
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

**New `friendships` table:**

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
```

**RLS policies for `friendships`:**

- SELECT: user is requester or addressee
- INSERT: user is the requester, no existing friendship between the pair (either direction)
- UPDATE (status only): user is the addressee and current status is `pending`
- DELETE: user is requester or addressee

## Discord OAuth Integration

### Scope Addition

Add `relationships.read` scope to the Discord provider in Supabase Dashboard (Authentication > Providers > Discord). No code change needed — Supabase passes configured scopes automatically. The Discord OAuth2 authorization URL:

```
https://discord.com/oauth2/authorize?client_id=1470389008415850509&response_type=code&redirect_uri=https%3A%2F%2Fyfoifmqjhavxidomgids.supabase.co%2Fauth%2Fv1%2Fcallback&scope=relationships.read
```

### Auth Callback Enhancement

In `api/auth/callback/route.ts`, after `exchangeCodeForSession`:

1. Call `supabase.auth.getUser()`
2. Check if provider is Discord via `user.identities`
3. Extract `provider_id` as Discord ID
4. Upsert `discord_id` into `profiles` table

### Provider Token Usage

Supabase stores the Discord `provider_token` on the session. The `/api/social/discord-suggestions` route uses this token to call Discord's `GET /users/@me/relationships` API. If the token is expired or invalid, the route returns an empty array silently.

## API Routes

All under `src/app/api/social/`. All verify auth independently.

### Search & Discovery

#### GET `api/social/search?q=<name>`

Search profiles by `display_name` using ILIKE. Returns top 10 matches excluding self, existing friends, and pending requests. Response: `{ id, display_name, avatar_url, current_level, friend_code }[]`.

#### GET `api/social/lookup?code=<PSC-XXXX>`

Exact match on `friend_code`. Returns single profile `{ id, display_name, avatar_url, current_level }` or 404.

#### GET `api/social/discord-suggestions`

Only works for Discord-login users. Fetches Discord relationships using `session.provider_token`, calls `GET https://discord.com/api/v10/users/@me/relationships`, filters to type 1 (friends), cross-references Discord IDs with `profiles.discord_id`, excludes existing friends/pending requests. Returns matching profiles. Returns empty array on any failure.

### Friend Management

#### POST `api/social/request`

Body: `{ addressee_id: string }`. Creates a pending friendship. Validates: not self, no existing friendship row between the pair (in either direction).

#### POST `api/social/respond`

Body: `{ friendship_id: string, action: 'accept' | 'reject' }`. Only the addressee can respond. Updates status and `updated_at`.

#### DELETE `api/social/remove?id=<friendship_id>`

Either party can remove. Deletes the friendship row.

### Data Fetching

#### GET `api/social/friends`

Returns accepted friends with competitive stats:

```typescript
{
  friendship_id: string;
  friend: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    current_level: number;
    total_xp: number;
    login_streak: number;
    total_sessions: number;
    avg_scores: { [component: string]: number }; // components 1-5
    selected_character: { name: string; image_url: string } | null;
  };
}[]
```

Also returns the current user's own stats in the same shape so the client can compute comparison indicators (up/down arrows).

#### GET `api/social/requests`

Returns pending requests split into incoming and outgoing: `{ incoming: FriendRequest[], outgoing: FriendRequest[] }`. Each includes the other user's profile summary.

#### GET `api/social/request-count`

Returns `{ count: number }` — pending incoming request count only. Lightweight endpoint for the navbar badge.

## TypeScript Types

Add to `src/types/database.ts`:

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

## UI

### Navigation

Add "Social" item to profile dropdown menu (between "Profile" and "Log Out") with `Users` lucide icon. Show a pixel-styled badge with pending incoming request count when > 0.

In `(main)/layout.tsx`, fetch pending incoming request count alongside existing profile data via `Promise.all`. Pass count to Navbar component.

Same addition to mobile Sheet menu.

### Social Page (`(main)/social/`)

Single scrollable page with three sections. Server component fetches initial data, renders client component via `next/dynamic`.

**Files:**

- `(main)/social/page.tsx` — server component, fetches friends + requests + user identity + own stats
- `(main)/social/social-client.tsx` — client component with all UI logic
- `(main)/social/loading.tsx` — skeleton

**Friend Code Display (top-right):**

User's own friend code shown prominently with a copy-to-clipboard button. Format: `PSC-XXXX`.

**Section 1: Add Friends (top)**

- Two input modes side by side:
  - Search bar: display name search, debounced 300ms, triggers on 2+ chars
  - Friend code input: `PSC-____` format with auto-prefix
- Search results appear inline below: avatar, display_name, level badge, "Add" button
- Button changes to "Requested" (disabled) after sending
- Friend code lookup shows single result card or "No user found"
- **Discord Suggestions** sub-section (only for Discord-login users):
  - Header: "Discord Friends on XiYouQuest"
  - Auto-populated on page load
  - List with "Add" buttons
  - Hidden entirely if no token, API fails, or zero matches

**Section 2: Pending Requests (middle, conditional)**

- Only renders if there are pending requests
- Header with count: "Friend Requests (N)"
- Incoming: compact cards with Accept / Reject buttons (pixel-btn styling)
- Outgoing: compact cards with "Pending..." label and Cancel button

**Section 3: Friends List (bottom)**

- Header with count: "Friends (N)"
- Responsive grid (1 col mobile, 2 col md, 3 col lg)
- Each friend card shows:
  - Avatar, display name, level badge
  - XP with comparison arrow (green up / red down vs your XP)
  - Login streak with flame icon
  - Selected character name
  - Average component scores (1-5) as 5 small colored bars
  - Total practice sessions
- "Remove" button with AlertDialog confirmation
- Empty state: "No friends yet — search above or share your friend code!"

### Pixel Art Theme Consistency

All components use existing theme: `pixel-border`, `pixel-btn`, Press Start 2P headings, VT323 body text, warm cream/brown/amber palette, `bg-background/80 backdrop-blur-sm` content areas.

## Error Handling

- Search: inline "No users found" message
- Friend code lookup: inline "Invalid code" or "No user found"
- Friend request: toast on success ("Request sent!") and failure ("Already requested" / generic error)
- Discord suggestions: silent failure — section doesn't render
- Remove friend: toast confirmation after successful deletion
- Network errors: existing error boundary behavior

## Scope Boundaries

NOT included in this feature:

- Real-time notifications (Supabase Realtime) — badge count refreshes on page load only
- Chat/messaging between friends
- Leaderboards or friend ranking page
- Profile privacy settings
- Block feature
