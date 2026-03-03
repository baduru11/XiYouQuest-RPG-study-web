# Companion Chat Design

Date: 2026-03-03

## Overview

Oral conversation feature where users chat with unlocked Journey to the West companions in preset story scenarios. Users speak in Mandarin, get real-time pronunciation scoring, and receive voiced AI replies. AI-generated pixel-art backgrounds appear periodically. Full gamification with XP, affection, streaks, and achievements.

## User Flow

State machine: `select_companion → select_scenario → chatting → summary`

1. **Select Companion** — Grid of 4 character cards (name, portrait, affection level). Locked companions greyed out with "Unlock at Stage X". Selection highlights with `pixel-border-primary`.
2. **Select Scenario** — Vertical list of preset scenarios grouped by quest stage. Only cleared stages available (Stage 1 always open). Each shows Chinese title + 1-line description.
3. **Chat Screen** — Full conversation interface. Companion sends opening message (auto-voiced). User records responses via record/stop button. Background image transitions every 4 exchanges. Max ~20 exchanges per session.
4. **Summary Screen** — Stats: total messages, average pronunciation score, XP earned, affection gained, generated images gallery. Option to view transcript or start new chat.

Two views toggled by tabs at the top: **New Chat** and **History**.

## Route Structure

```
src/app/(main)/companion-chat/
├── page.tsx                      # Server: fetch characters, history, quest progress
├── loading.tsx                   # Skeleton
├── companion-chat-client.tsx     # Client: state machine, all UI
```

Dashboard tile: icon `MessageCircle`, label "Companion Chat", href `/companion-chat`.

## Database Schema

### `chat_scenarios` (seeded, ~15-20 rows)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `stage_number` | int | Quest stage (1-7) |
| `title` | text | Chinese title, e.g. "水帘洞探秘" |
| `description` | text | 1-line Chinese description |
| `system_prompt` | text | Scene-setting context for LLM |
| `sort_order` | int | Display order within stage |

### `chat_sessions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → profiles | RLS: own rows only |
| `character_id` | uuid FK → characters | |
| `scenario_id` | uuid FK → chat_scenarios | |
| `message_count` | int | Total exchanges |
| `avg_score` | float | Average pronunciation score |
| `xp_earned` | int | XP awarded this session |
| `affection_earned` | int | Affection XP for this character |
| `created_at` | timestamptz | |
| `ended_at` | timestamptz | null while active |

### `chat_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `session_id` | uuid FK → chat_sessions | |
| `role` | text | 'user' or 'companion' |
| `content` | text | Message text (Chinese) |
| `transcript` | text | ASR transcript (user messages only) |
| `pronunciation_score` | float | Overall score (user only) |
| `tone_score` | float | (user only) |
| `fluency_score` | float | (user only) |
| `image_url` | text | Generated image URL (companion only, every 4th) |
| `created_at` | timestamptz | |

RLS: users can only read/write their own sessions and messages (join through `chat_sessions.user_id`).

## API Routes

### `POST /api/chat/start`

Creates a new session. Generates companion's opening message.

- Input: `{ characterId, scenarioId }`
- Validates: character unlocked, scenario stage cleared
- Creates `chat_sessions` row
- Generates opening message via DeepSeek (character personality prompt + scenario system prompt)
- Saves as first `chat_messages` row (role: 'companion')
- Returns: `{ sessionId, openingMessage, characterVoiceId }`
- Client calls `/api/tts/companion` separately to voice the message

### `POST /api/chat/respond`

Core conversation turn. Sequential pipeline.

- Input: `FormData { sessionId, audio (WAV blob) }`
- Pipeline:
  1. ASR transcription via `transcribeAudio()`
  2. ISE pronunciation scoring via `assessPronunciation(transcript, audio, "read_chapter")`
  3. Save user message to `chat_messages` with scores
  4. Build conversation history from DB → DeepSeek for companion reply
  5. Save companion message to `chat_messages`
  6. Calculate XP for this turn
- Returns: `{ userTranscript, scores: { pronunciation, tone, fluency, overall }, companionReply, xpEarned, turnNumber }`
- Client handles TTS after receiving reply

### `POST /api/chat/generate-image`

Background image generation (called by client every 4 exchanges, non-blocking).

- Input: `{ sessionId, conversationSummary }`
- Model: `google/gemini-3.1-flash-image-preview` via OpenRouter
- Prompt: pixel art + Chinese ink painting style, based on conversation context
- Uploads to Supabase Storage bucket `chat-images/`
- Updates companion message row with `image_url`
- Returns: `{ imageUrl }`

### `POST /api/chat/end`

Finalize session. Calculate and persist stats.

- Input: `{ sessionId }`
- Calculates: avg score, total XP, total affection
- Updates `chat_sessions` (ended_at, stats)
- Calls `/api/progress/update` for XP/affection/streak
- Triggers achievement checks
- Returns: `{ summary: { messageCount, avgScore, xpEarned, affectionEarned, images[] } }`

### `GET /api/chat/history`

Fetch past sessions.

- Query: `?limit=20&offset=0` for session list, `?sessionId=xxx` for full messages
- Returns: sessions with character name, scenario title, stats, date

## Chat UI Components

### Layout

Full-height flex column within `(main)` layout:
- **Top bar**: Companion info — small sprite (expression-reactive), name, affection level, scenario title
- **Middle**: Scrollable message area
- **Bottom**: Input bar with record button

### Message Bubbles

**Companion messages** (left-aligned):
- `pixel-border` card with companion's small avatar
- Text in `font-chinese`
- "Listen Again" button (speaker icon) below text
- Auto-plays TTS on arrival

**User messages** (right-aligned):
- `pixel-border` card with vermilion accent border
- Shows ASR transcript
- Inline score badge (green >=85, yellow >=70, red <70)
- Tap badge to expand: pronunciation, tone, fluency + word-level errors

### Companion Expression

Small sprite in top bar reacts to scores:
- Score >=85: `happy` or `proud`
- Score 70-84: `encouraging`
- Score <70: `thinking`

### Background Image Overlay

Reuses C4 pattern:
- Fixed overlay at `z-index: -1`
- Opacity transition `0.8s ease-in-out`
- New image fades in every 4 exchanges
- Content area: `bg-background/80 backdrop-blur-sm`

### Input Bar

- Large circular record button (center), pixel-art microphone icon
- Tap to start: turns red, pulsing animation, volume meter appears
- Tap to stop: loading spinner while pipeline processes
- "End Conversation" button (smaller) with confirmation dialog

### Loading States

- Audio processing: Companion bubble shows 3 bouncing dots (pixel-style typing indicator)
- Image generating: Subtle shimmer on background overlay

### Theme Compliance

All components use: `pixel-border`, `chinese-corner`, `font-pixel` (labels), `font-chinese` (message text), warm cream + vermilion palette. Respects `prefers-reduced-motion`.

## Image Generation

- Trigger: Every 4th user message (non-blocking background request)
- Prompt template: "Generate a pixel art scene in Chinese ink painting style depicting: [4-exchange summary]. Characters: [companion name] and a young traveler. Style: 16-bit pixel art with muted earth tones, warm lighting."
- Model: `google/gemini-3.1-flash-image-preview` via OpenRouter
- Storage: Supabase Storage bucket `chat-images/`, public URLs
- Display: C4-style background fade transition
- Viewable in: session summary + history detail

## Gamification

### XP Per Turn

Same tiers as practice:
- Score >=95: 10 XP (perfect)
- Score >=80: 5 XP (good)
- Score <80: 2 XP (attempted)
- Session cap: 2000 XP (existing limit)

### Affection

3 affection XP per turn for the selected companion. A 20-exchange conversation = 60 affection XP.

### Streaks

A completed session (>=5 exchanges) counts as daily activity for login streak.

### Achievements (4 new)

| Name | Tier | Trigger |
|------|------|---------|
| First Words (初次对话) | Common | Complete first chat session |
| Chatterbox (话匣子) | Uncommon | Send 50 total chat messages |
| Polyglot (四海之友) | Rare | Chat with all 4 companions |
| Storyteller (说书人) | Epic | Complete 10 chat sessions |

Triggered via `session_complete` event in existing achievement system.

## Scenario Seed Data (15-20 scenarios)

Example scenarios across 7 stages:

**Stage 1 — Flower Fruit Mountain (花果山)**
- 水帘洞探秘: Discover the Water Curtain Cave with Wukong
- 拜师学艺: Training under Master Subodhi

**Stage 2 — Journey Begins (取经启程)**
- 白马寺相遇: Meeting the White Horse
- 收服悟空: Tang Sanzang tames Wukong

**Stage 3 — Flowing Sand River (流沙河)**
- 河畔对话: Conversation by the river with Sha Wujing
- 渡河之策: Planning to cross the river

**Stage 4 — White Bone Spirit (白骨精)**
- 识破妖怪: Seeing through the demon's disguise
- 师徒争执: Master-disciple argument

**Stage 5 — Flaming Mountain (火焰山)**
- 借芭蕉扇: Borrowing the Banana Leaf Fan
- 火焰山下: At the foot of the Flaming Mountain

**Stage 6 — Spider Cave (盘丝洞)**
- 盘丝洞奇遇: Strange encounter at Spider Cave
- 猪八戒的烦恼: Zhu Bajie's troubles

**Stage 7 — Thunder Monastery (雷音寺)**
- 真假美猴王: True and false Monkey King
- 取经归来: Return with the scriptures

## DeepSeek Conversation Prompt

System prompt structure for companion chat:

```
You ARE {character_name}. Stay fully in character at all times.

{character_personality_prompt}

SCENE: {scenario_system_prompt}

RULES:
- Respond in Mandarin Chinese (简体中文) only
- Keep responses 1-3 sentences, natural conversational length
- Stay in the Journey to the West scenario context
- Be engaging — ask follow-up questions to keep conversation going
- Adjust difficulty to match user's apparent Mandarin level
- If the user's pronunciation was poor (score < 70), gently encourage them
- Use vocabulary appropriate for PSC intermediate level
```

## Technical Notes

- Reuses existing `AudioRecorder` component for recording
- Reuses existing `transcribeAudio()` and `assessPronunciation()` from iFlytek clients
- Reuses existing `/api/tts/companion` route for voice synthesis
- Reuses existing `CharacterDisplay` component for expressions
- Reuses existing `fetchWithRetry()` wrapper for all API calls
- OpenRouter client pattern from existing `src/lib/gemini/client.ts` (already uses OpenRouter)
- New Supabase Storage bucket `chat-images` for generated images
- Types added to `src/types/database.ts`
