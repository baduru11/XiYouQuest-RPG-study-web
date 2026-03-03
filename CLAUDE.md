# CLAUDE.md

## Project Overview

XiYouQuest (西游Quest) — AI-powered PSC (Putonghua Proficiency Test) practice web app with Journey to the West character companions, real-time pronunciation scoring, RPG story campaign, and gamification. 7 practice components (C1-C5 official PSC + C6-C7 supplementary drills).

## Commands

```bash
npm run dev      # Dev server (localhost:3000)
npm run build    # Production build (Turbopack)
npm run lint     # ESLint
npm run test     # Vitest unit tests
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Supabase · Tailwind CSS 4 · shadcn/ui (New York style) · Vercel

## Auth Flow (3-layer — non-obvious)

1. **Middleware** (`middleware.ts`) refreshes Supabase session on every request
2. **`(main)/layout.tsx`** calls `getUser()`, redirects to `/login` if unauthenticated
3. **Pages** safely use `user!.id` without re-checking

API routes independently verify auth. Root `/` redirects based on auth state.

## External Services

All clients live in `src/lib/`. Env vars in `.env.local`:

| Service | Client file | Env vars |
|---------|------------|----------|
| Supabase | `supabase/client.ts`, `supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| iFlytek (ISE + ASR + TTS) | `iflytek-speech/client.ts`, `iflytek-speech/asr-client.ts`, `voice/client.ts` | `IFLYTEK_APP_ID`, `IFLYTEK_API_KEY`, `IFLYTEK_API_SECRET` |
| DeepSeek v3.2 (via OpenRouter) | `gemini/client.ts` | `OPENROUTER_API_KEY` |

**Note:** The AI client file is still named `gemini/client.ts` (historical) but uses OpenRouter/DeepSeek. Exports: `generateFeedback()`, `analyzeC5Speaking()`, `chatConversation()`.

| Gemini 3.1 Flash (via OpenRouter) | `image-gen/client.ts` | `OPENROUTER_API_KEY` |

## Key Patterns & Gotchas

- **Path alias:** `@/*` maps to `./src/*`
- **`next.config.ts`** externalizes `ws` — required for iFlytek WebSocket clients (TTS, ISE, ASR) running server-side
- **Component pages** are server components that fetch data via `Promise.all`, then render heavy client components via `next/dynamic`
- **`fetchWithRetry`** wrapper: all 24+ client-side API calls use automatic retry for transient failures
- **AI retry logic:** 3 retries with exponential backoff (1s, 2s, 4s + jitter), falls back to canned Chinese/English messages on total failure
- **Achievement checks are event-driven** — action endpoints return `newAchievements` array for toast display via React Context
- **Loading skeletons** (`loading.tsx`) exist for every route under `(main)/`
- **Audio format:** all speech recording/TTS uses PCM 16kHz 16-bit mono (WAV header auto-stripped before sending to iFlytek)
- **Database:** types in `src/types/database.ts`, component columns accept values 1-7. Migrations via Supabase MCP (`apply_migration`)
- **Quest battle state machine:** intro → stage_select → story → battle → victory/defeat (see `src/lib/quest/`)
- **Companion chat state machine:** select_companion → select_scenario → chatting → summary (see `src/app/(main)/companion-chat/`)
- **UI theme:** pixel-art retro with Chinese-ink aesthetic — theme vars in `globals.css`, utility classes like `pixel-border`, `chinese-frame`, `chinese-corner`

## File Organization

```
src/components/ui/          # shadcn/ui primitives
src/components/shared/      # Custom reusable components
src/components/practice/    # AudioRecorder, practice sessions
src/components/quest/       # 12 battle/story RPG components
src/components/character/   # Character display, gallery
src/lib/                    # All business logic and external service clients
src/types/                  # TypeScript types (database.ts, gamification.ts, etc.)
public/img/                 # Sprites, backgrounds, boss art (spaces in folder names)
```
