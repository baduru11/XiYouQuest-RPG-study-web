# PSC Web Tool — Implementation Plan

**Goal:** Build a galgame-style AI-powered web tool for PSC exam preparation with anime character companions, speech recognition, and gamification.

**Status:** All phases complete. All 5 PSC components, mock exam, gamification, and character system are implemented and functional.

**Design doc:** `docs/plans/2026-02-08-psc-webtool-design.md`

**Tech Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui · Supabase · Google Gemini 2.0 Flash · iFlytek ISE + TTS

---

## Phase 1: Project Scaffolding & Infrastructure [COMPLETE]

### Task 1: Initialize Git and Next.js Project [COMPLETE]
- Next.js 16 with TypeScript, Tailwind CSS 4, ESLint, App Router, src directory
- shadcn/ui (New York style) with 21 UI components installed
- `.env.local` with Supabase, iFlytek, Gemini keys

### Task 2: Project Directory Structure [COMPLETE]
- Full directory structure under `src/` (app, components, lib, types, data)
- Question bank markdown files in `src/data/`

### Task 3: TypeScript Types [COMPLETE]
- `src/types/database.ts` — 9 table schemas (Profile, UserProgress, Character, etc.)
- `src/types/character.ts` — ExpressionName (10 expressions), CharacterState, CharacterWithDetails
- `src/types/practice.ts` — PracticeMode, PronunciationResult, QuizQuestion, PracticeState
- `src/types/gamification.ts` — XP_VALUES, STREAK_MULTIPLIERS, AFFECTION_LEVELS (5), USER_LEVELS (10)

### Task 4: Supabase Client [COMPLETE]
- `src/lib/supabase/client.ts` — Browser client
- `src/lib/supabase/server.ts` — Server component client (SSR)
- `src/lib/supabase/middleware.ts` — Auth session refresh + route protection
- `src/middleware.ts` — Root middleware with matcher config

### Task 5: Database Schema [COMPLETE]
- 9 tables with RLS: profiles, user_progress, characters, character_expressions, character_skins, user_characters, practice_sessions, practice_details, question_banks
- Auto-create profile trigger on signup
- Auto-unlock default characters trigger on profile creation
- Migrations applied via Supabase MCP

### Task 6: API Library Wrappers [COMPLETE]
- `src/lib/gemini/client.ts` — Gemini 2.0 Flash with retry logic (3 retries, exponential backoff, canned fallbacks)
- `src/lib/iflytek-speech/client.ts` — iFlytek ISE WebSocket (read_syllable, read_word, read_chapter categories)
- `src/lib/voice/client.ts` — iFlytek TTS WebSocket: Academic, Companion, and Word Group synthesis
- `src/lib/gamification/xp.ts` — calculateXP(), getUserLevel(), getAffectionLevel()

### Task 7: Question Bank Parser [COMPLETE]
- `src/lib/question-bank/parser.ts` — Markdown parser for monosyllabic and multisyllabic files

---

## Phase 2: Auth & Layout Shell [COMPLETE]

### Task 8: Login Page [COMPLETE]
- `src/app/(auth)/login/` — Email/password + Google OAuth
- Server actions for login, signup, OAuth
- `src/app/api/auth/callback/route.ts` — OAuth callback

### Task 9: Main Layout Shell [COMPLETE]
- `src/app/(main)/layout.tsx` — Protected layout with auth check, parallel profile fetch
- `src/components/shared/navbar.tsx` — Navigation with mobile menu, XP bar, logout dialog
- `src/components/shared/xp-bar.tsx` — Level display with progress bar

### Task 10: Dashboard Page [COMPLETE]
- `src/app/(main)/dashboard/page.tsx` — Character display, 5 compact component cards with progress/avg scores, XP/level/streak display
- Parallel data fetching with Promise.all

---

## Phase 3: Character System UI [COMPLETE]

### Task 11: Character Display Components [COMPLETE]
- `src/components/character/character-display.tsx` — Expression-based images with transitions + fallback
- `src/components/character/dialogue-box.tsx` — Typewriter-style dialogue display
- `src/lib/character-images.ts` — Local image fallback mapping (Kaede has local images)

### Task 12: Character Gallery Page [COMPLETE]
- `src/app/(main)/characters/page.tsx` — Grid of characters, unlock/select, affection display
- `src/app/(main)/characters/actions.ts` — Server actions for select/unlock
- `src/app/(main)/characters/character-actions.tsx` — Client-side action buttons

---

## Phase 4: Component 1 — End-to-End [COMPLETE]

### Task 13: API Routes [COMPLETE]
- `src/app/api/speech/assess/route.ts` — iFlytek ISE pronunciation assessment
- `src/app/api/tts/speak/route.ts` — Academic TTS (iFlytek WebSocket)
- `src/app/api/tts/companion/route.ts` — Companion TTS (iFlytek WebSocket)
- `src/app/api/ai/feedback/route.ts` — Gemini character-personalized feedback

### Task 14: Audio Recorder [COMPLETE]
- `src/components/practice/audio-recorder.tsx` — Browser mic recording with WAV encoding (16-bit PCM, 16kHz)

### Task 15: Component 1 Practice [COMPLETE]
- `src/app/(main)/component-1/page.tsx` — Server page with Supabase data fetch
- `src/app/(main)/component-1/practice-session.tsx` — Group-based pronunciation drill

---

## Phase 5: Components 2-5 [COMPLETE]

### Task 16: Component 2 — Multisyllabic Words [COMPLETE]
- `src/app/(main)/component-2/practice-session.tsx` — Group-based practice with pinyin display
- Same pattern as C1 adapted for multi-character words

### Task 17: Component 3 — Vocabulary/Grammar Judgment [COMPLETE]
- `src/app/(main)/component-3/quiz-session.tsx` — Multiple-choice quiz (word-choice, measure-word, sentence-order)
- Character reactions + Gemini explanations

### Task 18: Component 4 — Passage Reading [COMPLETE]
- `src/app/(main)/component-4/reading-session.tsx` — Full passage display with pinyin toggle
- iFlytek ISE read_chapter mode for sentence-by-sentence scoring

### Task 19: Component 5 — Prompted Speaking [COMPLETE]
- `src/app/(main)/component-5/speaking-session.tsx` — 30 topics, 3-minute timer
- Post-completion Gemini analysis

---

## Phase 6: Progress & Gamification API [COMPLETE]

### Task 20: Progress API Routes [COMPLETE]
- `src/app/api/progress/update/route.ts` — Session creation, XP award, streak tracking, affection update
- `src/app/api/progress/select-character/route.ts` — Set active companion
- `src/app/api/progress/unlock-character/route.ts` — Unlock via XP spend

---

## Phase 7: Mock Exam [COMPLETE]

### Task 21: Mock Exam Mode [COMPLETE]
- `src/app/(main)/mock-exam/exam-runner.tsx` — All 5 components sequentially
- PSC grade mapping (一级甲等 through 三级乙等)

---

## Phase 8: Polish & Enhancement [COMPLETE]

### Task 22: Landing Page & Root Redirect [COMPLETE]
- `src/app/page.tsx` — Public landing page

### Task 23: AI Question Generation [COMPLETE]
- `src/app/api/ai/generate/route.ts` — Gemini dynamic question generation

### Task 24: Performance & UX [COMPLETE]
- Loading skeletons for every route under `(main)/`
- Parallel Supabase queries via Promise.all
- Dynamic imports for heavy client components
- Kaede added as default character with local images

### Task 25: Pixel-Art UI Redesign [COMPLETE]
- Custom pixel-art theme: Press Start 2P + VT323 + Noto Sans SC fonts
- Warm cream/brown/amber palette, pixel borders, 0px radius
- Custom animations (shimmer, fade-in-up, pixel-pulse)

### Task 26: iFlytek ISE Migration [COMPLETE]
- Migrated from Azure REST API to iFlytek ISE WebSocket for improved Mandarin assessment
- Categories: read_syllable (C1), read_word (C2), read_chapter (C4/C5)
- Returns tone scores, phone-level error detail, fluency scores

### Task 27: Dashboard UI Improvements [COMPLETE]
- Compact quest cards, average scores display, larger fonts
- Renamed "Party" to "Character" throughout

### Task 28: Pinyin & TTS Enhancements [COMPLETE]
- `src/lib/pinyin.ts` — Tone-number to tone-mark conversion
- `src/lib/voice/pinyin-data.ts` — 1,583-line lookup tables
- Word group synthesis with normalized pauses (300-750ms)
- Companion TTS retry logic

### Task 29: Progress Tracking Integration [COMPLETE]
- Progress tracking integrated across all 5 practice components
- XP, streaks, affection all update in real-time

---

## Implementation Notes

- **TTS Provider Change**: Original plan used Fish Audio/ElevenLabs → switched to iFlytek TTS WebSocket API for better Mandarin quality
- **Speech Assessment**: Originally Azure REST API → migrated to iFlytek ISE WebSocket for better Mandarin-specific scoring (tone, phone-level detail)
- **UI Theme**: Originally basic shadcn/ui → upgraded to pixel-art retro aesthetic with custom fonts and effects
- **Components 1-2**: Originally one-at-a-time → restructured to group-based practice for more natural flow
- **Character System**: Originally Mei Lin + Hao Ran defaults → Kaede added as default character with local images
- **No README.md**: Should be created (see separate README.md file)
