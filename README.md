# PSC Study Companion

An AI-powered web app for practicing the **Putonghua Proficiency Test (PSC / 普通话水平测试)** with anime character companions, real-time pronunciation scoring, and gamification. Features a pixel-art retro UI.

Built for the HKUST GenAI Hackathon.

## Features

### All 5 PSC Exam Components

| Component | Name | Type |
|-----------|------|------|
| 1 | **Monosyllabic Characters** (读单音节字词) | Group-based pronunciation drill with per-character scoring |
| 2 | **Multisyllabic Words** (读多音节词语) | Multi-word practice with pinyin display and tone analysis |
| 3 | **Vocabulary & Grammar Judgment** (选择判断) | Multiple-choice: word choice, measure words, sentence order |
| 4 | **Passage Reading** (朗读短文) | Full passage reading with sentence-by-sentence scoring |
| 5 | **Prompted Speaking** (命题说话) | 3-minute timed speaking with AI analysis |

### AI-Powered Speech Scoring

- **iFlytek ISE** (Intelligent Speech Evaluation) provides pronunciation assessment with tone, phone-level, and fluency scores
- Categories: `read_syllable` (C1), `read_word` (C2), `read_chapter` (C4/C5)
- Per-word detail with accuracy, dp_message (omission/insertion/mispronunciation), and error types
- Supports Components 1, 2, 4, and 5

### AI Feedback with Google Gemini

- **Gemini 2.0 Flash** generates contextual, personality-driven feedback
- Dynamic question generation for unlimited practice variety
- Retry logic with exponential backoff (3 retries) and canned fallback messages
- Feedback adapts to the character companion you've selected

### TTS System (iFlytek WebSocket)

- **Academic Voice**: Clear, consistent Putonghua for vocabulary, passages, and sentences via iFlytek TTS WebSocket API
- **Companion Voice**: Character voice via iFlytek TTS WebSocket API
- **Word Group Synthesis**: Multiple words with normalized pauses (300-750ms) between them

### Anime Character Companions

- Unlock and collect study companions, each with a unique personality
- 10 facial expressions (neutral, happy, proud, excited, thinking, encouraging, teasing, surprised, listening, disappointed) react in real-time
- Build affection by practicing together — unlock skins at higher affection levels
- Expression-based voice instructions adjust TTS speaking style

### Gamification System

- **XP Rewards**: 10 XP perfect (90+), 5 XP good (60-89), 2 XP attempted (<60) with streak multipliers (1.5x at 5-streak, 2x at 10-streak)
- **Daily Login Bonus**: 25 XP per day
- **10 Player Levels**: Beginner (0 XP) through PSC God (10,000 XP)
- **5 Affection Levels**: Acquaintance through Soulmate per character
- Character unlocks cost XP, rewarding consistent practice

### Mock Exam Mode

Full PSC simulation running all 5 components sequentially with time limits:

| Component | Time | Weight |
|-----------|------|--------|
| Monosyllabic | 3:30 | 10% |
| Multisyllabic | 2:30 | 20% |
| Judgment | 3:00 | 10% |
| Passage Reading | 4:00 | 30% |
| Prompted Speaking | 3:00 | 30% |

Results mapped to official PSC grades:

| Score | Grade |
|-------|-------|
| 97+ | 一级甲等 (First Class, Grade A) |
| 92-96 | 一级乙等 (First Class, Grade B) |
| 87-91 | 二级甲等 (Second Class, Grade A) |
| 80-86 | 二级乙等 (Second Class, Grade B) |
| 70-79 | 三级甲等 (Third Class, Grade A) |
| 60-69 | 三级乙等 (Third Class, Grade B) |
| <60 | 不达标 (Below Standard) |

### Pixel-Art Retro UI

- Custom theme with Press Start 2P, VT323, and Noto Sans SC fonts
- Warm cream/brown/amber palette with pixel borders and glow effects
- Custom animations: shimmer, fade-in-up, pixel-pulse, blink-cursor
- Accessible — respects `prefers-reduced-motion`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) + React 19 |
| Language | TypeScript (strict) |
| Database | [Supabase](https://supabase.com) (PostgreSQL) with Row Level Security |
| Auth | Supabase Auth (Email + Google OAuth) |
| AI Feedback | [Google Gemini 2.0 Flash](https://ai.google.dev) |
| Speech Assessment | iFlytek ISE WebSocket API (Intelligent Speech Evaluation, zh-CN) |
| Text-to-Speech | iFlytek TTS WebSocket API (PCM 16kHz, zh-CN voices) |
| UI Components | [shadcn/ui](https://ui.shadcn.com) (New York style) + [Radix UI](https://www.radix-ui.com) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) |
| Icons | [Lucide React](https://lucide.dev) |
| Notifications | [Sonner](https://sonner.emilkowal.dev) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- A [Supabase](https://supabase.com) project
- API keys for: iFlytek (ISE + TTS), Google Gemini

### 1. Clone and install

```bash
git clone <repo-url>
cd PCSWebTool
npm install
```

### 2. Configure environment variables

Create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Google Gemini (AI feedback & question generation)
GEMINI_API_KEY=your_gemini_api_key

# iFlytek (TTS + Speech Evaluation)
IFLYTEK_APP_ID=your_iflytek_app_id
IFLYTEK_API_KEY=your_iflytek_api_key
IFLYTEK_API_SECRET=your_iflytek_api_secret
```

### 3. Set up the database

Apply the database schema to your Supabase project. The migration creates 10 tables (all with RLS enabled):

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles with XP, level, and login streaks |
| `characters` | AI companion definitions |
| `character_expressions` | Facial expression images per character |
| `character_skins` | Unlockable cosmetic skins |
| `user_characters` | Per-user unlocked characters with affection tracking |
| `user_progress` | Per-component practice statistics |
| `practice_sessions` | Practice session history |
| `practice_details` | Per-question results within sessions |
| `question_banks` | Pre-loaded questions for all 5 components |
| `friendships` | Friend relationships and pending requests |

Database triggers automatically create a `profiles` row on signup and unlock default characters.

### 4. Enable Google OAuth (optional)

1. Create an **OAuth 2.0 Client ID** at [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)
2. Add `https://your-project.supabase.co/auth/v1/callback` as an **Authorized redirect URI**
3. Enable **Google** in your [Supabase Dashboard > Auth > Providers](https://supabase.com/dashboard/project/_/auth/providers)

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                            # Public landing page
│   ├── layout.tsx                          # Root layout with fonts & theme
│   ├── globals.css                         # Pixel-art theme + Tailwind
│   ├── (auth)/login/                       # Email + Google OAuth login
│   ├── (main)/                             # Protected routes (auth required)
│   │   ├── layout.tsx                      # Auth guard + navbar
│   │   ├── dashboard/                      # Progress overview + component cards
│   │   ├── characters/                     # Character gallery + unlock shop
│   │   ├── component-{1-5}/               # Individual practice pages
│   │   ├── profile/                        # User stats, practice history
│   │   ├── social/                         # Friends list, requests, search
│   │   └── mock-exam/                      # Full mock exam with PSC grading
│   └── api/
│       ├── speech/assess/                  # iFlytek ISE pronunciation assessment
│       ├── tts/speak/                      # Academic TTS (iFlytek WebSocket)
│       ├── tts/companion/                  # Companion TTS (iFlytek WebSocket)
│       ├── ai/feedback/                    # Gemini AI feedback
│       ├── ai/generate/                    # Gemini question generation
│       ├── auth/callback/                  # OAuth callback
│       ├── progress/                       # XP, character, session management
│       └── social/                         # Friends system (search, request, respond, etc.)
├── components/
│   ├── ui/                                 # 16 shadcn/ui components
│   ├── shared/                             # Navbar, XPBar
│   ├── character/                          # CharacterDisplay, DialogueBox
│   └── practice/                           # AudioRecorder (WAV 16-bit PCM)
├── lib/
│   ├── supabase/                           # Browser + server clients, middleware
│   ├── iflytek-speech/client.ts            # iFlytek ISE pronunciation scoring
│   ├── voice/client.ts                     # iFlytek TTS (academic + companion + word group)
│   ├── voice/pinyin-data.ts                # Pinyin lookup tables (1,583 lines)
│   ├── gemini/client.ts                    # Gemini with retry logic
│   ├── gamification/xp.ts                  # XP, levels, streaks, affection
│   ├── question-bank/parser.ts             # Markdown question parser
│   ├── character-images.ts                 # Local image fallback mapping
│   └── pinyin.ts                           # Tone-number → tone-mark conversion
├── types/
│   ├── database.ts                         # 10 Supabase table schemas
│   ├── character.ts                        # Expression types, character state
│   ├── practice.ts                         # Practice modes, scoring types
│   └── gamification.ts                     # XP/level/affection constants
├── data/                                   # Question bank markdown files
└── middleware.ts                            # Next.js route protection
```

## API Routes

### Speech & Audio

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/speech/assess` | Pronunciation assessment via iFlytek ISE. FormData with audio + reference text. Returns per-word accuracy, tone, fluency scores. |
| POST | `/api/tts/speak` | Academic TTS via iFlytek WebSocket. Returns WAV audio. |
| POST | `/api/tts/companion` | Companion TTS via iFlytek WebSocket. Returns WAV audio. |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/feedback` | Character-personalized feedback via Gemini 2.0 Flash. |
| POST | `/api/ai/generate` | Dynamic PSC question generation. Accepts `{ component, count, difficulty }`. |

### Progress & Gamification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/progress/update` | Record session, update XP, level, streaks, and character affection. |
| POST | `/api/progress/select-character` | Switch the active character companion. |
| POST | `/api/progress/unlock-character` | Spend XP to unlock a new character. |

### Social

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/social/search` | Search users by username. |
| GET | `/api/social/lookup` | Look up user by display name. |
| POST | `/api/social/request` | Send a friend request. |
| GET | `/api/social/requests` | List incoming friend requests. |
| GET | `/api/social/request-count` | Get pending request count. |
| POST | `/api/social/respond` | Accept or reject a friend request. |
| GET | `/api/social/friends` | List current friends. |
| DELETE | `/api/social/remove` | Remove a friend. |
| GET | `/api/social/discord-suggestions` | Suggest friends via Discord. |

## Scripts

```bash
npm run dev       # Start dev server (http://localhost:3000)
npm run build     # Production build (Turbopack)
npm run start     # Run production server
npm run lint      # Run ESLint
```

## Documentation

- **Design Document**: `docs/plans/2026-02-08-psc-webtool-design.md`
- **Implementation Plan**: `docs/plans/2026-02-08-psc-webtool-implementation.md`
- **PSC Reference**: `doc/PSC_comprehensive_guide.md`

## License

This project is for educational purposes. All PSC exam content follows the national Putonghua Proficiency Test standards published by the Ministry of Education of China.
