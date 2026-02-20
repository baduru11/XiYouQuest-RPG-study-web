# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PSC Study Companion — an AI-powered web app for practicing the Putonghua Proficiency Test (PSC / 普通话水平测试). Users practice all 5 PSC components with real-time pronunciation scoring, AI feedback from anime character companions, and a gamification system. Features a pixel-art retro UI theme.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build (Turbopack)
npm run start    # Start production server
npm run lint     # ESLint
```

npm run test     # Vitest unit tests

## Architecture

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Supabase · Tailwind CSS 4 · shadcn/ui (New York style)

### Route Structure

```
src/app/
├── page.tsx                    # Auth redirect (→ /login or /dashboard)
├── (auth)/login/               # Email/password + Google OAuth
├── (main)/                     # Protected layout — enforces auth, renders Navbar
│   ├── dashboard/              # Home hub — single-column tile menu (Practice, Mock Exam, Leaderboard, Characters, Profile)
│   ├── practice/               # Quest board — 5 component cards + supplementary drills
│   ├── component-1/            # Monosyllabic characters (读单音节字词)
│   ├── component-2/            # Multisyllabic words (读多音节词语)
│   ├── component-3/            # Vocabulary/grammar judgment (选择判断)
│   ├── component-4/            # Passage reading (朗读短文)
│   ├── component-5/            # Prompted speaking (命题说话)
│   ├── component-6/            # Cantonese mistakes drill (易错字词练习) — pronunciation
│   ├── component-7/            # Polyphonic characters quiz (多音字练习) — MCQ
│   ├── leaderboard/            # Global and friends leaderboard
│   ├── characters/             # Gallery, unlock shop, affection display
│   ├── profile/                # User stats, practice history, level progress
│   ├── social/                 # Friends list, friend requests, user search
│   └── mock-exam/              # Full 5-component exam simulation
└── api/
    ├── speech/assess           # iFlytek ISE pronunciation scoring via WebSocket (POST FormData)
    ├── tts/speak               # Academic TTS via iFlytek WebSocket (POST JSON → audio/wav)
    ├── tts/companion           # Character voice via iFlytek WebSocket (POST JSON → audio/wav)
    ├── ai/feedback             # Gemini character-personalized feedback
    ├── auth/callback           # OAuth callback handler
    ├── progress/update         # XP, level, affection, streaks, daily bonus
    ├── leaderboard             # Global and friends leaderboard (GET)
    └── social/                 # Friends system
        ├── search              # Search users by username
        ├── lookup              # Look up user by display name
        ├── request             # Send friend request
        ├── requests            # List incoming requests
        ├── request-count       # Pending request count
        ├── respond             # Accept/reject request
        ├── friends             # List friends
        ├── remove              # Remove friend
        └── discord-suggestions # Suggest friends via Discord
```

### Auth Flow

Three-layer auth: **middleware** refreshes session → **(main)/layout.tsx** calls `getUser()` and redirects if unauthenticated → **pages** can safely use `user!.id` without re-checking. API routes independently verify auth. Root page (`/`) redirects unauthenticated users to `/login` and authenticated users to `/dashboard`.

### Navigation

Minimal navbar: **XiYouQuest** logo (→ `/dashboard`), XP bar, profile dropdown (Profile, Social with pending badge, Log Out with confirmation). All primary navigation happens through the home hub tile menu at `/dashboard`.

### External Services (all in `src/lib/`)

| Service | Client | Env Vars | Purpose |
|---------|--------|----------|---------|
| Supabase | `supabase/client.ts` (browser), `supabase/server.ts` (SSR) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | DB, auth, RLS |
| iFlytek ISE | `iflytek-speech/client.ts` (WebSocket) | `IFLYTEK_APP_ID`, `IFLYTEK_API_KEY`, `IFLYTEK_API_SECRET` | Pronunciation scoring (zh-CN) — categories: read_syllable (C1), read_word (C2), read_chapter (C4/C5). Returns tone scores, phone-level error detail |
| Google Gemini | `gemini/client.ts` | `GEMINI_API_KEY` | AI feedback & question gen (gemini-2.0-flash) with retry logic (3 retries, exponential backoff) |
| iFlytek TTS | `voice/client.ts` | `IFLYTEK_APP_ID`, `IFLYTEK_API_KEY`, `IFLYTEK_API_SECRET` | TTS — Academic and Companion voices via WebSocket (PCM 16kHz, zh-CN) |

### Practice Session Pattern

Each component page (server component) fetches character data + questions from Supabase via `Promise.all`, then renders a heavy client component via `next/dynamic`:
- Components 1-2: `PracticeSession` — pronunciation drill in word groups (record → iFlytek ISE assess → Gemini feedback)
- Component 3: `QuizSession` — multiple-choice quiz (word-choice, measure-word, sentence-order)
- Component 4: `ReadingSession` — passage reading with speech scoring
- Component 5: `SpeakingSession` — timed prompted speaking (3 min)
- Component 6: `PracticeSession` (own copy) — Cantonese trouble sounds drill, 3 sequential categories (平翘舌/前后鼻/边鼻), 2 groups of 5 per category
- Component 7: Reuses C3 `QuizSession` — polyphonic character MCQ with highlighted characters in sentences, 15 per session
- Mock Exam: `ExamRunner` — all 5 components sequentially with PSC grade mapping

### Speech Evaluation System (`src/lib/iflytek-speech/`)

Pronunciation assessment uses iFlytek ISE (Intelligent Speech Evaluation) via WebSocket (`wss://ise-api-sg.xf-yun.com/v2/ise`) with HMAC-SHA256 auth (same credentials as TTS):
- **Categories**: `read_syllable` (C1 monosyllabic), `read_word` (C2 multisyllabic), `read_chapter` (C4 passages, C5 speaking)
- **Scores**: total_score, phone_score (声韵分), fluency_score, tone_score (调型分), integrity_score (完整度分)
- **Per-word detail**: accuracy score, dp_message (omission/insertion/mispronunciation/repetition), perr_msg (vowel/tone/both errors)
- **Protocol**: 3-stage WebSocket — SSB (params + text), AUW (1280-byte audio chunks at 40ms), result (base64 XML)
- Audio: PCM 16kHz 16-bit mono (WAV header auto-stripped)

### TTS System (`src/lib/voice/`)

All TTS uses iFlytek's global open platform WebSocket API (`wss://tts-api-sg.xf-yun.com/v2/tts`) with HMAC-SHA256 auth:
- **Academic** (`synthesizeAcademic`): Clear, consistent Putonghua via iFlytek WebSocket — used for reading individual words, passages, sentences

15 iFlytek voices configured (default: `x_xiaoyan`). Audio: PCM 16kHz 16-bit mono, wrapped in WAV headers.

### Pinyin System (`src/lib/pinyin.ts`, `src/lib/voice/pinyin-data.ts`)

- `pinyin-data.ts`: 1,583 lines of lookup tables for monosyllabic and multisyllabic characters → pinyin
- `pinyin.ts`: Tone-number to tone-mark conversion (e.g., `"guo2"` → `"guó"`) with proper tone placement rules
- `lookupPinyinDisplay()`: Combined lookup + display conversion

### Gamification System (`src/types/gamification.ts`, `src/lib/gamification/xp.ts`)

- **XP**: perfect=10, good=5, attempted=2, daily login=25
- **Streak multipliers**: 5+=1.5x, 10+=2.0x
- **User levels**: 10 tiers (Beginner → PSC God, 0–10000 XP)
- **Character affection**: 5 levels per character (Acquaintance → Soulmate, 0–2000 XP)
- Progress update route handles all XP/streak/level/affection calculations server-side

### Character Image System

`src/lib/character-images.ts` maps character names to local image paths (`/img/main character/{name}/`). `getCharacterImageFallback()` provides local images as the `neutral` expression when Supabase has no expression images. The `CharacterDisplay` component renders expression-based images with transitions. Characters are Journey to the West (西遊記) themed: Sun Wukong (`/img/main character/son wukong/오공 명함.webp`), Zhu Bajie (`/img/main character/zhu bajie/저팔계 명함.webp`), Sha Wujing (`/img/main character/sha wujing/사오정 명함.webp`), Tang Sanzang (`/img/main character/sam jang/삼장 명함.webp`).

### Database (Supabase PostgreSQL with RLS)

10 tables defined in `src/types/database.ts`: profiles, user_progress, characters, character_expressions, character_skins, user_characters, practice_sessions, practice_details, question_banks, friendships. Component columns support values 1-7 (C1-C5 are official PSC components, C6-C7 are supplementary drills). Migrations applied via Supabase MCP (`apply_migration`).

### UI Theme

Pixel-art retro aesthetic with:
- **Fonts**: Press Start 2P (pixel headings), VT323 (retro body), Noto Sans SC (Chinese text)
- **Colors**: Warm cream/brown/amber palette (`--background: #FDF6E3`, `--primary: #B45309`)
- **Effects**: `pixel-border` (3px shadow), `pixel-glow`, `pixel-btn` (4px drop shadow), `--radius: 0px`
- **Animations**: shimmer, fade-in-up, pixel-pulse, blink-cursor
- Respects `prefers-reduced-motion`

## Key Conventions

- Path alias: `@/*` → `./src/*`
- UI components: shadcn/ui in `src/components/ui/`, custom in `src/components/shared/` and `src/components/character/`
- Practice components: `src/components/practice/` (AudioRecorder with WAV 16-bit PCM encoding)
- Static assets: `public/img/background/` (site background), `public/img/character/{Name}/` (character images)
- Background image applied globally via `globals.css` body; content areas use `bg-background/80 backdrop-blur-sm` for readability
- All page-level Supabase queries use `Promise.all` for parallel fetching
- Loading skeletons (`loading.tsx`) exist for every route under `(main)/`
- `next.config.ts` externalizes `ws` as a server package (used by iFlytek TTS and ISE WebSocket clients)
- Gemini client has retry logic: 3 retries with exponential backoff (1s, 2s, 4s + jitter) and canned fallback messages
