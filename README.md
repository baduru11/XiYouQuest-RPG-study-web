<h1 align="center">PSC Quest — 普通话水平测试 Study Companion</h1>

<p align="center">
  <strong>AI-powered Putonghua Proficiency Test prep with anime companions, real-time speech scoring, and pixel-art gamification.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/iFlytek-ISE_+_TTS-FF6B35" alt="iFlytek" />
  <img src="https://img.shields.io/badge/Gemini-2.0_Flash-4285F4?logo=google" alt="Gemini" />
</p>

<p align="center">
  Built for the <strong>HKUST GenAI Hackathon</strong>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features at a Glance](#features-at-a-glance)
- [Technical Architecture](#technical-architecture)
- [How It Works — Deep Dive](#how-it-works--deep-dive)
  - [Component 1: Monosyllabic Characters](#component-1-monosyllabic-characters-读单音节字词)
  - [Component 2: Multisyllabic Words](#component-2-multisyllabic-words-读多音节词语)
  - [Component 3: Vocabulary & Grammar Judgment](#component-3-vocabulary--grammar-judgment-选择判断)
  - [Component 4: Passage Reading](#component-4-passage-reading-朗读短文)
  - [Component 5: Prompted Speaking](#component-5-prompted-speaking-命题说话)
  - [Component 6: Cantonese Mistakes Drill](#component-6-cantonese-mistakes-drill-易错字词练习)
  - [Component 7: Polyphonic Characters Quiz](#component-7-polyphonic-characters-quiz-多音字练习)
  - [Mock Exam](#mock-exam-full-psc-simulation)
- [Speech Evaluation Engine](#speech-evaluation-engine)
- [Text-to-Speech System](#text-to-speech-system)
- [AI Feedback Pipeline](#ai-feedback-pipeline)
- [Network Resilience](#network-resilience)
- [Audio Recording Pipeline](#audio-recording-pipeline)
- [Gamification System](#gamification-system)
- [Authentication & Security](#authentication--security)
- [Social & Leaderboard](#social--leaderboard)
- [Character Companion System](#character-companion-system)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [License](#license)

---

## Overview

PSC Quest is a full-stack web application that transforms Putonghua Proficiency Test (PSC / 普通话水平测试) preparation into a gamified, AI-driven experience. Users practice all 5 official PSC components — plus 2 supplementary drills — with real-time pronunciation scoring from iFlytek's Intelligent Speech Evaluation engine, personalized AI feedback from Google Gemini, and a pixel-art retro aesthetic inspired by classic RPG quest boards.

Every practice session flows through a multi-service pipeline:

```
🎙️ Record → 📦 WAV Encode → 🌐 iFlytek ISE WebSocket → 📊 XML Parse → 🤖 Gemini Feedback → 🎮 XP Award
```

---

## Features at a Glance

| Feature | Description |
|---------|-------------|
| **All 5 PSC Components** | Complete coverage of the official exam format with faithful scoring |
| **2 Supplementary Drills** | Cantonese trouble sounds (C6) and polyphonic character quiz (C7) |
| **Real-time Speech Scoring** | Phone-level accuracy, tone analysis, fluency metrics via iFlytek ISE |
| **AI Companions** | Anime characters with 10 expressions that react to your performance |
| **Gemini Feedback** | Personality-driven, context-aware study tips after every attempt |
| **Full Mock Exam** | Timed 5-component simulation with official PSC grade mapping |
| **TTS Playback** | Native Putonghua model audio for every word, sentence, and passage |
| **XP & Levels** | 10-tier progression from Beginner to PSC God with streak multipliers |
| **Character Affection** | Build bonds with companions across 5 affection levels |
| **Social System** | Friends, leaderboards, and Discord-linked friend suggestions |
| **Pixel-Art UI** | Press Start 2P fonts, pixel borders, retro animations, warm palette |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Client)                          │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ Practice  │  │ AudioRecorder│  │ Character │  │   Quiz/Exam   │  │
│  │ Session   │  │ (PCM 16kHz)  │  │ Display   │  │   Sessions    │  │
│  └─────┬─────┘  └──────┬───────┘  └─────┬─────┘  └──────┬────────┘  │
│        │               │                │               │           │
│        └───────────────┼────────────────┼───────────────┘           │
│                        │ WAV Blob       │ Expression                │
│                        ▼                ▼                            │
├─────────────────── Next.js API Routes ──────────────────────────────┤
│                                                                     │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │ /speech/     │ │ /tts/       │ │ /ai/        │ │ /progress/  │  │
│  │  assess      │ │  speak      │ │  feedback   │ │  update     │  │
│  │  c5-assess   │ │  companion  │ │             │ │             │  │
│  └──────┬───────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘  │
│         │                │               │               │          │
├─────────┼────────────────┼───────────────┼───────────────┼──────────┤
│         ▼                ▼               ▼               ▼          │
│  ┌─────────────┐  ┌─────────────┐ ┌───────────┐  ┌────────────┐   │
│  │ iFlytek ISE │  │ iFlytek TTS │ │  Google   │  │  Supabase  │   │
│  │  WebSocket  │  │  WebSocket  │ │  Gemini   │  │ PostgreSQL │   │
│  │ (wss://)    │  │ (wss://)    │ │ 2.0 Flash │  │   + RLS    │   │
│  └─────────────┘  └─────────────┘ └───────────┘  └────────────┘   │
│                                                                     │
│         HMAC-SHA256 Auth        Retry + Backoff    Row Level Sec.  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How It Works — Deep Dive

### Component 1: Monosyllabic Characters (读单音节字词)

Practice individual Chinese character pronunciation with per-character tone and accuracy analysis.

**Workflow:**

```
┌─────────────────────────── Server (page.tsx) ────────────────────────────┐
│                                                                          │
│  Promise.all([                                                           │
│    loadSelectedCharacter(supabase, userId),    ← companion + expressions │
│    supabase.from("question_banks")             ← up to 50 characters     │
│      .select("content").eq("component", 1)                               │
│  ])                                                                      │
│  shuffle(questions) → pass to PracticeSession (dynamic import)           │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────── Client (PracticeSession) ─────────────────────────┐
│                                                                          │
│  Split 50 chars into groups of 10 → display as clickable grid            │
│                                                                          │
│  For each group:                                                         │
│                                                                          │
│  1. 👆 Tap any character → POST /api/tts/speak                           │
│       → iFlytek TTS WebSocket → WAV audio plays                         │
│       → cached in Map<word, ObjectURL> for instant replay                │
│                                                                          │
│  2. 🎙️ Press "Start Recording"                                           │
│       → getUserMedia({ audio: 16kHz mono })                              │
│       → AudioContext + ScriptProcessor captures Float32 chunks           │
│       → AnalyserNode drives real-time volume bars                        │
│                                                                          │
│  3. ⏹️ Press "Stop Recording"                                             │
│       → Chunks merged → encodeWAV(16kHz, 16-bit, mono) → Blob           │
│                                                                          │
│  4. 📡 POST /api/speech/assess                                            │
│       FormData: { audio: WAV, referenceText: "字 字 字...",               │
│                   category: "read_syllable" }                            │
│                                                                          │
│       Server pipeline:                                                   │
│       ├── Auth check (Supabase session)                                  │
│       ├── Validate: size < 25MB, MIME allowlist (wav/webm/ogg/mpeg)       │
│       └── assessPronunciation() →                                        │
│           ├── Build WSS URL with HMAC-SHA256 signature                   │
│           ├── SSB frame: params + UTF-8 BOM + newline-separated chars    │
│           ├── AUW frames: strip WAV header, send 10KB PCM chunks         │
│           │   with backpressure (pause if buffered > 64KB)               │
│           ├── Receive base64 XML result                                  │
│           └── parseIseXml("read_syllable"):                              │
│               ├── Extract <word> → <syll rec_node_type="paper">          │
│               ├── dp_message bits: 128=mispron, 16=omission,             │
│               │   32=insertion, 64=repetition                            │
│               ├── <phone is_yun="1"> → tone error analysis               │
│               │   perr_msg: 1=vowel, 2=tone, 3=both                     │
│               └── Return: words[], total_score, phone_score,             │
│                   tone_score, fluency_score, integrity_score             │
│                                                                          │
│  5. 🎯 Score matching (forward-sequential algorithm):                     │
│       Filter out insertions/omissions → match ISE words to expected      │
│       characters in order → per-word accuracy + tone scores              │
│                                                                          │
│  6. 🤖 POST /api/ai/feedback                                              │
│       { characterPrompt, component: 1, questionText,                     │
│         pronunciationScore, isCorrect }                                  │
│       → Gemini 2.0 Flash generates personality-driven feedback           │
│       → retryWithBackoff: 3 retries, 1s/2s/4s + jitter                  │
│                                                                          │
│  7. ✨ calculateXP(avgScore, streak):                                      │
│       ≥90 → 10 XP (perfect) │ ≥60 → 5 XP (good) │ <60 → 2 XP          │
│       × streak multiplier (≥5 streak → 1.5x, ≥10 → 2.0x)               │
│                                                                          │
│  8. 📊 Display: per-word score cards + tone indicators + companion        │
│       dialogue with reactive expression (happy/proud/encouraging)        │
│                                                                          │
│  After final group → POST /api/progress/update                           │
│  → INSERT practice_session → upsert user_progress                        │
│  → update XP, level, login streak, character affection                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### Component 2: Multisyllabic Words (读多音节词语)

Same architecture as C1 with key differences:

| Aspect | C1 | C2 |
|--------|----|----|
| Questions | Single characters (读, 写, 听) | Compound words (经济, 幸福, 蝴蝶) |
| ISE Category | `read_syllable` | `read_word` |
| XML Parsing | Per-syllable scores | `<word total_score>` with syllable breakdown |
| Tone Analysis | Single tone per character | Multi-tone per word (weighted average) |
| Pinyin Display | Single pinyin per char | Full compound pinyin with tone marks |

The recording, WebSocket, scoring, and feedback pipelines are identical.

---

### Component 3: Vocabulary & Grammar Judgment (选择判断)

A multiple-choice quiz testing vocabulary accuracy and grammatical judgment — no audio recording.

**Three Question Types:**

| Type | Format | Example |
|------|--------|---------|
| **word-choice** (词语判断) | Pick the standard Putonghua form | 垃圾 vs 拉圾 |
| **measure-word** (量词搭配) | Choose the correct measure word | 一___书 → 本/个/条/只 |
| **sentence-order** (语序判断) | Select the grammatically correct sentence | Reordered sentence options |

**Workflow:**

```
Server: fetch 100 questions → parse metadata JSON → shuffle
        → split into batches: 5 word-choice + 5 measure-word + 5 sentence-order

Client (QuizSession):
  randomizeAnswerPositions() via useMemo (prevents answer-order bias)

  For each question:
  ┌─────────────────────────────────────────────┐
  │  Display question + options                  │
  │  User clicks an answer                       │
  │                                              │
  │  ✅ Correct:                                  │
  │    → 10 XP + streak increment                │
  │    → Character shows happy/proud expression  │
  │    → Display static explanation              │
  │                                              │
  │  ❌ Wrong:                                    │
  │    → 2 XP + streak reset                     │
  │    → POST /api/ai/feedback with wrong answer │
  │    → Gemini explains the correct choice      │
  │    → Character shows encouraging expression  │
  └─────────────────────────────────────────────┘

  After all 15 questions → POST /api/progress/update
```

---

### Component 4: Passage Reading (朗读短文)

Read a full Chinese passage aloud with sentence-by-sentence scoring.

**Workflow:**

```
Server: fetch passages from question_banks (component=4) with title metadata

Client (ReadingSession):
  Phase 1 — SELECT: Choose a passage from the grid

  Phase 2 — READY: Passage displayed with interactive sentences
    ┌───────────────────────────────────────────────────┐
    │  "Listen to Model" button:                         │
    │    POST /api/tts/speak { text: fullPassage }       │
    │    → synthesizeAcademic() → iFlytek TTS WebSocket  │
    │    → WAV played; cached for replay                 │
    │                                                    │
    │  Click any sentence → per-sentence TTS playback    │
    │    → audioCache Map<"voiceId:sentence", ObjectURL>  │
    └───────────────────────────────────────────────────┘

  Phase 3 — RECORD: AudioRecorder captures full passage reading

  Phase 4 — ASSESS:
    POST /api/speech/assess { category: "read_chapter" }

    ISE processes read_chapter differently:
    ├── formatText() splits passage by Chinese punctuation (。！？；)
    ├── XML: <read_chapter_item> → <sentence total_score> → <word> → <syll>
    ├── Returns sentence-level scores + word-level detail
    └── Fallback: if sentence matching fails, aggregate word scores
        by character-count boundaries

  Phase 5 — FEEDBACK:
    Overall score + color-coded sentence breakdown
    (green ≥80, yellow ≥60, red <60)
    → Gemini passage-specific feedback → companion dialogue
    → POST /api/progress/update
```

---

### Component 5: Prompted Speaking (命题说话)

The most complex component — a 3-minute timed free-speaking exercise assessed by a 3-step pipeline combining ASR, ISE, and Gemini.

**Workflow:**

```
Server: fetch 100 topics from question_banks (component=5) → shuffle → pick 6

Client (SpeakingSession):
  ┌─── Phase: SELECT ────────────────────────────────────────────────┐
  │  6 topic cards displayed (e.g., "我的家乡", "谈谈你的爱好")        │
  │  Universal template always visible:                               │
  │    开头 (10-15s): 我想谈谈……                                      │
  │    主体 (~2m20s): 3 main points with examples                    │
  │    结尾 (10-15s): 总之……                                          │
  └──────────────────────────────────────────────────────────────────┘
                              │ User picks topic
                              ▼
  ┌─── Phase: PREPARE → COUNTDOWN (3s) → RECORDING ─────────────────┐
  │                                                                   │
  │  Custom audio capture (NOT AudioRecorder component):              │
  │    getUserMedia → AudioContext(16kHz)                              │
  │    → ScriptProcessor(4096) captures Float32 chunks                │
  │    → AnalyserNode(fftSize=256) drives volume visualization        │
  │    → Stopwatch counts up toward 3:00                              │
  │                                                                   │
  │  On stop: chunks merged → encodeWAV() → WAV blob                 │
  └──────────────────────────────────────────────────────────────────┘
                              │ WAV + topic + durationSeconds
                              ▼
  ┌─── Phase: ASSESSING ─── POST /api/speech/c5-assess ──────────────┐
  │                                                                   │
  │  ┌── Step 1: ASR Transcription (iFlytek IST) ──────────────────┐ │
  │  │  WebSocket: wss://ist-api-sg.xf-yun.com/v2/ist              │ │
  │  │  HMAC-SHA256 auth → send PCM in 10KB chunks                 │ │
  │  │  Responses: pgs="rpl" replaces segment, "apd" appends       │ │
  │  │  Final: concatenate all segments → raw transcript string     │ │
  │  └──────────────────────────────────────────────────────────────┘ │
  │                              │                                    │
  │  ┌── Step 2: Parallel Assessment ── Promise.all ───────────────┐ │
  │  │                                                              │ │
  │  │  ┌─ 2a. ISE Pronunciation ─────────────────────────────┐    │ │
  │  │  │  If PCM ≤ 90s: single assessPronunciation()          │    │ │
  │  │  │  If PCM > 90s: split into chunks, assess in parallel │    │ │
  │  │  │  → merge word arrays, weighted-average top scores    │    │ │
  │  │  │  Category: read_chapter                              │    │ │
  │  │  └─────────────────────────────────────────────────────┘    │ │
  │  │                                                              │ │
  │  │  ┌─ 2b. Gemini Content Analysis ───────────────────────┐    │ │
  │  │  │  System: PSC examiner role                           │    │ │
  │  │  │  Input: topic + full transcript                      │    │ │
  │  │  │  Output JSON:                                        │    │ │
  │  │  │    { vocabularyLevel: 1-3,                           │    │ │
  │  │  │      fluencyLevel: 1-3,                              │    │ │
  │  │  │      contentRelevance: string,                       │    │ │
  │  │  │      vocabularyNotes, fluencyNotes }                 │    │ │
  │  │  └─────────────────────────────────────────────────────┘    │ │
  │  └──────────────────────────────────────────────────────────────┘ │
  │                              │                                    │
  │  ┌── Step 3: calculateC5Score() ───────────────────────────────┐ │
  │  │                                                              │ │
  │  │  Pronunciation (20 pts):                                    │ │
  │  │    Count error words → determine level (一档 through 六档)    │ │
  │  │    Detect dialect: avgToneScore < 60 → dialect penalty       │ │
  │  │    Interpolate deduction within level using ISE score        │ │
  │  │                                                              │ │
  │  │  Vocabulary/Grammar (5 pts):                                │ │
  │  │    Gemini level 1→0, 2→1, 3→3 deduction                    │ │
  │  │                                                              │ │
  │  │  Fluency (5 pts — 3-tier fallback):                           │ │
  │  │    ISE fluencyScore → ISE pronunciationScore (if fluency=0) │ │
  │  │    → Gemini fluencyLevel (last resort) → 0-5 scale          │ │
  │  │                                                              │ │
  │  │  Time penalty: min(30, 180 - seconds) if under 3 min        │ │
  │  │                                                              │ │
  │  │  Total = (20-pron) + (5-vocab) + (5-fluency) - timePenalty  │ │
  │  │  Normalized = round(total / 30 × 100) → 0-100              │ │
  │  └──────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
  Phase: FEEDBACK → XP + companion dialogue + detailed breakdown
  → POST /api/progress/update
```

---

### Component 6: Cantonese Mistakes Drill (易错字词练习)

A supplementary pronunciation drill targeting common Cantonese-speaker errors in Putonghua.

**3 Categories (always sequential):**

| Category | Chinese | What it Drills |
|----------|---------|----------------|
| **zhcs** | 平翘舌音 | z/c/s vs zh/ch/sh confusion |
| **nng** | 前后鼻音 | -n vs -ng final confusion |
| **ln** | 边鼻音 | l vs n initial confusion |

**Structure:** 2 groups × 5 words × 3 categories = 30 words across 6 rounds.

Uses the same `PracticeSession` engine as C1/C2 but with ISE category `read_word`, groups of 5, and `component=6` for separate stat tracking. Category boundaries are displayed as pixel-styled badges above each group.

---

### Component 7: Polyphonic Characters Quiz (多音字练习)

A supplementary MCQ quiz testing knowledge of polyphonic characters (多音字) — characters with multiple valid pronunciations depending on context.

**How it Works:**
- Reuses the C3 `QuizSession` component directly (same import)
- Questions show Chinese sentences with the polyphonic character **highlighted** in bold underline
- Options are pinyin readings (e.g., "háng" vs "xíng" for 行)
- `renderPrompt()` parses `**X**` markdown markers into styled `<span>` elements
- 15 questions per session, randomly shuffled

---

### Mock Exam: Full PSC Simulation

A timed, sequential assessment of all 5 official components with PSC grade mapping.

**Exam Configuration:**

| Component | Time Limit | Weight | Assessment Method |
|-----------|-----------|--------|-------------------|
| C1 Monosyllabic | 3:30 | 10% | ISE `read_syllable` |
| C2 Multisyllabic | 2:30 | 20% | ISE `read_word` |
| C3 Judgment | 3:00 | 10% | Local quiz scoring |
| C4 Passage | 4:00 | 30% | ISE `read_chapter` |
| C5 Speaking | 3:00 | 30% | 3-step C5 pipeline |

**State Machine:**

```
"start" → click "Begin"
  → "component" (index 0: C1)
    → timer countdown + recording/answering
    → "transition" screen (no scores revealed)
  → "component" (index 1: C2)
    → ... repeat for each component ...
  → "component" (index 4: C5)
    → "assessing" — ALL components assessed IN PARALLEL via Promise.all()
    → progress bar shows assessment completion %
  → "results" — full breakdown with PSC grade

weightedTotal = Σ(componentScore × weight)
```

**PSC Grade Mapping:**

| Score | Grade | Chinese |
|-------|-------|---------|
| 97+ | First Class, Grade A | 一级甲等 |
| 92–96 | First Class, Grade B | 一级乙等 |
| 87–91 | Second Class, Grade A | 二级甲等 |
| 80–86 | Second Class, Grade B | 二级乙等 |
| 70–79 | Third Class, Grade A | 三级甲等 |
| 60–69 | Third Class, Grade B | 三级乙等 |
| <60 | Below Standard | 不达标 |

---

## Speech Evaluation Engine

All pronunciation assessment is powered by **iFlytek ISE** (Intelligent Speech Evaluation) via a server-side WebSocket connection.

### WebSocket Protocol

```
┌──────────┐                    ┌─────────────────────────┐
│  Client   │                    │  iFlytek ISE Server      │
│  (API     │                    │  wss://ise-api-sg.       │
│   Route)  │                    │  xf-yun.com/v2/ise       │
└─────┬─────┘                    └────────────┬─────────────┘
      │                                       │
      │ ── HMAC-SHA256 signed URL ──────────► │
      │                                       │
      │ ── SSB Frame ──────────────────────► │
      │    { cmd: "ssb",                      │
      │      category: "read_syllable",       │
      │      text: "\uFEFF字1\n字2\n...",      │
      │      extra: "multi_dimension;          │
      │              syll_phone_err_msg" }     │
      │                                       │
      │ ── AUW Frame 1 (10KB PCM) ─────────► │
      │    { cmd: "auw", aus: 1, status: 1 }  │
      │                                       │
      │ ── AUW Frame 2 (10KB PCM) ─────────► │
      │    { cmd: "auw", aus: 2, status: 1 }  │
      │         ... (backpressure check) ...   │
      │                                       │
      │ ── AUW Frame N (final) ────────────► │
      │    { cmd: "auw", aus: 4, status: 2 }  │
      │                                       │
      │ ◄──────────── Result chunks ────────── │
      │    { data: { data: "base64...",        │
      │              status: 2 } }             │
      │                                       │
      │    Decode → XML with per-word scores   │
      ▼                                       ▼
```

### Authentication

```
signature_origin = "host: ise-api-sg.xf-yun.com\ndate: {UTC}\nGET /v2/ise HTTP/1.1"
signature = Base64(HMAC-SHA256(API_SECRET, signature_origin))
authorization = Base64("api_key={KEY}, algorithm=hmac-sha256, headers=host date request-line, signature={sig}")
URL = wss://...?authorization={auth}&date={date}&host={host}
```

### ISE Categories & XML Structure

| Category | Used By | XML Root | Score Attributes |
|----------|---------|----------|-----------------|
| `read_syllable` | C1 | `<read_syllable>` | total, phone, fluency, tone, integrity |
| `read_word` | C2, C6 | `<read_word>` | total, phone, fluency, tone, integrity |
| `read_chapter` | C4, C5 | `<read_chapter>` | total, phone, fluency, tone, integrity |
| `read_sentence` | (available) | `<read_sentence>` | total, phone, fluency, tone, integrity |

### Error Detection (Per-Phone)

| Bit | dp_message | Meaning |
|-----|-----------|---------|
| 128 | Mispronunciation | Wrong sound produced |
| 64 | Repetition | Sound repeated |
| 32 | Insertion | Extra sound added |
| 16 | Omission | Sound missing |

| Bit | perr_msg | Meaning |
|-----|---------|---------|
| 1 | Vowel error | Incorrect vowel |
| 2 | Tone error | Wrong tone |
| 3 | Both | Vowel + tone error |

---

## Text-to-Speech System

All TTS uses **iFlytek's WebSocket API** with the same HMAC-SHA256 auth pattern.

### Synthesis Modes

| Mode | Function | Use Case | Pause Handling |
|------|----------|----------|----------------|
| **Academic** | `synthesizeAcademic()` | Single words, passages, sentences | Natural |
| **Word Group** | `synthesizeWordGroup()` | Multiple words in sequence | Normalized (300-750ms) |
| **Companion** | Via `/api/tts/companion` | Character voice lines | Natural |

### Word Group Normalization

When synthesizing multiple words, raw TTS produces inconsistent pauses. The `normalizePauses()` algorithm:

```
1. Join words with Chinese comma → single TTS call → WAV
2. Extract raw PCM from WAV
3. RMS energy analysis (25ms windows, 10ms hops)
4. Identify silent frames (energy < peak × 0.05)
5. Build runs of silent/audio frames
6. Replace inter-word gaps ≥ 50ms with exact target pause
7. Trim leading/trailing silence
8. Re-wrap in WAV header
```

### Server-Side Caching

`/api/tts/speak` maintains an in-memory LRU cache (max 500 entries) keyed on `academic:voiceId:text` for single synthesis or `group:voiceId:words:pauseMs` for word groups. Cache hits skip the WebSocket call entirely. Responses include `Cache-Control: public, max-age=3600`.

### Voice Library

15 iFlytek voices configured, including `x_xiaoyan` (default female), `x_xiaofeng` (male), and 13 others. Each companion character maps to a specific voice ID.

---

## AI Feedback Pipeline

**Google Gemini 2.0 Flash** generates contextual, personality-driven feedback for every practice attempt.

### How It Works

```
┌─ Input ────────────────────────────────────────────────┐
│  characterPrompt: "You are Kaede, a cheerful anime     │
│    girl who loves helping students practice Putonghua"  │
│  component: 1                                          │
│  questionText: "书 读 写 听 说"                          │
│  pronunciationScore: 78                                │
│  isCorrect: true                                       │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌─ Gemini System Prompt ─────────────────────────────────┐
│  "{personalityPrompt}                                   │
│   You are helping a student practice for the PSC        │
│   (Component 1). Respond in Chinese+English mix.        │
│   Under 3 sentences. Include personality."              │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌─ Retry Logic ──────────────────────────────────────────┐
│  retryWithBackoff(generateFeedback, maxRetries=3)       │
│                                                         │
│  Attempt 0: immediate                                   │
│  Attempt 1: ~1-2s delay (1000ms × 2⁰ + jitter)         │
│  Attempt 2: ~2-3s delay (1000ms × 2¹ + jitter)         │
│  Attempt 3: ~4-5s delay (1000ms × 2² + jitter)         │
│                                                         │
│  All retries exhausted → fallback message:              │
│    isCorrect: "做得好！继续加油！ Nice work, keep it up!" │
│    !isCorrect: "再试一次吧！Practice makes perfect!"     │
└────────────────────────────────────────────────────────┘
```

### C5 Speaking Analysis

For Component 5, Gemini additionally performs content analysis:
- **System prompt**: PSC examiner role with rubric
- **Input**: Topic + full ASR transcript
- **Output**: JSON with `vocabularyLevel` (1-3), `fluencyLevel` (1-3), `contentRelevance`, and detailed notes
- This feeds into the `calculateC5Score()` formula alongside ISE pronunciation scores

---

## Network Resilience

All client-side API calls use a `fetchWithRetry` wrapper (`src/lib/fetch-retry.ts`) that provides automatic retry with exponential backoff for transient failures.

### Retry Behavior

```
Request fails (429 / 500 / 502 / 503 or network error)
  │
  ├── Attempt 1: wait ~1s   (1000ms × 2⁰ × jitter)
  ├── Attempt 2: wait ~2s   (1000ms × 2¹ × jitter)
  ├── Attempt 3: wait ~4s   (1000ms × 2² × jitter)
  └── All retries exhausted → fall through to existing error handling
```

- **Retryable statuses**: 429 (Too Many Requests), 500, 502, 503
- **Non-retryable**: 400, 401, 403, 404 (returned immediately)
- Respects `Retry-After` header when present
- Jitter factor (0.5–1.0×) prevents thundering herd on recovery

### Coverage

All 24 internal API fetch calls across 6 practice components are covered:

| Component | Endpoints | Fallback on Exhaustion |
|-----------|-----------|----------------------|
| C1, C2, C6 | `/speech/assess`, `/tts/speak`, `/ai/feedback`, `/progress/update` | Browser TTS, hardcoded feedback |
| C4 | `/speech/assess`, `/tts/speak` ×2, `/tts/companion`, `/ai/feedback`, `/progress/update` | Browser TTS, sentence-level fallback |
| C5 | `/speech/c5-assess`, `/tts/companion`, `/ai/feedback`, `/progress/update` | Zero-score graceful degradation |
| Mock Exam | `/speech/assess`, `/speech/c5-assess` | Zero-score per component |

### Multi-Layer Resilience Stack

```
Layer 1 — Client: fetchWithRetry (3 retries, exponential backoff)
Layer 2 — Server: Gemini retryWithBackoff (3 retries, exponential backoff)
Layer 3 — Server: TTS in-memory LRU cache (500 entries, skips WebSocket on hit)
Layer 4 — Client: Audio object URL cache (Map<word, ObjectURL> per session)
Layer 5 — Client: Browser Web Speech API fallback for TTS failures
Layer 6 — Client: Hardcoded feedback strings when AI is unreachable
```

---

## Audio Recording Pipeline

All audio capture follows the same client-side pattern using the Web Audio API:

```
┌─ Browser ─────────────────────────────────────────────────────────┐
│                                                                    │
│  navigator.mediaDevices.getUserMedia({ audio: 16kHz, mono })       │
│                              │                                     │
│                              ▼                                     │
│                    MediaStreamSource                               │
│                         │    │                                     │
│              ┌──────────┘    └──────────┐                          │
│              ▼                          ▼                          │
│     ScriptProcessor(4096)       AnalyserNode(fft=256)             │
│     copies Float32 chunks       getByteTimeDomainData()           │
│     to array on each            → RMS calculation                 │
│     audioprocess event          → normalized 0-1 volume           │
│              │                  → 20-bar visualization            │
│              ▼                    (green/yellow/red)              │
│     GainNode(value=0)                                             │
│              │                                                     │
│              ▼                                                     │
│     AudioDestination (silent — prevents feedback loop)            │
│                                                                    │
│  On stop:                                                          │
│     merge all Float32 chunks → single array                       │
│     encodeWAV(merged, sampleRate=16000):                          │
│       44-byte RIFF header (PCM, mono, 16kHz, 16-bit)             │
│       Float32 → Int16 conversion (clamped, little-endian)         │
│     → Blob { type: "audio/wav" }                                  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Gamification System

### XP Economy

| Action | Base XP | Condition |
|--------|---------|-----------|
| Perfect pronunciation | 10 | Score ≥ 90 |
| Good pronunciation | 5 | Score 60–89 |
| Attempted | 2 | Score < 60 |
| Quiz correct | 10 | — |
| Quiz wrong | 2 | — |
| Daily login bonus | 25 | First session of the day |

**Streak Multipliers:** 5+ consecutive correct → 1.5x, 10+ → 2.0x

### Level Progression (10 Tiers)

```
Lv.1  Beginner       0 XP     ░░░░░░░░░░
Lv.2  Learner      100 XP     █░░░░░░░░░
Lv.3  Student      300 XP     ██░░░░░░░░
Lv.4  Practitioner 600 XP     ███░░░░░░░
Lv.5  Scholar    1,000 XP     ████░░░░░░
Lv.6  Expert     1,500 XP     █████░░░░░
Lv.7  Master     2,500 XP     ██████░░░░
Lv.8  Grandmaster 4,000 XP    ████████░░
Lv.9  Legend     6,000 XP     █████████░
Lv.10 PSC God   10,000 XP     ██████████
```

### Character Affection (5 Levels per Companion)

| Level | Title | XP Required |
|-------|-------|------------|
| 1 | Acquaintance | 0 |
| 2 | Friend | 200 |
| 3 | Close Friend | 500 |
| 4 | Best Friend | 1,000 |
| 5 | Soulmate | 2,000 |

Affection grows by practicing with a specific companion selected. Higher affection unlocks cosmetic skins.

### Server-Side Anti-Cheat

All progress updates go through `/api/progress/update` which enforces:
- `MAX_XP_PER_SESSION = 2000` (clamped)
- Input validation via Zod schema
- Atomic upserts via Supabase RPC
- Server-side streak and daily bonus calculation (no client trust)

---

## Authentication & Security

### Three-Layer Auth Architecture

```
Request → ┌─ Layer 1: Middleware ─────────────────────────────────┐
          │  Runs on EVERY request                                │
          │  Refreshes Supabase session cookie                    │
          │  Public paths: /login, /api/auth/callback             │
          │  Unauthed + /api/* → 401 JSON                         │
          │  Unauthed + page → redirect /login                    │
          │  Authed + /login → redirect /dashboard                │
          └───────────────────────────┬───────────────────────────┘
                                      │
          ┌─ Layer 2: Layout Guard ───┴───────────────────────────┐
          │  (main)/layout.tsx — server component                  │
          │  supabase.auth.getUser() again (handles edge cases)    │
          │  No user → redirect /login                             │
          │  Fetches profile + friend request count in Promise.all │
          │  All child pages safely use user!.id                   │
          └───────────────────────────┬───────────────────────────┘
                                      │
          ┌─ Layer 3: API Route Guards ┴──────────────────────────┐
          │  Every API route independently verifies auth           │
          │  supabase.auth.getUser() → 401 if no user             │
          └───────────────────────────────────────────────────────┘
```

### Login Methods

| Method | Flow |
|--------|------|
| **Email/Password** | `signInWithPassword()` → redirect `/dashboard` |
| **Email Sign-up** | `signUp()` → DB trigger creates profile + default characters |
| **Google OAuth** | `signInWithOAuth({ provider: "google" })` → Google → callback → session |
| **Discord OAuth** | `signInWithOAuth({ provider: "discord" })` + `relationships.read` scope for friend suggestions |

### Database Security

All 10 tables use **Row Level Security (RLS)** — users can only read/write their own data. The `anon` key is safe to expose in the browser; all sensitive operations are gated by RLS policies.

---

## Social & Leaderboard

### Friend System Flow

```
Search (/api/social/search)
  └→ Send Request (/api/social/request)
       └→ Pending notification (badge on navbar)
            └→ Accept/Reject (/api/social/respond)
                 └→ Friends list with live stats (/api/social/friends)
```

### Friend Stats

For each friend, the API aggregates:
- Profile: level, XP, streak, display name, avatar
- Practice sessions: average scores per component (C1–C7)
- Selected companion: name + image

### Leaderboard

| Tab | Data Source | Sorting |
|-----|-----------|---------|
| **Global** | All `profiles` | `total_xp DESC` |
| **Friends** | Accepted friendships + self | `total_xp DESC` (client-side) |

### Discord Friend Suggestions

If authenticated via Discord (`relationships.read` scope), the app can suggest friends by cross-referencing Discord friend lists with registered users.

---

## Character Companion System

### Architecture

```
┌─ characters table ─────────────────────────────────────┐
│  id, name, personality_prompt, voice_id,                │
│  image_url, unlock_cost_xp, is_default                  │
│                                                         │
│  ┌─ character_expressions ──────────────────────────┐  │
│  │  10 expressions per character:                    │  │
│  │  neutral, happy, proud, excited, thinking,        │  │
│  │  encouraging, teasing, surprised, listening,      │  │
│  │  disappointed                                     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ character_skins ────────────────────────────────┐  │
│  │  Unlockable at higher affection levels            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ user_characters table ────────────────────────────────┐
│  user_id, character_id, unlocked_at,                    │
│  affection_xp, affection_level,                         │
│  active_skin_id, is_selected                            │
└─────────────────────────────────────────────────────────┘
```

### Expression Reactions

Characters dynamically change expressions based on performance:
- **Score ≥ 90**: happy, proud, excited
- **Score 60–89**: encouraging, thinking
- **Score < 60**: encouraging, thinking (never negative — companions are supportive)

### Local Image Fallbacks

When Supabase has no expression images, local fallbacks are used:
- Kaede → `/img/character/Kaede/kaede.png`
- Hao Ran → `/img/character/HaoRan/haoran.png`
- Mei Lin → `/img/character/MeiLin/meilin.png`

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router, Turbopack) | Server/client rendering, API routes |
| **UI Library** | React 19 | Component architecture |
| **Language** | TypeScript (strict mode) | Type safety |
| **Database** | Supabase (PostgreSQL + RLS) | Data persistence, auth, real-time |
| **Auth** | Supabase Auth | Email, Google OAuth, Discord OAuth |
| **AI Feedback** | Google Gemini 2.0 Flash | Contextual feedback, content analysis |
| **Speech Assessment** | iFlytek ISE (WebSocket) | Pronunciation scoring (zh-CN) |
| **Text-to-Speech** | iFlytek TTS (WebSocket) | Native Putonghua audio |
| **ASR** | iFlytek IST (WebSocket) | Speech-to-text for C5 |
| **Styling** | Tailwind CSS 4 | Utility-first CSS |
| **UI Components** | shadcn/ui (New York) + Radix UI | Accessible component primitives |
| **Icons** | Lucide React | Consistent icon set |
| **Notifications** | Sonner | Toast notifications |
| **Fonts** | Press Start 2P, VT323, Noto Sans SC | Pixel headings, retro body, Chinese |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- A [Supabase](https://supabase.com) project
- API keys: iFlytek (ISE + TTS), Google Gemini

### 1. Clone and Install

```bash
git clone <repo-url>
cd PCSWebTool
npm install
```

### 2. Configure Environment

Create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key

# iFlytek (shared by ISE, TTS, and IST)
IFLYTEK_APP_ID=your_app_id
IFLYTEK_API_KEY=your_api_key
IFLYTEK_API_SECRET=your_api_secret
```

### 3. Set Up Database

Apply the migration to your Supabase project. The schema creates 10 tables with RLS:

| Table | Purpose |
|-------|---------|
| `profiles` | User XP, level, streaks, display name |
| `user_progress` | Per-component aggregate stats |
| `characters` | AI companion definitions |
| `character_expressions` | 10 expression images per character |
| `character_skins` | Unlockable cosmetics |
| `user_characters` | Unlock state, affection, skin selection |
| `practice_sessions` | Individual session history |
| `practice_details` | Per-question results within sessions |
| `question_banks` | Questions for all 7 components |
| `friendships` | Friend requests and relationships |

Database triggers auto-create a `profiles` row on signup and unlock default characters.

### 4. Google OAuth (Optional)

1. Create an OAuth 2.0 Client ID at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add `https://your-project.supabase.co/auth/v1/callback` as a redirect URI
3. Enable Google in [Supabase Auth Providers](https://supabase.com/dashboard/project/_/auth/providers)

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # Auth redirect → /login or /dashboard
│   ├── layout.tsx                        # Root layout (fonts, theme, metadata)
│   ├── globals.css                       # Pixel-art theme + Tailwind config
│   ├── (auth)/login/                     # Login page + server actions
│   ├── (main)/                           # Protected routes (3-layer auth)
│   │   ├── layout.tsx                    # Auth guard + navbar + profile fetch
│   │   ├── dashboard/                    # Home hub — tile menu navigation
│   │   ├── practice/                     # Quest board — 7 component cards
│   │   ├── component-1/                  # Monosyllabic drill (PracticeSession)
│   │   ├── component-2/                  # Multisyllabic drill (PracticeSession)
│   │   ├── component-3/                  # Vocab/grammar quiz (QuizSession)
│   │   ├── component-4/                  # Passage reading (ReadingSession)
│   │   ├── component-5/                  # Prompted speaking (SpeakingSession)
│   │   ├── component-6/                  # Cantonese mistakes (PracticeSession)
│   │   ├── component-7/                  # Polyphonic chars (reuses QuizSession)
│   │   ├── mock-exam/                    # Full exam simulation (ExamRunner)
│   │   ├── leaderboard/                  # Global + friends rankings
│   │   ├── characters/                   # Gallery, unlock shop, skin equip
│   │   ├── profile/                      # Stats, history, level progress
│   │   └── social/                       # Friends, requests, search
│   └── api/
│       ├── speech/assess/                # iFlytek ISE pronunciation scoring
│       ├── speech/c5-assess/             # 3-step C5 pipeline (ASR + ISE + Gemini)
│       ├── tts/speak/                    # Academic TTS (cached, WAV)
│       ├── tts/companion/                # Character voice TTS (WAV)
│       ├── ai/feedback/                  # Gemini personality feedback
│       ├── auth/callback/                # OAuth PKCE code exchange
│       ├── progress/update/              # XP, level, streak, affection
│       ├── leaderboard/                  # Rankings (global + friends)
│       └── social/                       # 9 friend system endpoints
├── components/
│   ├── ui/                               # shadcn/ui primitives
│   ├── shared/                           # Navbar, XPBar
│   ├── character/                        # CharacterDisplay, DialogueBox
│   └── practice/                         # AudioRecorder (WAV PCM encoder)
├── lib/
│   ├── supabase/                         # Browser + server Supabase clients
│   ├── iflytek-speech/client.ts          # ISE WebSocket client
│   ├── voice/client.ts                   # TTS WebSocket client
│   ├── voice/pinyin-data.ts              # 1,583-line pinyin lookup tables
│   ├── gemini/client.ts                  # Gemini with retry logic
│   ├── gamification/xp.ts               # XP, levels, streaks, affection
│   ├── character-images.ts               # Local image fallback paths
│   └── pinyin.ts                         # Tone-number → tone-mark conversion
├── types/
│   ├── database.ts                       # Supabase table type definitions
│   ├── character.ts                      # Expression + character types
│   ├── practice.ts                       # Practice mode + scoring types
│   └── gamification.ts                   # XP/level/affection constants
└── data/                                 # Question bank source files
```

---

## API Reference

### Speech & Audio

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/speech/assess` | FormData: `audio` (WAV), `referenceText`, `category` | JSON: per-word scores, aggregates |
| POST | `/api/speech/c5-assess` | FormData: `audio` (WAV), `topic`, `spokenDurationSeconds` | JSON: C5 score breakdown |
| POST | `/api/tts/speak` | JSON: `{ voiceId, text }` or `{ voiceId, words[], pauseMs }` | `audio/wav` (cached) |
| POST | `/api/tts/companion` | JSON: `{ voiceId, text }` | `audio/wav` (no cache) |

### AI

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/ai/feedback` | JSON: `{ characterPrompt, component, questionText, score, isCorrect }` | JSON: `{ feedback, fallback? }` |

### Progress

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/progress/update` | JSON: session stats, XP earned, component, character | JSON: updated XP, level, affection |
| GET | `/api/leaderboard` | Query: `?type=global\|friends` | JSON: ranked user stats |

### Social

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/social/search?q=` | Search users by username |
| GET | `/api/social/lookup?displayName=` | Find user by display name |
| POST | `/api/social/request` | Send friend request |
| GET | `/api/social/requests` | List incoming requests |
| GET | `/api/social/request-count` | Pending request count (navbar badge) |
| POST | `/api/social/respond` | Accept/reject request |
| GET | `/api/social/friends` | List friends with stats |
| DELETE | `/api/social/remove` | Remove friend |
| GET | `/api/social/discord-suggestions` | Discord-linked suggestions |

---

## Database Schema

```sql
profiles            user_progress         practice_sessions
┌──────────────┐    ┌──────────────────┐  ┌────────────────────┐
│ id (uuid)    │    │ id               │  │ id                 │
│ username     │    │ user_id (fk)     │  │ user_id (fk)       │
│ display_name │    │ component (1-7)  │  │ character_id (fk)  │
│ avatar_url   │    │ questions_done   │  │ component (1-7)    │
│ total_xp     │    │ questions_correct│  │ score              │
│ current_level│    │ best_streak      │  │ xp_earned          │
│ login_streak │    │ total_time       │  │ duration_seconds   │
│ last_login   │    │ updated_at       │  │ created_at         │
│ discord_id   │    └──────────────────┘  └────────────────────┘
└──────────────┘

characters          character_expressions   user_characters
┌──────────────┐    ┌──────────────────┐   ┌──────────────────┐
│ id           │    │ id               │   │ user_id (fk)     │
│ name         │    │ character_id(fk) │   │ character_id(fk) │
│ personality  │    │ expression_name  │   │ unlocked_at      │
│ voice_id     │    │ image_url        │   │ affection_xp     │
│ image_url    │    └──────────────────┘   │ affection_level  │
│ unlock_cost  │                           │ active_skin_id   │
│ is_default   │    character_skins        │ is_selected      │
└──────────────┘    ┌──────────────────┐   └──────────────────┘
                    │ id               │
question_banks      │ character_id(fk) │   friendships
┌──────────────┐    │ skin_name        │   ┌──────────────────┐
│ id           │    │ image_url        │   │ id               │
│ component    │    │ required_affection│  │ requester_id(fk) │
│ content      │    └──────────────────┘   │ addressee_id(fk) │
│ metadata     │                           │ status           │
└──────────────┘    practice_details       │ created_at       │
                    ┌──────────────────┐   │ updated_at       │
                    │ id               │   └──────────────────┘
                    │ session_id (fk)  │
                    │ question_content │
                    │ user_answer      │
                    │ is_correct       │
                    │ score            │
                    └──────────────────┘
```

All tables have **Row Level Security** enabled — users can only access their own data.

---

## Scripts

```bash
npm run dev       # Dev server at localhost:3000 (Turbopack)
npm run build     # Production build
npm run start     # Production server
npm run lint      # ESLint
npm run test      # Vitest unit tests
```

---

## UI Theme

A pixel-art retro aesthetic with warm, inviting colors:

- **Fonts**: Press Start 2P (pixel headings), VT323 (retro body text), Noto Sans SC (Chinese characters)
- **Palette**: Warm cream background (`#FDF6E3`), amber primary (`#B45309`), brown accents
- **Effects**: `pixel-border` (3px box shadow), `pixel-glow`, `pixel-btn` (4px drop shadow), `border-radius: 0px`
- **Animations**: shimmer, fade-in-up, pixel-pulse, blink-cursor
- **Accessibility**: Respects `prefers-reduced-motion` — all animations disabled when requested

---

## Documentation

- **Design Document**: `docs/plans/2026-02-08-psc-webtool-design.md`
- **Implementation Plan**: `docs/plans/2026-02-08-psc-webtool-implementation.md`
- **PSC Reference**: `doc/PSC_comprehensive_guide.md`
- See `docs/plans/` for additional design documents (social, leaderboard, home hub, C3/C6/C7 component designs)

---

## License

This project is for educational purposes. All PSC exam content follows the national Putonghua Proficiency Test standards published by the Ministry of Education of China.
