# Home Hub & Landing Page Redesign

## Summary

Replace the marketing landing page with a login-first flow, and convert the post-login dashboard into a hub-style menu with single-column tile navigation. Simplify the navbar to logo + XP bar + profile dropdown.

## Current State

- `/` — Marketing landing page with features grid and "Start Game" button; redirects logged-in users to `/dashboard`
- `/dashboard` — Quest board (5 component cards with stats), character greeting, quick actions (Mock Exam, Character)
- Navbar — Logo, 8 nav links (Home, C1-C5, Character, Ranks), XP bar, profile dropdown, mobile hamburger

## Design

### Route Changes

| Route | Before | After |
|-------|--------|-------|
| `/` | Marketing landing page | Auth check → redirect to `/login` or `/dashboard` |
| `/dashboard` | Quest board + greeting + quick actions | New home hub with tile menu |
| `/practice` | N/A | Current dashboard content (quest board with 5 components) |

All other routes unchanged: `/mock-exam`, `/leaderboard`, `/characters`, `/profile`, `/social`, `/component-1` through `/component-5`.

### Home Hub Layout (`/dashboard`)

Centered single-column (`max-w-2xl`) of full-width tiles:

```
┌─────────────────────────────────┐
│  PSC Quest                      │  Website name (decorative header, not a link)
├─────────────────────────────────┤
│  Main Quest          [Coming]   │  Disabled, "Coming Soon" badge
├─────────────────────────────────┤
│  Practice Session           →   │  Links to /practice
├─────────────────────────────────┤
│  Mock Exam                  →   │  Links to /mock-exam
├─────────────────────────────────┤
│  Leaderboard                →   │  Links to /leaderboard
├─────────────────────────────────┤
│  Characters                 →   │  Links to /characters
├─────────────────────────────────┤
│  Profile / Social / Logout      │  Links to /profile
└─────────────────────────────────┘
```

Each tile:
- `pixel-border` card with `hover:pixel-border-primary` transition
- Icon on left, label text, right-arrow or badge on right
- PSC Quest tile uses `font-pixel` + `pixel-glow`
- Main Quest tile has reduced opacity + "Coming Soon" tag

No character greeting. No stats on the hub — stats live on the practice page.

### Navbar Simplification

```
┌──────────────────────────────────────────────┐
│  PSC Quest          [═══XP Bar═══]  👤 Name ▾│
└──────────────────────────────────────────────┘
```

- **Left:** "PSC Quest" logo → links to `/dashboard`
- **Right:** XP bar + Profile dropdown (avatar, name, dropdown: Profile, Social with pending badge, Log Out with confirmation)
- **Removed:** All nav link buttons (Home, C1-C5, Character, Ranks), mobile hamburger Sheet

On mobile: logo + XP bar + profile dropdown. Users tap logo to return to hub.

### Auth Flow

Unchanged three-layer auth. The only difference:
- Root (`/`) redirects unauthenticated users to `/login` instead of showing a marketing page
- Root (`/`) redirects authenticated users to `/dashboard` (same as before)

## File Changes

### Modified
1. **`src/app/page.tsx`** — Strip to auth check + redirect (`/login` or `/dashboard`)
2. **`src/components/shared/navbar.tsx`** — Remove `NAV_ITEMS`, desktop nav links, mobile `Sheet`/hamburger. Keep logo, XP bar, profile dropdown, logout dialog

### Moved
3. **`src/app/(main)/dashboard/page.tsx`** → **`src/app/(main)/practice/page.tsx`** — Quest board content, unchanged
4. **`src/app/(main)/dashboard/loading.tsx`** → **`src/app/(main)/practice/loading.tsx`** — Loading skeleton moves with it

### New
5. **`src/app/(main)/dashboard/page.tsx`** — Home hub with tile layout
6. **`src/app/(main)/dashboard/loading.tsx`** — Hub loading skeleton (column of shimmer rectangles)

### Unchanged
- All component pages, mock-exam, leaderboard, characters, profile, social
- API routes, `(main)/layout.tsx`, auth flow, middleware
- `(auth)/login/` page

## Updates Required
- **`CLAUDE.md`** — Update route structure to reflect `/practice` route and new `/dashboard` description, update navbar description
