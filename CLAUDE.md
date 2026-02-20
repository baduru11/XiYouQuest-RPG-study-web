# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XiYouQuest (西游Quest) — an AI-powered web app for practicing the Putonghua Proficiency Test (PSC / 普通话水平测试). Users practice all 5 official PSC components plus 2 supplementary drills, with real-time pronunciation scoring, AI feedback from Journey to the West (西游记) character companions, and a full gamification system including an RPG story campaign and achievements. Features a pixel-art retro UI theme with a Chinese-ink aesthetic.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build (Turbopack)
npm run start    # Start production server
npm run lint     # ESLint
npm run test     # Vitest unit tests
```

## Architecture

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Supabase · Tailwind CSS 4 · shadcn/ui (New York style) · Vercel

### Route Structure

```
src/app/
├── page.tsx                    # Auth redirect (→ /login or /dashboard)
├── (auth)/login/               # Email/password + Google/Discord OAuth
├── (main)/                     # Protected layout — enforces auth, renders Navbar
│   ├── dashboard/              # Home hub — splash screen + tile menu (Main Quest, Practice, Mock Exam, Leaderboard, Characters, Achievements, Profile, Social)
│   ├── main-quest/             # RPG story campaign — 7 stages, turn-based pronunciation battles
│   ├── practice/               # Quest board — 7 component cards
│   ├── component-1/            # Monosyllabic characters (读单音节字词)
│   ├── component-2/            # Multisyllabic words (读多音节词语)
│   ├── component-3/            # Vocabulary/grammar judgment (选择判断)
│   ├── component-4/            # Passage reading (朗读短文)
│   ├── component-5/            # Prompted speaking (命题说话)
│   ├── component-6/            # Cantonese mistakes drill (易错字词练习) — pronunciation
│   ├── component-7/            # Polyphonic characters quiz (多音字练习) — MCQ
│   ├── mock-exam/              # Full 5-component exam simulation with PSC grade mapping
│   ├── leaderboard/            # Global and friends leaderboard (XP / Accuracy / Streak)
│   ├── characters/             # Character gallery, quest-based unlocks, affection display
│   ├── achievements/           # Achievement showcase with tier filters and friend activity feed
│   ├── profile/                # User stats, practice history, level progress, account deletion
│   └── social/                 # Friends list, friend requests, user search, friend code lookup
└── api/
    ├── speech/assess           # iFlytek ISE pronunciation scoring via WebSocket (POST FormData)
    ├── speech/c5-assess        # 3-step C5 pipeline: ASR + ISE + Gemini scoring (POST FormData)
    ├── tts/speak               # Academic TTS via iFlytek WebSocket (POST JSON → audio/wav)
    ├── tts/companion           # Character voice via iFlytek WebSocket (POST JSON → audio/wav)
    ├── ai/feedback             # Gemini character-personalized feedback
    ├── auth/callback           # OAuth callback handler (Google/Discord)
    ├── auth/delete-account     # Account deletion with cascading cleanup (DELETE)
    ├── progress/update         # XP, level, affection, streaks, daily bonus, achievement checks
    ├── quest/progress          # Quest stage progress (GET/POST) — tracks cleared stages, best scores
    ├── leaderboard             # Global and friends leaderboard (GET)
    ├── achievements/
    │   ├── feed                # Friend activity feed — recent achievement unlocks
    │   └── mock-exam           # Mock exam achievement trigger
    └── social/                 # Friends system
        ├── search              # Search users by display name
        ├── lookup              # Look up user by friend code (PSC-XXXX)
        ├── request             # Send friend request
        ├── requests            # List incoming + outgoing pending requests
        ├── request-count       # Pending request count (navbar badge)
        ├── respond             # Accept/reject request + achievement trigger
        ├── friends             # List friends with full stats
        ├── remove              # Remove friend
        └── discord-suggestions # Suggest friends via Discord
```

### Auth Flow

Three-layer auth: **middleware** refreshes session → **(main)/layout.tsx** calls `getUser()` and redirects if unauthenticated → **pages** can safely use `user!.id` without re-checking. API routes independently verify auth. Root page (`/`) redirects unauthenticated users to `/login` and authenticated users to `/dashboard`.

### Navigation

Minimal navbar: **XiYouQuest** logo (→ `/dashboard`), XP bar, context-aware back button, profile dropdown (Profile, Social with pending badge, Achievements, Log Out with "Save & Quit?" confirmation). All primary navigation happens through the home hub tile menu at `/dashboard`.

### External Services (all in `src/lib/`)

| Service | Client | Env Vars | Purpose |
|---------|--------|----------|---------|
| Supabase | `supabase/client.ts` (browser), `supabase/server.ts` (SSR) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | DB, auth, RLS, storage |
| iFlytek ISE | `iflytek-speech/client.ts` (WebSocket) | `IFLYTEK_APP_ID`, `IFLYTEK_API_KEY`, `IFLYTEK_API_SECRET` | Pronunciation scoring (zh-CN) — categories: read_syllable (C1), read_word (C2/C6), read_chapter (C4/C5) |
| iFlytek IST | `iflytek-speech/asr-client.ts` (WebSocket) | same as ISE | Automatic Speech Recognition for C5 transcription |
| Google Gemini | `gemini/client.ts` | `GEMINI_API_KEY` | AI feedback & C5 content analysis (gemini-2.0-flash) with retry logic (3 retries, exponential backoff) |
| iFlytek TTS | `voice/client.ts` | same as ISE | TTS — Academic and Companion voices via WebSocket (PCM 16kHz, zh-CN) |

### Practice Session Pattern

Each component page (server component) fetches character data + questions from Supabase via `Promise.all`, then renders a heavy client component via `next/dynamic`:
- Components 1-2: `PracticeSession` — pronunciation drill in word groups (record → iFlytek ISE assess → Gemini feedback)
- Component 3: `QuizSession` — multiple-choice quiz (word-choice, measure-word, sentence-order)
- Component 4: `ReadingSession` — passage reading with speech scoring
- Component 5: `SpeakingSession` — timed prompted speaking (3 min) with ASR + ISE + Gemini pipeline
- Component 6: `PracticeSession` (own copy) — Cantonese trouble sounds drill, 3 sequential categories (平翘舌/前后鼻/边鼻), 2 groups of 5 per category
- Component 7: Reuses C3 `QuizSession` — polyphonic character MCQ with highlighted characters in sentences, 15 per session
- Mock Exam: `ExamRunner` — all 5 components sequentially with PSC grade mapping

### Main Quest RPG System (`src/lib/quest/`, `src/components/quest/`)

Journey to the West themed 7-stage story campaign with turn-based pronunciation battles:
- **State machine**: intro → stage_select → story → battle → victory/defeat
- **Battle mechanics**: Player attacks via pronunciation recording (score ≥ 80 = hit), boss attacks via timed MCQ (wrong = lose 1 HP)
- **Party system**: Player HP = base 3 + 2 per unlocked companion (max 9). Characters unlock on stage clear.
- **12 quest components**: intro-screen, stage-select (SVG world map), story-screen, battle-screen, battle-arena, boss-sprite, party-sprites, attack-animation (3-frame Wukong dash), boss-attack (MCQ), player-attack (recording), victory-screen, defeat-screen
- **Progress**: `quest_progress` table tracks `is_cleared`, attempts, `best_score`, `cleared_at`

### Achievements System (`src/lib/achievements/`)

31 achievements across 4 tiers (Common/Uncommon/Rare/Epic). Event-driven checking from 6 trigger points: quest_clear, quest_fail, session_complete, friend_added, mock_exam_complete, account_created. Toast notifications via React Context. Achievement page with tier filters, completion stats, and friend activity feed.

### Speech Evaluation System (`src/lib/iflytek-speech/`)

Pronunciation assessment uses iFlytek ISE (Intelligent Speech Evaluation) via WebSocket (`wss://ise-api-sg.xf-yun.com/v2/ise`) with HMAC-SHA256 auth (same credentials as TTS):
- **Categories**: `read_syllable` (C1 monosyllabic), `read_word` (C2/C6 multisyllabic), `read_chapter` (C4 passages, C5 speaking)
- **Scores**: total_score, phone_score (声韵分), fluency_score, tone_score (调型分), integrity_score (完整度分)
- **Per-word detail**: accuracy score, dp_message (omission/insertion/mispronunciation/repetition), perr_msg (vowel/tone/both errors)
- **Protocol**: 3-stage WebSocket — SSB (params + text), AUW (1280-byte audio chunks at 40ms), result (base64 XML)
- Audio: PCM 16kHz 16-bit mono (WAV header auto-stripped)

### TTS System (`src/lib/voice/`)

All TTS uses iFlytek's global open platform WebSocket API (`wss://tts-api-sg.xf-yun.com/v2/tts`) with HMAC-SHA256 auth:
- **Academic** (`synthesizeAcademic`): Clear, consistent Putonghua via iFlytek WebSocket — used for reading individual words, passages, sentences
- **Server-side cache**: In-memory LRU (max 500 entries), keyed on `academic:voiceId:text`

15 iFlytek voices configured (default: `x_xiaoyan`). Audio: PCM 16kHz 16-bit mono, wrapped in WAV headers.

### C5 Scoring System (`src/lib/scoring/c5-scoring.ts`)

Implements official PSC Component 5 rubric (total 30 pts, normalized to 0-100):
- Pronunciation (20 pts): ISE error count + dialect detection (avg tone score < 60), 6-level grading
- Vocabulary/Grammar (5 pts): Gemini level 1-3 deductions
- Fluency (5 pts): 3-tier fallback (ISE fluencyScore → ISE total → Gemini)
- Time penalty: -1/sec for each second under 3 minutes, capped at 30

### Pinyin System (`src/lib/pinyin.ts`, `src/lib/voice/pinyin-data.ts`)

- `pinyin-data.ts`: 1,583 lines of lookup tables for monosyllabic and multisyllabic characters → pinyin
- `pinyin.ts`: Tone-number to tone-mark conversion (e.g., `"guo2"` → `"guó"`) with proper tone placement rules
- `lookupPinyinDisplay()`: Combined lookup + display conversion

### Gamification System (`src/types/gamification.ts`, `src/lib/gamification/xp.ts`)

- **XP**: perfect=10, good=5, attempted=2, daily login=25, max 2000/session
- **Streak multipliers**: 5+=1.5x, 10+=2.0x
- **User levels**: 10 tiers (Beginner → PSC God, 0–10000 XP)
- **Character affection**: 5 levels per character (Acquaintance → Soulmate, 0–2000 XP)
- Progress update route handles all XP/streak/level/affection calculations server-side

### Character System

4 Journey to the West (西游记) themed companions unlocked through quest progression:
- **Sun Wukong** (孙悟空) — default, `/img/main character/son wukong/`
- **Tang Sanzang** (三藏) — unlocked at Stage 2, `/img/main character/sam jang/`
- **Sha Wujing** (沙悟净) — unlocked at Stage 3, `/img/main character/sha wujing/`
- **Zhu Bajie** (猪八戒) — unlocked at Stage 6, `/img/main character/zhu bajie/`

`src/lib/character-images.ts` maps names to local image paths. `getCharacterImageFallback()` provides fallback images. `CharacterDisplay` renders expression-based images with transitions. Each character has a unique personality prompt for Gemini AI feedback.

### Database (Supabase PostgreSQL with RLS)

12 tables defined in `src/types/database.ts`: profiles, user_progress, characters, character_expressions, character_skins, user_characters, practice_sessions, practice_details, question_banks, friendships, achievements, user_achievements. Additional `quest_progress` table managed via quest API. Component columns support values 1-7 (C1-C5 are official PSC components, C6-C7 are supplementary drills). Migrations applied via Supabase MCP (`apply_migration`).

### UI Theme

Pixel-art retro aesthetic with Chinese-ink influences:
- **Fonts**: Press Start 2P (pixel headings), VT323 (retro body), ZCOOL XiaoWei (Chinese display text)
- **Colors**: Warm cream background (`--background: #FFF8E7`), vermilion primary (`--primary: #C8102E`), rosewood border (`--border: #8B4513`), gold accent (`--accent: #C9A96E`)
- **Effects**: `pixel-border` (3px solid brown + drop shadow), `pixel-glow`, `pixel-btn` (4px drop shadow), `--radius: 0px`
- **Chinese motifs**: `chinese-frame` (double rosewood/gold border), `chinese-corner` (vermilion L-bracket corners), `chinese-divider` (gradient with center diamond)
- **Animations**: shimmer, fade-in-up, pixel-pulse, blink-cursor, ink-fade; battle-specific: idle-bob, boss-float, flinch, recoil, float-damage, heart-shatter
- Respects `prefers-reduced-motion`

## Key Conventions

- Path alias: `@/*` → `./src/*`
- UI components: shadcn/ui in `src/components/ui/`, custom in `src/components/shared/` and `src/components/character/`
- Practice components: `src/components/practice/` (AudioRecorder with WAV 16-bit PCM encoding)
- Quest components: `src/components/quest/` (12 battle/story UI components)
- Static assets: `public/img/background/` (site background), `public/img/main character/` (party sprites), `public/img/boss/` (boss sprites + attack frames), `public/img/main stage/` (stage backgrounds), `public/img/passage/` (reading passage images)
- Background image applied globally via `globals.css` body; content areas use `bg-background/80 backdrop-blur-sm` for readability
- All page-level Supabase queries use `Promise.all` for parallel fetching
- Loading skeletons (`loading.tsx`) exist for every route under `(main)/`
- `next.config.ts` externalizes `ws` as a server package (used by iFlytek TTS, ISE, and IST WebSocket clients)
- Gemini client has retry logic: 3 retries with exponential backoff (1s, 2s, 4s + jitter) and canned fallback messages
- Client-side `fetchWithRetry` wrapper covers all 24+ internal API calls with automatic retry for transient failures
- Achievement checks are event-driven — every major action endpoint returns `newAchievements` for toast display
