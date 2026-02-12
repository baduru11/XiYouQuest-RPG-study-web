# PSC Web Tool — Design Document

**Date**: 2026-02-08 (last updated: 2026-02-10)
**Project**: GenAI Hackathon — Putonghua Proficiency Test Web Tool (HKUST)
**Status**: All core features implemented

---

## 1. Overview

An AI-powered web tool to help HKUST students prepare for the Putonghua Proficiency Test (PSC). Covers all 5 exam components with speech recognition, AI feedback, and a galgame-style character companion system that gamifies the learning experience.

**Key differentiator:** Anime-style 2D characters with unique personalities and AI-generated voices that act as study companions. Users earn XP, unlock new characters, build affection levels, and earn character skins — turning PSC practice into an engaging, rewarding experience without sacrificing learning quality.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (strict) + Tailwind CSS 4 + shadcn/ui |
| Database & Auth | Supabase (Postgres + RLS + built-in auth with email + Google OAuth) |
| LLM | Google Gemini 2.0 Flash (feedback + question generation) |
| Speech Recognition | iFlytek ISE WebSocket API (Mandarin pronunciation assessment — read_syllable, read_word, read_chapter) |
| Character Voices | iFlytek TTS WebSocket API (academic + companion voices, PCM 16kHz zh-CN) |
| UI Theme | Pixel-art retro (Press Start 2P, VT323, Noto Sans SC fonts) |
| Deployment | Vercel |

---

## 3. Architecture

### Data Flow

1. User logs in via Supabase Auth (email/password or Google OAuth)
2. Selects a character companion, picks a PSC component to practice
3. Character reads out words/sentences using iFlytek TTS (academic voice for clarity)
4. User listens, then speaks into mic — audio sent to iFlytek ISE for pronunciation assessment
5. Results sent to Gemini 2.0 Flash for personalized feedback with character personality
6. XP awarded based on accuracy — progress/affection tracked in Supabase
7. Unlocks (new characters, skins) triggered when thresholds are met

### API Routes (Next.js)

- `POST /api/speech/assess` — iFlytek ISE pronunciation assessment (read_syllable, read_word, read_chapter)
- `POST /api/tts/speak` — iFlytek TTS WebSocket (academic, clear pronunciation)
- `POST /api/tts/companion` — iFlytek TTS WebSocket (companion voice)
- `POST /api/ai/feedback` — Gemini 2.0 Flash feedback with character personality
- `POST /api/ai/generate` — Gemini dynamic PSC question generation
- `POST /api/progress/update` — XP, affection, streak tracking
- `POST /api/progress/unlock-character` — Character unlock via XP spend
- `POST /api/progress/select-character` — Set active companion
- `GET /api/auth/callback` — OAuth callback handler

---

## 4. Database Schema (Supabase Postgres)

### Users & Progress

**`profiles`** — extends Supabase auth
- `id`, `username`, `display_name`, `avatar_url`, `total_xp`, `current_level`, `last_login_date`, `login_streak`, `created_at`

**`user_progress`** — per-component tracking
- `user_id`, `component` (1-5), `questions_attempted`, `questions_correct`, `best_streak`, `total_practice_time_seconds`, `last_practiced_at`

### Character System

**`characters`** — the character roster
- `id`, `name`, `personality_description`, `personality_prompt`, `voice_id`, `image_url`, `unlock_cost_xp` (0 for defaults), `is_default`

**`character_expressions`** — multiple expression images per character
- `id`, `character_id`, `expression_name` (neutral, happy, proud, excited, thinking, encouraging, teasing, surprised, listening, disappointed), `image_url`

**`character_skins`** — costumes per character
- `id`, `character_id`, `skin_name`, `image_url`, `required_affection_level`

**`user_characters`** — tracks unlocked characters per user
- `user_id`, `character_id`, `unlocked_at`, `affection_xp`, `affection_level`, `active_skin_id`, `is_selected`

### Practice History

**`practice_sessions`** — every practice attempt
- `id`, `user_id`, `character_id`, `component`, `score`, `xp_earned`, `duration_seconds`, `created_at`

**`practice_details`** — individual question results within a session
- `session_id`, `question_text`, `user_answer`, `is_correct`, `pronunciation_score` (nullable), `feedback`

### Content

**`question_banks`** — parsed from markdown files
- `id`, `component`, `set_number`, `content`, `pinyin`, `metadata` (JSON)

---

## 5. PSC Components — Feature Design

### Component 1 — Monosyllabic Characters (读单音节字词) [IMPLEMENTED]

- Words displayed in groups (not one-by-one) for natural practice flow
- User records pronunciation of word groups → iFlytek ISE scores each
- Results shown per-character with color coding (green/yellow/red)
- Gemini generates targeted tips for recurring errors
- TTS plays academic voice for correct pronunciation reference

### Component 2 — Multisyllabic Words (多音节词语) [IMPLEMENTED]

- Same group-based flow as Component 1 but with multi-character words
- Additional scoring on: 轻声 (neutral tone), 儿化 (erhua), 变调 (tone sandhi)
- Pinyin display with tone marks via lookup tables

### Component 3 — Vocabulary/Grammar Judgment (选择判断) [IMPLEMENTED]

- Interactive quiz format — tap/click to select answers
- Three sub-types: word choice (方言 vs 普通话), measure word matching, sentence order judgment
- Character reacts to answers with expressions and personality-driven commentary
- Gemini explains why the correct answer is more standard when user gets it wrong

### Component 4 — Passage Reading (朗读短文) [IMPLEMENTED]

- Full passage displayed on screen with pinyin toggle
- Character reads passage via academic TTS as a model
- User reads full passage while being recorded
- iFlytek ISE provides sentence-by-sentence scoring (read_chapter mode)
- Problem areas highlighted inline

### Component 5 — Prompted Speaking (命题说话) [IMPLEMENTED]

- Topic selection from 30 topics in the topic bank
- 3-minute timer with real-time status
- Post-completion Gemini analysis: vocabulary, grammar, filler words, structure
- Character coaching feedback

### Mock Exam [IMPLEMENTED]

- Full 5-component simulated test
- PSC grade mapping:
  - 一级甲等: 97+
  - 一级乙等: 92-96.9
  - 二级甲等: 87-91.9
  - 二级乙等: 80-86.9
  - 三级甲等: 70-79.9
  - 三级乙等: 60-69.9

---

## 6. Character & Gamification System

### Starting State

- Default characters unlocked for every new user (e.g., Kaede)
- Additional characters locked behind XP thresholds (configurable per character)

### XP Economy

- XP per question: perfect (90+) = 10, good (60-89) = 5, attempted (<60) = 2
- Streak bonuses: 5 correct = 1.5x, 10 correct = 2x
- Daily login bonus: 25 XP
- XP feeds into: global user level (unlocking characters) and per-character affection (unlocking skins)

### Affection System

- Affection XP accumulates only for the currently selected companion
- Affection levels 1-5 (Acquaintance → Friend → Close Friend → Best Friend → Soulmate)
- Max affection grants a special costume/skin

### Character Personality

- Each character has a `personality_prompt` template fed to Gemini
- Feedback, encouragement, and reactions generated in-character
- Expression images swap to match the tone of the response
- Companion TTS voice adjusts tone based on expression (cheerful, encouraging, teasing, etc.)

---

## 7. UI Design

### Theme: Pixel-Art Retro

- **Fonts**: Press Start 2P (pixel headings), VT323 (retro body), Noto Sans SC (Chinese text)
- **Colors**: Warm cream/brown/amber palette (background #FDF6E3, primary #B45309)
- **Effects**: pixel-border, pixel-glow, pixel-btn with shadow, 0px border radius
- **Animations**: shimmer, fade-in-up, pixel-pulse, blink-cursor
- Respects `prefers-reduced-motion`

### Dashboard

- Character display with selected companion
- 5 compact component cards with progress bars and average scores
- XP/level display, daily streak tracker
- Quick-start buttons per component

### Practice Screen

- Character display with expression-based images and dialogue box
- Practice content area (questions, recording controls, feedback)
- Progress bar and streak indicator
- Score results with color coding

### Character Gallery

- Grid of all characters — unlocked in full color, locked grayed with XP cost
- Character detail: personality, affection level, skins
- Select/unlock actions

---

## 8. Content Strategy

- **Core question banks**: Parsed from markdown files in `src/data/` (monosyllabic.md, multisyllabic.md, egquestions.md)
- **AI-generated supplements**: Gemini generates additional practice questions on the fly
- **Pinyin data**: Comprehensive lookup tables in `src/lib/voice/pinyin-data.ts` (1,583 lines)

---

## 9. Error Handling & Security

### Speech Recording

- Mic permission denied: clear prompt with instructions
- AudioRecorder encodes WAV (16-bit PCM, 16kHz) directly in browser
- iFlytek ISE: WebSocket reconnect on failure

### API Resilience

- Gemini: 3 retries with exponential backoff (1s, 2s, 4s + jitter), canned fallback messages
- All API calls proxied through Next.js routes — keys never exposed to client

### Auth & Data

- Supabase RLS on all 9 tables — users access only their own data
- Three-layer auth: middleware → layout → page
- API routes independently verify auth

---

## 10. Project Structure

```
src/
├── app/
│   ├── (auth)/login/           # Auth pages
│   ├── (main)/                 # Protected routes
│   │   ├── dashboard/
│   │   ├── component-{1-5}/
│   │   ├── mock-exam/
│   │   └── characters/
│   └── api/                    # API routes
│       ├── speech/assess/
│       ├── tts/speak/
│       ├── tts/companion/
│       ├── ai/feedback/
│       ├── ai/generate/
│       ├── auth/callback/
│       └── progress/
├── components/
│   ├── shared/                 # Navbar, XPBar
│   ├── character/              # CharacterDisplay, DialogueBox
│   ├── practice/               # AudioRecorder
│   └── ui/                     # 21 shadcn/ui components
├── lib/
│   ├── supabase/               # Browser + server clients, middleware
│   ├── iflytek-speech/         # ISE pronunciation assessment
│   ├── voice/                  # iFlytek TTS (academic + companion + word group)
│   ├── gemini/                 # AI feedback & question generation
│   ├── gamification/           # XP, levels, affection
│   ├── question-bank/          # Markdown parser
│   ├── character-images.ts     # Local image fallback mapping
│   ├── pinyin.ts               # Tone conversion utilities
│   ├── utils.ts                # cn() Tailwind utility
│   └── proxy.ts
├── types/
│   ├── database.ts             # 9 table schemas
│   ├── character.ts            # Expression types, character state
│   ├── practice.ts             # Practice modes, scoring
│   └── gamification.ts         # XP/level/affection constants
└── data/
    ├── monosyllabic.md
    ├── multisyllabic.md
    └── egquestions.md
```
