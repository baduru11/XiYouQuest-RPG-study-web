# Main Quest RPG Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Journey to the West (西游记) story-driven RPG mode where players battle bosses using pronunciation recording (attack) and MCQ defense (defense) across 7 stages, unlocking party members at stages 2, 3, and 6.

**Architecture:** Single route `/main-quest` with a heavy client component managing a state machine (INTRO → STAGE_SELECT → STORY → BATTLE → RESULT). Battle system alternates between player recording turns (attack) and boss MCQ turns (defense). All stage data (questions, story, config) is pre-parsed into TypeScript modules for type safety and zero runtime parsing. Quest progress persisted via a new `quest_progress` Supabase table.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (DB + RLS), Tailwind CSS 4, shadcn/ui, existing AudioRecorder + iFlytek ISE integration, existing TTS for retry hints.

---

## Asset Reference

**Boss images** (`public/img/boss/`):
| Stage | Path | Boss Name |
|-------|------|-----------|
| 1 | `/img/boss/1/1.webp` | Demon King of Turmoil (混乱魔王) |
| 2 | `/img/boss/2/2.webp` | Water Spirit (水灵) |
| 3 | `/img/boss/3/1.webp` | Lady of Bleached Bones (白骨夫人) |
| 4 | `/img/boss/4/1.webp` | Moonfang Wolf Demon (月牙狼魔) |
| 5 | `/img/boss/5/1.webp` | Bull Demon King (牛魔王) |
| 6 | `/img/boss/6/1.webp` | Heavenly Guardian (天庭守护者) |
| 7 | `/img/boss/7/1.webp` | Twisted Sun Wukong (扭曲悟空) |

**Stage backgrounds** (`public/img/main stage/`): `1.webp` through `7.webp` (+ `1-1.webp` alternate for stage 1 intro)

**Main characters** (`public/img/main character/`):
| Character | Path (variant 1) | Path (variant 2) | Unlock |
|-----------|-------------------|-------------------|--------|
| Son Wukong (孙悟空) | `/img/main character/son wukong/1.webp` | `.../2.webp` | Default |
| Sam Jang (三藏) | `/img/main character/sam jang/1.webp` | `.../2-1.webp` | Stage 2 |
| Sha Wujing (沙悟净) | `/img/main character/sha wujing/1.webp` | `.../2.webp` | Stage 3 |
| Zhu Baijie (猪八戒) | `/img/main character/zhu bajie/1.webp` | `.../2.webp` | Stage 6 |

**Stage questions** (`public/stageQuestion/`): `1.md` through `7.md` — source of truth for all questions (pre-parsed into TypeScript data files).

**Story** (`public/storyline/story.md`): Full 7-stage narrative.

---

## Battle System Design

**Turn flow per round:**
1. **Boss Attack Phase** (1-3 MCQ questions sequentially)
   - MCQ appears with countdown timer (15s for stages 1-4, 12s for stages 5-7)
   - Correct answer = block (no damage, green shield animation)
   - Wrong answer / timeout = lose 1 HP (red flash, screen shake)
   - If player HP = 0 → DEFEAT
2. **Player Attack Phase** (1 recording group)
   - Show reference text (word group or passage)
   - User records via AudioRecorder
   - Send to `/api/speech/assess` for iFlytek ISE scoring
   - Animate damage to boss based on score (always completes the group)
   - Boss HP decreases by `bossMaxHP / totalRecordingGroups`
   - If all recording groups done → boss HP = 0 → VICTORY

**Player HP per stage:**

| Stage | Player HP | MCQ Count | Recording Groups | MCQ Timer |
|-------|-----------|-----------|------------------|-----------|
| 1 | 5 | 5 | 1 (10 mono) | 15s |
| 2 | 5 | 10 | 4 (2 mono + 2 multi) | 15s |
| 3 | 4 | 10 | 3 (1 mono + 1 multi + C4) | 15s |
| 4 | 4 | 10 | 2 (1 mono + 1 multi) | 15s |
| 5 | 3 | 10 | 3 (2 multi + C4) | 12s |
| 6 | 3 | 15 | 3 (3 multi) | 12s |
| 7 | 3 | 15 | 4 (3 multi + C4) | 12s |

**Retry mechanic:** On first attempt, no hints. After 1+ failed attempt on that stage, user can toggle pinyin display and play TTS audio for recording words.

**Character unlocks:** Clearing stages 2, 3, 6 automatically unlocks a new party member. Unlocked characters appear next to Son Wukong in the battle HUD on subsequent stages.

---

## File Structure (New Files)

```
src/
├── app/(main)/main-quest/
│   ├── page.tsx                     # Server component: fetch progress, render client
│   ├── loading.tsx                  # Loading skeleton
│   └── main-quest-client.tsx        # Heavy client: state machine orchestration
├── components/quest/
│   ├── intro-screen.tsx             # Full-screen story intro overlay
│   ├── stage-select.tsx             # Stage map with locked/unlocked states
│   ├── story-screen.tsx             # Pre-battle story narration
│   ├── battle-screen.tsx            # Battle layout: background, sprites, HUD
│   ├── battle-hud.tsx               # HP bars, turn indicator, timer
│   ├── player-attack.tsx            # Recording turn: word display + AudioRecorder
│   ├── boss-attack.tsx              # MCQ turn: question + options + countdown
│   ├── victory-screen.tsx           # Victory overlay + XP + character unlock
│   └── defeat-screen.tsx            # Defeat overlay + retry option
├── lib/quest/
│   ├── types.ts                     # All quest-related TypeScript types
│   ├── stage-config.ts              # Stage metadata (boss, bg, HP, names, unlock)
│   ├── stage-questions.ts           # Pre-parsed questions from stageQuestion/*.md
│   ├── story-text.ts                # Story text extracted from storyline/story.md
│   └── battle-logic.ts              # Turn sequencing, HP calc, round generation
└── app/api/quest/
    └── progress/route.ts            # GET + POST quest progress
```

---

## Task 1: Create Quest Type Definitions

**Files:**
- Create: `src/lib/quest/types.ts`

**Step 1: Write the types file**

```typescript
// src/lib/quest/types.ts

/** Which stage (1-7) */
export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Quest screen states */
export type QuestScreen =
  | "intro"
  | "stage_select"
  | "story"
  | "battle"
  | "victory"
  | "defeat";

/** iFlytek ISE category mapping */
export type RecordingCategory = "read_syllable" | "read_word" | "read_chapter";

/** A group of words/passage for the player to record */
export interface RecordingGroup {
  /** Display label, e.g. "Monosyllabic Characters" */
  label: string;
  /** 'monosyllabic' | 'multisyllabic' | 'passage' */
  type: "monosyllabic" | "multisyllabic" | "passage";
  /** Individual words for mono/multi, or empty for passage */
  words: string[];
  /** Full passage text for C4 type */
  passageText?: string;
  /** iFlytek ISE category */
  category: RecordingCategory;
  /** Pinyin for each word (shown on retry) */
  pinyin?: string[];
}

/** A single MCQ question for boss attack */
export interface QuestMCQ {
  /** Optional narrative context before the question */
  context?: string;
  /** The question prompt */
  prompt: string;
  /** Answer choices (2-5 options) */
  options: string[];
  /** Index of the correct answer in options[] */
  correctIndex: number;
  /** Highlighted character (for polyphonic questions) */
  highlightedChar?: string;
}

/** All questions for a single stage */
export interface StageQuestions {
  recordingGroups: RecordingGroup[];
  mcqQuestions: QuestMCQ[];
}

/** A single battle round (boss attacks, then player attacks) */
export interface BattleRound {
  /** Indices into mcqQuestions[] for boss attack phase */
  mcqIndices: number[];
  /** Index into recordingGroups[] for player attack phase (-1 if no recording this round) */
  recordingGroupIndex: number;
}

/** Static metadata for a stage */
export interface StageConfig {
  stage: StageNumber;
  /** Display name */
  name: string;
  /** Chinese name */
  nameCN: string;
  /** Short subtitle */
  subtitle: string;
  /** Boss name */
  bossName: string;
  /** Boss Chinese name */
  bossNameCN: string;
  /** Path to boss image */
  bossImage: string;
  /** Path to stage background */
  backgroundImage: string;
  /** Player max HP (wrong answers allowed before fail) */
  playerMaxHP: number;
  /** Boss max HP (visual, always 100) */
  bossMaxHP: number;
  /** MCQ timer in seconds */
  mcqTimerSeconds: number;
  /** Which character is unlocked on clearing this stage (null if none) */
  unlocksCharacter: string | null;
  /** Stages that must be cleared before this one is playable */
  prerequisiteStage: StageNumber | null;
}

/** Persisted quest progress for one user */
export interface QuestProgress {
  id: string;
  user_id: string;
  stage: StageNumber;
  is_cleared: boolean;
  attempts: number;
  best_score: number;
  cleared_at: string | null;
}

/** Runtime battle state */
export interface BattleState {
  /** Current stage config */
  stage: StageConfig;
  /** All rounds for this battle */
  rounds: BattleRound[];
  /** Current round index */
  currentRound: number;
  /** Current phase within the round */
  phase: "boss_attack" | "player_attack" | "animating";
  /** Current MCQ index within the round's mcqIndices */
  currentMCQInRound: number;
  /** Player current HP */
  playerHP: number;
  /** Boss current HP (0-100) */
  bossHP: number;
  /** Number of recording groups completed */
  recordingsCompleted: number;
  /** Total recording groups */
  totalRecordings: number;
  /** Is this a retry attempt (enables hints) */
  isRetry: boolean;
  /** Per-question results for scoring */
  results: {
    mcqCorrect: number;
    mcqTotal: number;
    avgPronunciationScore: number;
    pronunciationScores: number[];
  };
}

/** Props passed from server to client */
export interface MainQuestClientProps {
  questProgress: QuestProgress[];
  unlockedCharacters: string[];
}
```

**Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/quest/types.ts 2>&1 | head -20`
Expected: No errors (or only import-related if referenced files don't exist yet)

**Step 3: Commit**

```bash
git add src/lib/quest/types.ts
git commit -m "feat(quest): add quest type definitions"
```

---

## Task 2: Create Stage Configuration

**Files:**
- Create: `src/lib/quest/stage-config.ts`

**Step 1: Write the stage config**

```typescript
// src/lib/quest/stage-config.ts
import type { StageConfig, StageNumber } from "./types";

export const STAGE_CONFIGS: Record<StageNumber, StageConfig> = {
  1: {
    stage: 1,
    name: "Prologue",
    nameCN: "序章",
    subtitle: "The Divine Staff Awakens",
    bossName: "Demon King of Turmoil",
    bossNameCN: "混乱魔王",
    bossImage: "/img/boss/1/1.webp",
    backgroundImage: "/img/main stage/1.webp",
    playerMaxHP: 5,
    bossMaxHP: 100,
    mcqTimerSeconds: 15,
    unlocksCharacter: null,
    prerequisiteStage: null,
  },
  2: {
    stage: 2,
    name: "River of Shattered Tone",
    nameCN: "碎调之河",
    subtitle: "Water Spirits Bend Your Voice",
    bossName: "Water Spirit",
    bossNameCN: "水灵",
    bossImage: "/img/boss/2/2.webp",
    backgroundImage: "/img/main stage/2.webp",
    playerMaxHP: 5,
    bossMaxHP: 100,
    mcqTimerSeconds: 15,
    unlocksCharacter: "Sam Jang",
    prerequisiteStage: 1,
  },
  3: {
    stage: 3,
    name: "Desert of Illusion",
    nameCN: "幻影沙漠",
    subtitle: "The Lady of Bleached Bones",
    bossName: "Lady of Bleached Bones",
    bossNameCN: "白骨夫人",
    bossImage: "/img/boss/3/1.webp",
    backgroundImage: "/img/main stage/3.webp",
    playerMaxHP: 4,
    bossMaxHP: 100,
    mcqTimerSeconds: 15,
    unlocksCharacter: "Sha Wujing",
    prerequisiteStage: 2,
  },
  4: {
    stage: 4,
    name: "Moonlit Mountain",
    nameCN: "月影山",
    subtitle: "The Wolf Knows Your Weakness",
    bossName: "Moonfang Wolf Demon",
    bossNameCN: "月牙狼魔",
    bossImage: "/img/boss/4/1.webp",
    backgroundImage: "/img/main stage/4.webp",
    playerMaxHP: 4,
    bossMaxHP: 100,
    mcqTimerSeconds: 15,
    unlocksCharacter: null,
    prerequisiteStage: 3,
  },
  5: {
    stage: 5,
    name: "Misty Bamboo Forest",
    nameCN: "迷雾竹林",
    subtitle: "The Corrupted Bull Demon",
    bossName: "Bull Demon King",
    bossNameCN: "牛魔王",
    bossImage: "/img/boss/5/1.webp",
    backgroundImage: "/img/main stage/5.webp",
    playerMaxHP: 3,
    bossMaxHP: 100,
    mcqTimerSeconds: 12,
    unlocksCharacter: null,
    prerequisiteStage: 4,
  },
  6: {
    stage: 6,
    name: "Plains of Fading Echoes",
    nameCN: "余音平原",
    subtitle: "The Heavenly Trial",
    bossName: "Heavenly Guardian",
    bossNameCN: "天庭守护者",
    bossImage: "/img/boss/6/1.webp",
    backgroundImage: "/img/main stage/6.webp",
    playerMaxHP: 3,
    bossMaxHP: 100,
    mcqTimerSeconds: 12,
    unlocksCharacter: "Zhu Baijie",
    prerequisiteStage: 5,
  },
  7: {
    stage: 7,
    name: "Western Palace",
    nameCN: "西天宫殿",
    subtitle: "Face Your Own Shadow",
    bossName: "Twisted Sun Wukong",
    bossNameCN: "扭曲悟空",
    bossImage: "/img/boss/7/1.webp",
    backgroundImage: "/img/main stage/7.webp",
    playerMaxHP: 3,
    bossMaxHP: 100,
    mcqTimerSeconds: 12,
    unlocksCharacter: null,
    prerequisiteStage: 6,
  },
};

/** Character image paths for quest party display */
export const QUEST_CHARACTERS: Record<
  string,
  { name: string; nameCN: string; image: string; imageAlt: string }
> = {
  "Son Wukong": {
    name: "Son Wukong",
    nameCN: "孙悟空",
    image: "/img/main character/son wukong/1.webp",
    imageAlt: "/img/main character/son wukong/2.webp",
  },
  "Sam Jang": {
    name: "Sam Jang",
    nameCN: "三藏",
    image: "/img/main character/sam jang/1.webp",
    imageAlt: "/img/main character/sam jang/2-1.webp",
  },
  "Sha Wujing": {
    name: "Sha Wujing",
    nameCN: "沙悟净",
    image: "/img/main character/sha wujing/1.webp",
    imageAlt: "/img/main character/sha wujing/2.webp",
  },
  "Zhu Baijie": {
    name: "Zhu Baijie",
    nameCN: "猪八戒",
    image: "/img/main character/zhu bajie/1.webp",
    imageAlt: "/img/main character/zhu bajie/2.webp",
  },
};

/** Order characters unlock in */
export const CHARACTER_UNLOCK_ORDER = [
  "Son Wukong",
  "Sam Jang",
  "Sha Wujing",
  "Zhu Baijie",
] as const;

export function getStageConfig(stage: StageNumber): StageConfig {
  return STAGE_CONFIGS[stage];
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit src/lib/quest/stage-config.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/quest/stage-config.ts
git commit -m "feat(quest): add stage configuration data for 7 stages"
```

---

## Task 3: Create Story Text Data

**Files:**
- Create: `src/lib/quest/story-text.ts`

**Step 1: Write story text**

Extract from `public/storyline/story.md`. Each stage has `introParagraphs` (shown before battle) and `outroParagraphs` (shown after victory). Keep the English narrative as-is from the story file.

```typescript
// src/lib/quest/story-text.ts
import type { StageNumber } from "./types";

interface StageStory {
  /** Opening text before the stage title */
  intro: string[];
  /** Text shown after victory (companion recruitment, etc.) */
  outro: string[];
}

export const STAGE_STORIES: Record<StageNumber, StageStory> = {
  1: {
    intro: [
      "Long ago, sacred scriptures brought from the West stabilized the world through the power of language. However, over centuries, people have grown careless — misusing tones, weakening pronunciation.",
      "From the broken sounds, monsters were born. The source of corruption comes from the West, where an unknown shadow figure disrupts the language.",
      "You are an ordinary traveler with a vow to defeat the figure that causes chaos, and you begin the Journey to the West.",
      "As you start your journey, you encounter a powerful entity: The Demon King of Turmoil. Your voice trembles, your syllables lack strength. You fall to your knees.",
      "The sky opens wide. A divine staff descends — once wielded by Sun Wukong himself. A celestial voice speaks: \"Clarity is strength. Speak correctly, and the world will answer.\"",
      "The divine staff glows golden as it binds to you. It can only be wielded when you correctly pronounce the Chinese characters.",
    ],
    outro: [
      "You seal the Demon King of Turmoil by speaking in clarity. The celestial being grants you a map of the Western Palace.",
      "You rise again, feeling more capable and energetic. Your journey to the West begins.",
    ],
  },
  2: {
    intro: [
      "An enormous river shifts and swirls, barring your path. The air is thick with the scent of rain and splashing water.",
      "Water spirits lurk inside the violent river, distorting and bending your pitch, weakening your will to fight back.",
      "You see a small woman drowning before your eyes — fighting to escape the violent river pulling her down.",
    ],
    outro: [
      "With every truth spoken, the water spirits weaken and the river calms. You pull the woman from the calm water.",
      "She introduces herself as Samjang, a Buddhist monk destined to travel to the West. She will now accompany you on your journey.",
      "Sam Jang has joined your party!",
    ],
  },
  3: {
    intro: [
      "The air becomes thicker. A bright golden landscape stretches before you — the Desert of Illusion.",
      "The sun dries your throat. You feel immense pressure, yet see nothing but a wasteland filled with weapons of fallen adventurers.",
      "A pale bone demon appears — the Lady of Bleached Bones. She disguises herself with misleading voices.",
    ],
    outro: [
      "Your perfect pronunciation breaks her illusion. Before she vanishes, she warns: \"The West will consume all sounds.\"",
      "You find a man crouching nearby. He introduces himself as Sha Wujing, a water sorcerer banished from heaven.",
      "Sha Wujing has joined your party!",
    ],
  },
  4: {
    intro: [
      "Night falls upon the landscape. You are met with a gigantic mountain, lit only by the moon guiding your path.",
      "An eerie howl echoes deep in the mountains. The wind rustles, hiding an unknown monster lurking in the woods.",
      "A Moonfang Wolf Demon rushes towards you — eyes clear like the moon, as if it knows everything about you.",
    ],
    outro: [
      "The fight between you and the demon echoes across the moonlit mountain.",
      "The staff pierces through the wolf's skin, eventually making it retreat to its hiding place. You continue onward.",
    ],
  },
  5: {
    intro: [
      "You trek down to ground level and enter a territory where everything is foggy. Bamboo sticks reach high into the sky.",
      "A loud rumble comes from deep in the ground, growing closer. A demonic entity with red eyes and brown skin appears.",
      "The Bull Demon King — once powerful, now corrupted by the distorted sound of the West. He rushes towards you.",
    ],
    outro: [
      "The bull's flame extinguishes, his strength depleted. He speaks in a deep voice: \"You are walking on your own shadow. Halt here or face the consequences.\"",
      "With victory in hand, you move on through the clearing mist.",
    ],
  },
  6: {
    intro: [
      "You finish walking through the misty bamboo forest. The sun greets you with golden light as the night ends.",
      "A vast open plain stretches before you — too peaceful to be true. The sky is pale and clear, birds chirping gently.",
      "From the sky, an entity floats down. It is not hostile. A deep voice shakes your body: \"You shall pass the Heavenly Principles trial and prove yourself worthy.\"",
      "The Heavenly Guardian has come to test whether you are suitable for the final trial before entering the Western Palace.",
    ],
    outro: [
      "The celestial being declares: \"You have proven yourself capable. May the divine staff guide your way till the end.\"",
      "A pigsy man lies on the grass nearby. He introduces himself as Zhu Baijie, a former heavenly commander banished for his laziness.",
      "Zhu Baijie has joined your party!",
      "At the end of the plain, you see the distant silhouette of the Western Palace.",
    ],
  },
  7: {
    intro: [
      "You step into the Western Palace. It's eerily quiet and eccentric — not what you expected.",
      "You unveil the truth: the final corruption is not an ordinary demon king, but a twisted shadow of Sun Wukong himself.",
      "This entity represents strength without clarity and voice without understanding. He feeds on your mispronunciation. He feeds on your fear.",
      "Every crackle in your tone strengthens him. The only way to defeat him is to gather all the knowledge you've learned from the beginning until now.",
    ],
    outro: [
      "The divine staff emits an unprecedented light, illuminating the entire palace. All twisted reflections dissolve.",
      "A celestial voice speaks, clear as spring water: \"Thank you. The power of language has finally been restored.\"",
      "The sacred scriptures are restored. The world is stabilized. You now own the divine staff and vow to protect the harmony of Chinese pronunciation forever.",
      "Congratulations — you have completed the Journey to the West!",
    ],
  },
};

/** Brief overall story summary shown on first entry */
export const QUEST_INTRO_TEXT = [
  "Long ago, sacred scriptures brought from the West stabilized the world through the power of language.",
  "But over centuries, people grew careless — misusing tones, weakening pronunciation. From the broken sounds, monsters were born.",
  "The source of corruption comes from the West, where an unknown shadow figure disrupts the language.",
  "You, an ordinary traveler, take up the divine staff of Sun Wukong and begin the Journey to the West.",
  "Clarity is strength. Speak correctly, and the world will answer.",
];
```

**Step 2: Commit**

```bash
git add src/lib/quest/story-text.ts
git commit -m "feat(quest): add story text data for all 7 stages"
```

---

## Task 4: Create Stage Questions Data

**Files:**
- Create: `src/lib/quest/stage-questions.ts`

This is the largest data file. Carefully transcribe all questions from `public/stageQuestion/1.md` through `7.md` into typed structures. Below shows the full structure with Stage 1 complete and Stage 2 partially complete as examples. **The implementer must fill in ALL 7 stages from the markdown files.**

**Step 1: Write the questions file**

```typescript
// src/lib/quest/stage-questions.ts
import type { StageNumber, StageQuestions } from "./types";

export const STAGE_QUESTIONS: Record<StageNumber, StageQuestions> = {
  1: {
    recordingGroups: [
      {
        label: "Monosyllabic Characters",
        type: "monosyllabic",
        words: ["哲", "洽", "滕", "昂", "翻", "悅", "铭", "欧", "巢", "披"],
        category: "read_syllable",
      },
    ],
    mcqQuestions: [
      {
        prompt: "Which is the standard Putonghua word for 'sun'?",
        options: ["太阳", "热头", "日头"],
        correctIndex: 0,
      },
      {
        prompt: "Which is the standard Putonghua word for 'rain'?",
        options: ["下雨", "落雨", "掉点儿"],
        correctIndex: 0,
      },
      {
        prompt: "Which is the standard Putonghua word for 'sweet potato'?",
        options: ["地瓜", "红薯", "番薯"],
        correctIndex: 1,
      },
      {
        prompt: "一（   ）钥匙",
        options: ["把", "根", "条", "个", "串"],
        correctIndex: 0,
      },
      {
        prompt: "一（   ）皮带",
        options: ["条", "根", "段", "个", "副"],
        correctIndex: 0,
      },
    ],
  },

  2: {
    recordingGroups: [
      {
        label: "Monosyllabic Group 1",
        type: "monosyllabic",
        words: ["袁", "渺", "谬", "峦", "踱", "嗓", "饶", "瞻", "窑", "迂"],
        category: "read_syllable",
      },
      {
        label: "Monosyllabic Group 2",
        type: "monosyllabic",
        words: ["鳖", "涮", "袍", "鳃", "赣", "瘟", "蕨", "驴", "唐", "猿"],
        category: "read_syllable",
      },
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["拐弯儿", "探索", "创作", "西游记", "火眼金睛", "取经", "挖苦", "贫穷", "一目了然"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["挫折", "压迫", "减轻", "罪恶", "金箍棒", "紧箍咒", "签订", "疲倦", "侦查", "窗子"],
        category: "read_word",
      },
    ],
    mcqQuestions: [
      {
        prompt: "Which sentence uses correct Putonghua word order?",
        options: ["我先走", "我走先", "我走头先"],
        correctIndex: 0,
      },
      {
        prompt: "Which sentence uses correct Putonghua word order?",
        options: ["你吃饭头先", "你吃饭先", "你先吃饭"],
        correctIndex: 2,
      },
      {
        prompt: "Which question format is correct in Putonghua?",
        options: ["你听得懂不懂？", "你听不听得懂？", "你听得懂吗？"],
        correctIndex: 1,
      },
      {
        prompt: "Which comparison sentence is correct?",
        options: ["我比他三岁大", "我大他三岁", "我比他大三岁"],
        correctIndex: 2,
      },
      {
        prompt: "Which question is grammatically correct?",
        options: ["他有来没有？", "他来没来？", "他有没有来？"],
        correctIndex: 1,
      },
      {
        context: "二十八星**宿**是古代天文概念。",
        prompt: "What is the correct pronunciation of 宿 here?",
        highlightedChar: "宿",
        options: ["sù", "xiǔ", "xiù"],
        correctIndex: 2,
      },
      {
        context: "这本书**载**有很多历史故事。",
        prompt: "What is the correct pronunciation of 载 here?",
        highlightedChar: "载",
        options: ["zǎi", "zài"],
        correctIndex: 0,
      },
      {
        context: "车上**载**满了货物。",
        prompt: "What is the correct pronunciation of 载 here?",
        highlightedChar: "载",
        options: ["zǎi", "zài"],
        correctIndex: 1,
      },
      {
        context: "这把椅子是**钉**死的，搬不动。",
        prompt: "What is the correct pronunciation of 钉 here?",
        highlightedChar: "钉",
        options: ["dīng", "dìng"],
        correctIndex: 1,
      },
      {
        context: "他在墙上**钉**了一颗钉子。",
        prompt: "What is the correct pronunciation of 钉 here?",
        highlightedChar: "钉",
        options: ["dīng", "dìng"],
        correctIndex: 1,
      },
    ],
  },

  // ──────────────────────────────────────────────────
  // IMPLEMENTER: Fill in stages 3-7 from stageQuestion/*.md
  // Follow the exact same structure as stages 1-2 above.
  // Reference files: public/stageQuestion/3.md through 7.md
  //
  // Stage 3: 1 mono group (10) + 1 multi group (10) + 10 polyphonic MCQ + C4 passage
  // Stage 4: 1 mono group (10) + 5 polyphonic MCQ + 1 multi group (10) + 5 vocab contrast MCQ
  // Stage 5: 2 multi groups (10 each) + 5 vocab contrast MCQ + 5 syntax MCQ + C4 passage
  // Stage 6: 3 multi groups (10 each) + 5 vocab MCQ + 5 syntax MCQ + 5 measure word MCQ
  // Stage 7: 3 multi groups (10 each) + 5 vocab MCQ + 5 grammar MCQ + 5 syntax MCQ + C4 passage
  //
  // For C4 passages, add a recordingGroup with type: "passage"
  // and passageText set to the full passage text, category: "read_chapter"
  // ──────────────────────────────────────────────────

  3: {
    recordingGroups: [
      {
        label: "Monosyllabic Characters",
        type: "monosyllabic",
        words: ["藕", "镶", "飘", "窝", "堪", "眯", "碾", "髻", "窟", "魏"],
        category: "read_syllable",
      },
      {
        label: "Multisyllabic Words",
        type: "multisyllabic",
        words: ["昂首", "衰变", "诋毁", "法术", "齐天大圣", "白骨精", "脸盘儿", "教训", "筋斗云", "天宫"],
        category: "read_word",
      },
      {
        label: "Passage Reading",
        type: "passage",
        words: [],
        passageText: "黄沙翻涌，铁锈味刺鼻。你刚握紧法杖，前方沙地骤然塌陷——白骨夫人出手了。\n\n五根骨刺从沙下无声刺出。你闪避着念出第一个字，声调却因喘息微微走样。她尖笑一声，骨刺在半空转向，擦着你的肋骨划过，衣襟撕开，皮肉火辣辣地疼。你踉跄后退，她枯白的手指凌空点出，骨箭从身后嗖嗖射来——你躲开三根，第四根钉住你的左肩，整个人被扯得向后一仰。\n\n不能慌。你站稳脚跟，再次开口。这一次声音稳了，字字饱满，掷地有声。那个词念完的瞬间，法杖顶端炸开一团金光——光芒扫过，她那张娇媚的人脸寸寸碎裂，露出白骨骷髅的本来面目。她尖叫着，身形凝固的刹那，你冲了上去。\n\n她挥手召来三面骨墙。你念一个字，第一面炸裂；再念一字，第二面粉碎；第三字出口，最后一面骨墙连同骨盾同时崩成齑粉。法杖抵住她的额骨，金光灼得她眼眶里的鬼火剧烈颤抖。\n\n她还想挣扎，干枯的手爪抓向你的喉咙。但你的下一个词已经出口，稳得像钉进骨头里。那个词落下时，她的身体从指尖开始溃散，化作流沙簌簌坠地，只留下一句警告在风中消散。",
        category: "read_chapter",
      },
    ],
    mcqQuestions: [
      {
        context: "悟空闪避着念出第一个字，声调却因喘息微微**行**样。",
        prompt: "What is the correct pronunciation of 行 here?",
        highlightedChar: "行",
        options: ["xíng", "háng"],
        correctIndex: 0,
      },
      {
        context: "她尖笑一声，骨刺在半空**转**向。",
        prompt: "What is the correct pronunciation of 转 here?",
        highlightedChar: "转",
        options: ["zhuǎn", "zhuàn"],
        correctIndex: 0,
      },
      {
        context: "悟空被骨箭钉住肩膀，险些**落**在地上。",
        prompt: "What is the correct pronunciation of 落 here?",
        highlightedChar: "落",
        options: ["luò", "là"],
        correctIndex: 0,
      },
      {
        context: "不能慌。悟空站稳脚跟，**重**新开口。",
        prompt: "What is the correct pronunciation of 重 here?",
        highlightedChar: "重",
        options: ["zhòng", "chóng"],
        correctIndex: 1,
      },
      {
        context: "法杖顶端炸开一团金光，照**得**沙漠如同白昼。",
        prompt: "What is the correct pronunciation of 得 here?",
        highlightedChar: "得",
        options: ["dé", "de"],
        correctIndex: 1,
      },
      {
        context: "她那张娇媚的人脸寸寸碎裂，露**出**白骨骷髅的本来面目。",
        prompt: "What is the correct pronunciation of 出 here?",
        highlightedChar: "出",
        options: ["chū", "chù"],
        correctIndex: 0,
      },
      {
        context: "她尖叫着，身形凝固的**刹**那。",
        prompt: "What is the correct pronunciation of 刹 here?",
        highlightedChar: "刹",
        options: ["shā", "chà"],
        correctIndex: 1,
      },
      {
        context: "悟空念出一个字，第二面**为**齑粉。",
        prompt: "What is the correct pronunciation of 为 here?",
        highlightedChar: "为",
        options: ["wéi", "wèi"],
        correctIndex: 0,
      },
      {
        context: "法杖抵住她的额骨，金光灼**得**她眼眶里的鬼火剧烈颤抖。",
        prompt: "What is the correct pronunciation of 得 here?",
        highlightedChar: "得",
        options: ["de", "dé"],
        correctIndex: 0,
      },
      {
        context: "她的身体从指尖开始溃散，只留下一句警告在风中**消**散。",
        prompt: "What is the correct pronunciation of 消 here?",
        highlightedChar: "消",
        options: ["xiāo", "xuè"],
        correctIndex: 0,
      },
    ],
  },

  4: {
    recordingGroups: [
      {
        label: "Monosyllabic Characters",
        type: "monosyllabic",
        words: ["狼", "月", "山", "爪", "眼", "风", "影", "嚎", "林", "夜"],
        category: "read_syllable",
      },
      {
        label: "Multisyllabic Words",
        type: "multisyllabic",
        words: ["月狼魔", "月光", "狼嚎", "山径", "利爪", "鬼火", "树影", "夜风", "偷袭", "退路"],
        category: "read_word",
      },
    ],
    mcqQuestions: [
      {
        context: "悟空侧身闪避狼魔的利爪，脚下踩到一块松动的石**头**。",
        prompt: "What is the correct pronunciation of 头 here?",
        highlightedChar: "头",
        options: ["tóu", "tou"],
        correctIndex: 1,
      },
      {
        context: "狼魔的眼睛在月光下闪着绿光，死死地**盯**着悟空。",
        prompt: "What is the correct pronunciation of 盯 here?",
        highlightedChar: "盯",
        options: ["dīng", "dìng"],
        correctIndex: 0,
      },
      {
        context: "悟空念错一个字，狼魔的利爪划**过**他的肩头。",
        prompt: "What is the correct pronunciation of 过 here?",
        highlightedChar: "过",
        options: ["guò", "guo"],
        correctIndex: 1,
      },
      {
        context: "几番回合后，狼魔终于支撑不**住**。",
        prompt: "What is the correct pronunciation of 住 here?",
        highlightedChar: "住",
        options: ["zhù", "zhu"],
        correctIndex: 1,
      },
      {
        context: "悟空收起法杖，月光**照**在他疲惫的脸上。",
        prompt: "What is the correct pronunciation of 照 here?",
        highlightedChar: "照",
        options: ["zhào", "zhào"],
        correctIndex: 0,
      },
      {
        prompt: "他____狼魔藏在哪。Which is correct Putonghua?",
        options: ["不晓得", "不知道", "不晓的"],
        correctIndex: 1,
      },
      {
        prompt: "这场战斗____要打。Which is correct Putonghua?",
        options: ["免不了", "免不得", "免不掉"],
        correctIndex: 0,
      },
      {
        prompt: "它的眼睛____两团鬼火。Which is correct Putonghua?",
        options: ["像", "好像", "好似"],
        correctIndex: 1,
      },
      {
        prompt: "悟空的肩膀____抓伤了。Which is correct Putonghua?",
        options: ["让", "被", "给"],
        correctIndex: 1,
      },
      {
        prompt: "悟空____往前走。Which is correct Putonghua?",
        options: ["继续", "连续", "持续"],
        correctIndex: 0,
      },
    ],
  },

  5: {
    recordingGroups: [
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["遮天蔽日", "弥漫", "翻涌不息", "庞然大物", "凝神戒备", "腐化", "咆哮", "轰鸣", "簌簌落下", "赤红如血"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["灼热气流", "迸发金光", "削弱", "尖锐", "挑起", "稳住心神", "清晰饱满", "昔日强者", "无路可退", "震耳欲聋"],
        category: "read_word",
      },
      {
        label: "Passage Reading",
        type: "passage",
        words: [],
        passageText: "雾气像活的。你踏入竹林第一步就感觉到了——那些灰白的雾缠绕着你的脚踝，顺着裤管往上爬。竹子密密麻麻，遮天蔽日，十步之外只剩模糊的影。你握紧法杖，放慢脚步，指节因为用力而泛白。\n\n地面突然抖了一下。\n\n你顿住，侧耳倾听。又是几下颤抖，竹叶簌簌落下，打着旋儿飘进雾里。颤抖越来越剧烈，变成有节奏的震动——咚、咚、咚——像巨人的心跳，像战鼓，从竹林深处逼近。你压低身形，法杖横在胸前。\n\n雾气猛地被撕开。\n\n一个巨大的黑影冲了出来，头顶双角赤红如血，四蹄踏得地面隆隆作响。牛魔王！你还没看清，那庞然大物已经到了跟前。你侧身一滚，牛角擦着你的腰际划过，撞在身后的竹子上，碗口粗的竹子拦腰折断。\n\n你翻身跃起，开口念出第一个字。声调刚出口，你就知道自己错了——喘息未定，音走了样。牛魔王猛地回头，一角挑在你的肋下。你整个人被掀上半空，重重摔在竹叶堆里，胸口闷得像压了块石头。\n\n不能慌。你撑着法杖站起来，深吸一口气，再次开口。这一次声音稳了，字字饱满，掷地有声。那个词念完的瞬间，法杖顶端炸开一团金光——光芒直直劈向牛魔王，他庞大的身躯一晃，后退半步，发出一声痛苦的咆哮。\n\n你冲了上去。你踩着自己的节奏，每一步配合一次发音。牛魔王低头冲来，你念出一个字，金光如锤砸在他的脑门上；再念一字，金光劈在他的肩胛；第三字出口，金光直直刺进他的胸口。牛魔王终于支撑不住，庞大的身躯轰然跪地，然后侧倒下去，震得满林竹叶纷飞。\n\n你收起法杖，喘着粗气。雾气渐渐散去，竹林恢复了寂静。你抹了把额头的汗，继续向前走去。",
        category: "read_chapter",
      },
    ],
    mcqQuestions: [
      {
        prompt: "雾大得____也看不见。Which is correct Putonghua?",
        options: ["啥", "什么", "嘛"],
        correctIndex: 1,
      },
      {
        prompt: "这是____声音。Which is correct Putonghua?",
        options: ["啥子", "什么", "啥"],
        correctIndex: 1,
      },
      {
        prompt: "____得小心点。Which is correct Putonghua?",
        options: ["俺", "我", "咱"],
        correctIndex: 1,
      },
      {
        prompt: "这牛魔____厉害。Which is correct Putonghua?",
        options: ["真", "忒", "好"],
        correctIndex: 0,
      },
      {
        prompt: "这回____得拼命。Which is correct Putonghua?",
        options: ["八成", "肯定", "指定"],
        correctIndex: 1,
      },
      {
        prompt: "悟空举起法杖，准备迎战牛魔王。Which sentence is grammatically correct?",
        options: ["悟空念咒语给牛魔王", "悟空念给牛魔王咒语", "悟空念咒语对牛魔王"],
        correctIndex: 0,
      },
      {
        prompt: "牛魔王从雾气中冲出来。Which sentence is grammatically correct?",
        options: ["悟空躲开了牛魔王的角", "悟空躲牛魔王的角开了", "悟空躲开角牛魔王的"],
        correctIndex: 0,
      },
      {
        prompt: "悟空念错了一个字。Which sentence is grammatically correct?",
        options: ["牛魔王把角刺向悟空", "牛魔王把角对悟空刺", "牛魔王把悟空刺角"],
        correctIndex: 0,
      },
      {
        prompt: "法杖迸发出金光。Which sentence is grammatically correct?",
        options: ["金光让牛魔王削弱了力量", "金光削弱了牛魔王的力量", "金光把力量削弱了牛魔王"],
        correctIndex: 1,
      },
      {
        prompt: "经过一番苦战。Which sentence is grammatically correct?",
        options: ["悟空击败了牛魔王", "悟空击败牛魔王了", "悟空把牛魔王击败了"],
        correctIndex: 0,
      },
    ],
  },

  6: {
    recordingGroups: [
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["豁然开朗", "涟漪", "婉转啼鸣", "暴风雨", "缝隙", "守护者", "天庭试炼", "熠熠生辉", "颔首", "云朵儿"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["震耳欲聋", "璀璨", "纹丝不动", "凝神", "屏息", "脱口而出", "字正腔圆", "气喘吁吁", "摇摇欲坠", "火星儿"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 3",
        type: "multisyllabic",
        words: ["全力以赴", "半信半疑", "恍然大悟", "从容不迫", "不知所措", "念念有词", "目瞪口呆", "振振有词", "云彩", "花瓣儿"],
        category: "read_word",
      },
    ],
    mcqQuestions: [
      {
        prompt: "这地方____安静。Which is correct Putonghua?",
        options: ["贼", "非常", "老"],
        correctIndex: 1,
      },
      {
        prompt: "草被风吹得____。Which is correct Putonghua?",
        options: ["直晃悠", "直摇晃", "直摆动"],
        correctIndex: 1,
      },
      {
        prompt: "这场景____震撼。Which is correct Putonghua?",
        options: ["真", "忒", "超"],
        correctIndex: 0,
      },
      {
        prompt: "这声音____有力量。Which is correct Putonghua?",
        options: ["挺", "怪", "蛮"],
        correctIndex: 0,
      },
      {
        prompt: "他____你点了点头。Which is correct Putonghua?",
        options: ["朝", "冲", "对"],
        correctIndex: 2,
      },
      {
        prompt: "守护者的声音在山谷中回荡。Which is grammatically correct?",
        options: ["你听见了守护者的声音", "你听见守护者的声音了", "你把守护者的声音听见了"],
        correctIndex: 0,
      },
      {
        prompt: "你握紧法杖，准备接受考验。Which is grammatically correct?",
        options: ["你把法杖握在手里", "你握法杖在手里", "你在手里握法杖"],
        correctIndex: 0,
      },
      {
        prompt: "你念错了一个字。Which is grammatically correct?",
        options: ["一道闪电劈在你肩头", "一道闪电劈你肩头在", "一道闪电把你肩头劈"],
        correctIndex: 0,
      },
      {
        prompt: "你念对了一个复杂的词。Which is grammatically correct?",
        options: ["你让守护者点头了", "守护者对你点了点头", "守护者冲你点了头"],
        correctIndex: 1,
      },
      {
        prompt: "闪电劈下来的时候。Which is grammatically correct?",
        options: ["你被闪电劈中了肩膀", "你让闪电劈中了肩膀", "你给闪电劈中了肩膀"],
        correctIndex: 0,
      },
      {
        prompt: "天空中飘着一_____云彩。",
        options: ["片", "朵", "块"],
        correctIndex: 1,
      },
      {
        prompt: "守护者手中握着一_____发光的法杖。",
        options: ["根", "条", "把"],
        correctIndex: 0,
      },
      {
        prompt: "你的肩上留下了一_____焦痕。",
        options: ["道", "条", "片"],
        correctIndex: 0,
      },
      {
        prompt: "嘴里吐出的每一_____字都像钟声。",
        options: ["个", "颗", "粒"],
        correctIndex: 0,
      },
      {
        prompt: "你长长地舒了一_____气。",
        options: ["口", "股", "阵"],
        correctIndex: 0,
      },
    ],
  },

  7: {
    recordingGroups: [
      {
        label: "Multisyllabic Group 1",
        type: "multisyllabic",
        words: ["皇宫", "铜镜", "矗立", "扭曲", "空洞", "腐化", "残影", "主宰", "囚徒", "秃鹫"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 2",
        type: "multisyllabic",
        words: ["震耳欲聋", "吼叫", "吞食", "养料", "秃鹫", "破碎", "音节", "扰乱", "心神", "撕咬"],
        category: "read_word",
      },
      {
        label: "Multisyllabic Group 3",
        type: "multisyllabic",
        words: ["深呼吸", "回荡", "嘶吼", "溃散", "前所未有", "透亮", "消散", "青烟", "清澈", "温和"],
        category: "read_word",
      },
      {
        label: "Final Passage",
        type: "passage",
        words: [],
        passageText: "你推开宫门，愣在原地。\n没有宝座，没有妖魔。只有一面面铜镜矗立其间，每一面都映出你的身影——有的模糊，有的扭曲，有的嘴唇翕动却发不出声。死一般的寂静压得你喘不过气。\n\"你来了。\"\n声音从四面八方涌来。你握紧法杖，循声望去。大殿尽头，一面最高的铜镜前，站着一个身影——那是你，又不完全是你。周身笼罩灰暗的光，眼神空洞，嘴唇不停开合，却没有声音。\n铜镜炸裂。他走了出来。\n孙悟空扭曲的幻影。曾经的语言主宰，如今的语音囚徒。他靠吞食错误发音为生——你一路走来念错的每一个字，都成了滋养他的养料。\n没有退路。你举起法杖。\n他率先出手。刺耳的音波扑面而来，你耳膜剧痛，脚步踉跄。你开口念出第一个字——声调刚出口，你就知道错了。喘息未定，音走了样。破碎的音节呼啸着扑上来，撕咬你的肩膀。剧痛让你几乎失声。\n不能慌。你咬紧牙，站稳脚跟，再次开口。这一次声音稳了，字字饱满，掷地有声。那个词念完的瞬间，法杖顶端炸开一团金光——光芒直直劈向他的胸口。他嘶吼着后退半步。\n你冲了上去。你踩着自己的节奏，每一步配合一次发音。他挥爪抓来，你念出一个字，金光砸在他的额头；他张嘴咆哮，你再念一字，金光刺进他的喉咙；他周身阴影翻涌，第三字出口，金光撕开他胸口的黑暗。他踉跄着后退，身影越来越淡。\n最后一个字落下。法杖迸发出前所未有的光芒，照亮整个大殿。所有铜镜里的扭曲身影同时消散，只剩下你自己的倒影，清晰而坚定。\n他化作一缕青烟，消失在空气中。\n穹顶缓缓打开，金色的阳光倾泻而下。一个声音从天际传来，清澈如泉水：\n\"谢谢你。语言的力量，终于恢复了。\"\n你握紧法杖，望向天空。阳光照在脸上，温暖而明亮。",
        category: "read_chapter",
      },
    ],
    mcqQuestions: [
      {
        prompt: "这地方____这么安静。Which is correct Putonghua?",
        options: ["咋", "怎么", "咋地"],
        correctIndex: 1,
      },
      {
        prompt: "有的____不清。Which is correct Putonghua?",
        options: ["模糊", "迷糊", "模乎"],
        correctIndex: 0,
      },
      {
        prompt: "他的眼神____。Which is correct Putonghua?",
        options: ["吓人", "瘆人", "骇人"],
        correctIndex: 0,
      },
      {
        prompt: "我____他能赢。Which is correct Putonghua?",
        options: ["以为", "意思", "觉着"],
        correctIndex: 0,
      },
      {
        prompt: "别____了，上吧。Which is correct Putonghua?",
        options: ["磨叽", "磨洋工", "磨蹭"],
        correctIndex: 2,
      },
      {
        prompt: "那身影从镜中走了出来。Which is grammatically correct?",
        options: ["他从镜子里走出来了", "他走出来从镜子里了", "他走出来镜子从里"],
        correctIndex: 0,
      },
      {
        prompt: "他靠吞食错误的发音为生。Which is grammatically correct?",
        options: ["他把错误的发音吞食", "错误的发音被他吞食", "他吞食错误的发音"],
        correctIndex: 2,
      },
      {
        prompt: "你念错了字，他的力量就会增强。Which is grammatically correct?",
        options: ["你被错误增强了力量", "错误让你增强了力量", "错误被他增强了力量"],
        correctIndex: 1,
      },
      {
        prompt: "法杖迸发的金光能撕裂他的阴影。Which is grammatically correct?",
        options: ["金光把阴影撕裂了", "金光被阴影撕裂了", "阴影把金光撕裂了"],
        correctIndex: 0,
      },
      {
        prompt: "所有的磨练，都是为了这一刻。Which is grammatically correct?",
        options: ["这一刻被你等待", "你等待这一刻", "这一刻让你等待"],
        correctIndex: 1,
      },
      {
        prompt: "你深吸一口气，开口念出第一个字。Which is grammatically correct?",
        options: ["你把第一个字念得清清楚楚", "你念第一个字得清清楚楚", "你念第一个字清清楚楚得"],
        correctIndex: 0,
      },
      {
        prompt: "他的身影化作一缕青烟。Which is grammatically correct?",
        options: ["青烟被空气中消失了", "青烟在空气中消失了", "青烟把空气中消失了"],
        correctIndex: 1,
      },
      {
        prompt: "法杖顶端炸开一团金光。Which is grammatically correct?",
        options: ["整个大殿被照亮了", "整个大殿把照亮了", "整个大殿让照亮了"],
        correctIndex: 0,
      },
      {
        prompt: "金色的阳光倾泻而下。Which is grammatically correct?",
        options: ["阳光照得你睁不开眼睛", "阳光照你睁不开眼睛", "阳光照得你眼睛睁不开"],
        correctIndex: 0,
      },
      {
        prompt: "天空中传来一个清澈的声音。Which is grammatically correct?",
        options: ["声音被你听见了", "你听见了声音", "你把声音听见了"],
        correctIndex: 1,
      },
    ],
  },
};
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit src/lib/quest/stage-questions.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/quest/stage-questions.ts
git commit -m "feat(quest): add pre-parsed stage questions for all 7 stages"
```

---

## Task 5: Create Battle Logic Utilities

**Files:**
- Create: `src/lib/quest/battle-logic.ts`

**Step 1: Write the battle logic**

```typescript
// src/lib/quest/battle-logic.ts
import type {
  StageNumber,
  BattleRound,
  BattleState,
  StageConfig,
  StageQuestions,
} from "./types";
import { STAGE_QUESTIONS } from "./stage-questions";
import { getStageConfig } from "./stage-config";

/**
 * Generate the sequence of battle rounds for a stage.
 * Pattern: [MCQ block] → [Recording] → [MCQ block] → [Recording] → ...
 * MCQ questions are distributed evenly across recording rounds.
 */
export function generateBattleRounds(stage: StageNumber): BattleRound[] {
  const questions = STAGE_QUESTIONS[stage];
  const numRecordings = questions.recordingGroups.length;
  const numMCQ = questions.mcqQuestions.length;

  if (numRecordings === 0) return [];

  const rounds: BattleRound[] = [];
  const mcqPerRound = Math.ceil(numMCQ / numRecordings);
  let mcqIndex = 0;

  for (let i = 0; i < numRecordings; i++) {
    // Collect MCQ indices for this round's boss attack phase
    const mcqIndices: number[] = [];
    const mcqCount = Math.min(mcqPerRound, numMCQ - mcqIndex);
    for (let j = 0; j < mcqCount; j++) {
      mcqIndices.push(mcqIndex++);
    }

    rounds.push({
      mcqIndices,
      recordingGroupIndex: i,
    });
  }

  return rounds;
}

/**
 * Create initial battle state for a stage.
 */
export function createBattleState(
  stage: StageNumber,
  isRetry: boolean
): BattleState {
  const config = getStageConfig(stage);
  const questions = STAGE_QUESTIONS[stage];
  const rounds = generateBattleRounds(stage);

  return {
    stage: config,
    rounds,
    currentRound: 0,
    phase: rounds[0]?.mcqIndices.length > 0 ? "boss_attack" : "player_attack",
    currentMCQInRound: 0,
    playerHP: config.playerMaxHP,
    bossHP: config.bossMaxHP,
    recordingsCompleted: 0,
    totalRecordings: questions.recordingGroups.length,
    isRetry,
    results: {
      mcqCorrect: 0,
      mcqTotal: 0,
      avgPronunciationScore: 0,
      pronunciationScores: [],
    },
  };
}

/**
 * Calculate boss damage when a recording group is completed.
 * Returns the HP to subtract from boss.
 */
export function calculateBossDamage(
  bossMaxHP: number,
  totalRecordings: number
): number {
  return Math.ceil(bossMaxHP / totalRecordings);
}

/**
 * Process MCQ answer result. Returns updated battle state.
 */
export function processMCQAnswer(
  state: BattleState,
  isCorrect: boolean
): BattleState {
  const newState = { ...state };
  newState.results = { ...state.results };
  newState.results.mcqTotal++;

  if (isCorrect) {
    newState.results.mcqCorrect++;
  } else {
    newState.playerHP = Math.max(0, state.playerHP - 1);
  }

  return newState;
}

/**
 * Process recording completion. Returns updated battle state.
 */
export function processRecordingComplete(
  state: BattleState,
  pronunciationScore: number
): BattleState {
  const damage = calculateBossDamage(state.stage.bossMaxHP, state.totalRecordings);
  const newState = { ...state };
  newState.results = { ...state.results };
  newState.results.pronunciationScores = [
    ...state.results.pronunciationScores,
    pronunciationScore,
  ];
  newState.results.avgPronunciationScore =
    newState.results.pronunciationScores.reduce((a, b) => a + b, 0) /
    newState.results.pronunciationScores.length;

  newState.bossHP = Math.max(0, state.bossHP - damage);
  newState.recordingsCompleted = state.recordingsCompleted + 1;

  return newState;
}

/**
 * Advance to the next phase/round. Returns updated state + game outcome.
 */
export function advanceBattle(
  state: BattleState
): { state: BattleState; outcome: "continue" | "victory" | "defeat" } {
  // Check defeat
  if (state.playerHP <= 0) {
    return { state, outcome: "defeat" };
  }

  const round = state.rounds[state.currentRound];

  // If in boss_attack phase, check if more MCQs in this round
  if (state.phase === "boss_attack") {
    const nextMCQIdx = state.currentMCQInRound + 1;
    if (nextMCQIdx < round.mcqIndices.length) {
      return {
        state: { ...state, currentMCQInRound: nextMCQIdx },
        outcome: "continue",
      };
    }
    // Boss attack phase done → player attack
    return {
      state: { ...state, phase: "player_attack" },
      outcome: "continue",
    };
  }

  // If in player_attack phase → check victory or advance to next round
  if (state.phase === "player_attack") {
    if (state.bossHP <= 0) {
      return { state, outcome: "victory" };
    }

    const nextRound = state.currentRound + 1;
    if (nextRound >= state.rounds.length) {
      // All rounds done → victory
      return { state, outcome: "victory" };
    }

    // Move to next round
    const nextRoundData = state.rounds[nextRound];
    return {
      state: {
        ...state,
        currentRound: nextRound,
        currentMCQInRound: 0,
        phase: nextRoundData.mcqIndices.length > 0 ? "boss_attack" : "player_attack",
      },
      outcome: "continue",
    };
  }

  return { state, outcome: "continue" };
}

/**
 * Calculate final XP earned from a stage battle.
 */
export function calculateQuestXP(state: BattleState): number {
  const mcqBonus = state.results.mcqCorrect * 5;
  const pronBonus = Math.round(state.results.avgPronunciationScore / 10) * state.totalRecordings;
  const stageBonus = state.stage.stage * 10; // harder stages give more base XP
  return mcqBonus + pronBonus + stageBonus;
}

/**
 * Get list of unlocked characters based on cleared stages.
 */
export function getUnlockedCharacters(clearedStages: StageNumber[]): string[] {
  const characters = ["Son Wukong"]; // always unlocked
  const stageConfigs = Object.values(
    // inline import avoidance
    { 2: { unlocksCharacter: "Sam Jang" }, 3: { unlocksCharacter: "Sha Wujing" }, 6: { unlocksCharacter: "Zhu Baijie" } }
  );

  for (const stage of clearedStages) {
    if (stage === 2) characters.push("Sam Jang");
    if (stage === 3) characters.push("Sha Wujing");
    if (stage === 6) characters.push("Zhu Baijie");
  }

  return [...new Set(characters)];
}
```

**Step 2: Write tests**

Create: `src/lib/quest/__tests__/battle-logic.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  generateBattleRounds,
  createBattleState,
  calculateBossDamage,
  processMCQAnswer,
  processRecordingComplete,
  advanceBattle,
  calculateQuestXP,
  getUnlockedCharacters,
} from "../battle-logic";

describe("generateBattleRounds", () => {
  it("generates correct rounds for stage 1 (1 recording, 5 MCQ)", () => {
    const rounds = generateBattleRounds(1);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].mcqIndices).toHaveLength(5);
    expect(rounds[0].recordingGroupIndex).toBe(0);
  });

  it("distributes MCQ evenly across recording groups for stage 2", () => {
    const rounds = generateBattleRounds(2);
    expect(rounds).toHaveLength(4); // 4 recording groups
    // 10 MCQ distributed across 4 rounds = 3,3,3,1
    const totalMCQ = rounds.reduce((sum, r) => sum + r.mcqIndices.length, 0);
    expect(totalMCQ).toBe(10);
  });
});

describe("createBattleState", () => {
  it("initializes with correct HP for stage 1", () => {
    const state = createBattleState(1, false);
    expect(state.playerHP).toBe(5);
    expect(state.bossHP).toBe(100);
    expect(state.isRetry).toBe(false);
  });

  it("marks retry flag", () => {
    const state = createBattleState(1, true);
    expect(state.isRetry).toBe(true);
  });
});

describe("processMCQAnswer", () => {
  it("does not reduce HP on correct answer", () => {
    const state = createBattleState(1, false);
    const result = processMCQAnswer(state, true);
    expect(result.playerHP).toBe(5);
    expect(result.results.mcqCorrect).toBe(1);
  });

  it("reduces HP by 1 on wrong answer", () => {
    const state = createBattleState(1, false);
    const result = processMCQAnswer(state, false);
    expect(result.playerHP).toBe(4);
    expect(result.results.mcqCorrect).toBe(0);
  });
});

describe("calculateBossDamage", () => {
  it("divides boss HP evenly across recordings", () => {
    expect(calculateBossDamage(100, 4)).toBe(25);
    expect(calculateBossDamage(100, 3)).toBe(34); // ceil
    expect(calculateBossDamage(100, 1)).toBe(100);
  });
});

describe("getUnlockedCharacters", () => {
  it("always includes Son Wukong", () => {
    expect(getUnlockedCharacters([])).toEqual(["Son Wukong"]);
  });

  it("unlocks Sam Jang after stage 2", () => {
    expect(getUnlockedCharacters([1, 2])).toContain("Sam Jang");
  });

  it("unlocks all characters after stage 6", () => {
    const chars = getUnlockedCharacters([1, 2, 3, 4, 5, 6]);
    expect(chars).toContain("Sam Jang");
    expect(chars).toContain("Sha Wujing");
    expect(chars).toContain("Zhu Baijie");
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/lib/quest/__tests__/battle-logic.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/quest/battle-logic.ts src/lib/quest/__tests__/battle-logic.test.ts
git commit -m "feat(quest): add battle logic utilities with tests"
```

---

## Task 6: Database Migration — quest_progress Table

**Files:**
- Apply via Supabase MCP `apply_migration`

**Step 1: Apply the migration**

Use Supabase MCP `apply_migration` with name `create_quest_progress` and the following SQL:

```sql
-- Quest progress tracking per user per stage
CREATE TABLE quest_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 7),
  is_cleared BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0,
  best_score REAL NOT NULL DEFAULT 0,
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, stage)
);

-- RLS policies
ALTER TABLE quest_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quest progress"
  ON quest_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quest progress"
  ON quest_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quest progress"
  ON quest_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_quest_progress_user ON quest_progress(user_id);
```

**Step 2: Verify migration applied**

Use Supabase MCP `list_migrations` to confirm the migration appears.

**Step 3: Verify table structure**

Use Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'quest_progress'
ORDER BY ordinal_position;
```

**Step 4: Commit note** (migration is remote-only, no local file to commit)

---

## Task 7: Quest Progress API

**Files:**
- Create: `src/app/api/quest/progress/route.ts`

**Step 1: Write the API route**

```typescript
// src/app/api/quest/progress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { StageNumber } from "@/lib/quest/types";

/** GET: Fetch all quest progress for the authenticated user */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("quest_progress")
    .select("*")
    .eq("user_id", user.id)
    .order("stage", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ progress: data });
}

/** POST: Save/update quest progress for a stage */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { stage, is_cleared, score } = body as {
    stage: StageNumber;
    is_cleared: boolean;
    score: number;
  };

  if (!stage || stage < 1 || stage > 7) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  // Upsert: increment attempts, update best_score and is_cleared
  const { data: existing } = await supabase
    .from("quest_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("stage", stage)
    .single();

  if (existing) {
    const updates: Record<string, unknown> = {
      attempts: existing.attempts + 1,
      updated_at: new Date().toISOString(),
    };
    if (score > existing.best_score) {
      updates.best_score = score;
    }
    if (is_cleared && !existing.is_cleared) {
      updates.is_cleared = true;
      updates.cleared_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("quest_progress")
      .update(updates)
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("quest_progress").insert({
      user_id: user.id,
      stage,
      is_cleared,
      attempts: 1,
      best_score: score,
      cleared_at: is_cleared ? new Date().toISOString() : null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/quest/progress/route.ts
git commit -m "feat(quest): add quest progress API endpoint (GET + POST)"
```

---

## Task 8: Create Route Structure + Loading Skeleton

**Files:**
- Create: `src/app/(main)/main-quest/page.tsx`
- Create: `src/app/(main)/main-quest/loading.tsx`

**Step 1: Write loading skeleton**

```typescript
// src/app/(main)/main-quest/loading.tsx
export default function MainQuestLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 w-48 bg-muted rounded" />
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded pixel-border" />
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Write server page**

```typescript
// src/app/(main)/main-quest/page.tsx
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";
import type { StageNumber } from "@/lib/quest/types";
import { getUnlockedCharacters } from "@/lib/quest/battle-logic";

const MainQuestClient = dynamic(
  () => import("./main-quest-client").then((m) => m.MainQuestClient),
  {
    loading: () => (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-48 bg-muted rounded" />
        <div className="h-64 bg-muted rounded pixel-border" />
      </div>
    ),
  }
);

export default async function MainQuestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user!.id;

  const { data: questProgress } = await supabase
    .from("quest_progress")
    .select("*")
    .eq("user_id", userId)
    .order("stage", { ascending: true });

  const clearedStages = (questProgress ?? [])
    .filter((p: { is_cleared: boolean }) => p.is_cleared)
    .map((p: { stage: number }) => p.stage as StageNumber);

  const unlockedCharacters = getUnlockedCharacters(clearedStages);

  return (
    <MainQuestClient
      questProgress={questProgress ?? []}
      unlockedCharacters={unlockedCharacters}
    />
  );
}
```

**Step 3: Commit**

```bash
git add src/app/(main)/main-quest/page.tsx src/app/(main)/main-quest/loading.tsx
git commit -m "feat(quest): add main-quest route with server page and loading skeleton"
```

---

## Task 9: Update Dashboard — Main Quest Button

**Files:**
- Modify: `src/app/(main)/dashboard/dashboard-client.tsx`

**Step 1: Replace the "Coming Soon" Main Quest card with a working link**

Change the disabled Main Quest card (lines ~235-249) from a `<div>` with `opacity-50 cursor-not-allowed` to a `<Link>` to `/main-quest`:

```tsx
{/* Main Quest — active link */}
<Link href="/main-quest" className="group block">
  <div className="pixel-border chinese-corner bg-card px-5 py-3 hover:pixel-border-primary transition-all">
    <div className="flex items-center gap-5">
      <Swords className="h-8 w-8 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-pixel text-sm text-foreground leading-relaxed">
          Main Quest
        </p>
        <p className="text-base text-muted-foreground">
          Journey to the West — Story Campaign
        </p>
      </div>
      <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  </div>
</Link>
```

Also add the `Link` import if not already present (it is already imported).

**Step 2: Verify the dashboard renders**

Run: `npm run dev` and navigate to `/dashboard`
Expected: Main Quest card is now clickable and links to `/main-quest`

**Step 3: Commit**

```bash
git add src/app/(main)/dashboard/dashboard-client.tsx
git commit -m "feat(quest): activate Main Quest button on dashboard"
```

---

## Task 10: Main Quest Client — State Machine Shell

**Files:**
- Create: `src/app/(main)/main-quest/main-quest-client.tsx`

**Step 1: Write the state machine client component**

This is the orchestrator. It manages screen transitions and holds global quest state:

```typescript
// src/app/(main)/main-quest/main-quest-client.tsx
"use client";

import { useState, useCallback } from "react";
import type {
  QuestScreen,
  StageNumber,
  BattleState,
  QuestProgress,
} from "@/lib/quest/types";
import { createBattleState } from "@/lib/quest/battle-logic";
import { IntroScreen } from "@/components/quest/intro-screen";
import { StageSelect } from "@/components/quest/stage-select";
import { StoryScreen } from "@/components/quest/story-screen";
import { BattleScreen } from "@/components/quest/battle-screen";
import { VictoryScreen } from "@/components/quest/victory-screen";
import { DefeatScreen } from "@/components/quest/defeat-screen";

interface MainQuestClientProps {
  questProgress: QuestProgress[];
  unlockedCharacters: string[];
}

export function MainQuestClient({
  questProgress: initialProgress,
  unlockedCharacters: initialCharacters,
}: MainQuestClientProps) {
  const [screen, setScreen] = useState<QuestScreen>("intro");
  const [selectedStage, setSelectedStage] = useState<StageNumber | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [questProgress, setQuestProgress] =
    useState<QuestProgress[]>(initialProgress);
  const [unlockedCharacters, setUnlockedCharacters] =
    useState<string[]>(initialCharacters);

  // Check if this is a retry (stage has been attempted before)
  const getAttempts = useCallback(
    (stage: StageNumber) => {
      const progress = questProgress.find((p) => p.stage === stage);
      return progress?.attempts ?? 0;
    },
    [questProgress]
  );

  const handleIntroComplete = useCallback(() => {
    setScreen("stage_select");
  }, []);

  const handleStageSelect = useCallback(
    (stage: StageNumber) => {
      setSelectedStage(stage);
      setScreen("story");
    },
    []
  );

  const handleStoryComplete = useCallback(() => {
    if (!selectedStage) return;
    const isRetry = getAttempts(selectedStage) > 0;
    const state = createBattleState(selectedStage, isRetry);
    setBattleState(state);
    setScreen("battle");
  }, [selectedStage, getAttempts]);

  const handleBattleVictory = useCallback(
    (finalState: BattleState) => {
      setBattleState(finalState);
      setScreen("victory");
    },
    []
  );

  const handleBattleDefeat = useCallback(
    (finalState: BattleState) => {
      setBattleState(finalState);
      setScreen("defeat");
    },
    []
  );

  const handleReturnToStages = useCallback(() => {
    setSelectedStage(null);
    setBattleState(null);
    setScreen("stage_select");
  }, []);

  const handleRetry = useCallback(() => {
    if (!selectedStage) return;
    // Go back to story for the same stage
    setScreen("story");
  }, [selectedStage]);

  const handleProgressUpdate = useCallback(
    (newProgress: QuestProgress[], newCharacters: string[]) => {
      setQuestProgress(newProgress);
      setUnlockedCharacters(newCharacters);
    },
    []
  );

  switch (screen) {
    case "intro":
      return <IntroScreen onComplete={handleIntroComplete} />;

    case "stage_select":
      return (
        <StageSelect
          questProgress={questProgress}
          unlockedCharacters={unlockedCharacters}
          onStageSelect={handleStageSelect}
          onBack={handleIntroComplete}
        />
      );

    case "story":
      return selectedStage ? (
        <StoryScreen
          stage={selectedStage}
          onContinue={handleStoryComplete}
          onBack={handleReturnToStages}
        />
      ) : null;

    case "battle":
      return battleState && selectedStage ? (
        <BattleScreen
          stage={selectedStage}
          initialState={battleState}
          unlockedCharacters={unlockedCharacters}
          onVictory={handleBattleVictory}
          onDefeat={handleBattleDefeat}
        />
      ) : null;

    case "victory":
      return battleState && selectedStage ? (
        <VictoryScreen
          stage={selectedStage}
          battleState={battleState}
          questProgress={questProgress}
          onReturnToStages={handleReturnToStages}
          onProgressUpdate={handleProgressUpdate}
        />
      ) : null;

    case "defeat":
      return battleState && selectedStage ? (
        <DefeatScreen
          stage={selectedStage}
          battleState={battleState}
          onRetry={handleRetry}
          onReturnToStages={handleReturnToStages}
        />
      ) : null;

    default:
      return null;
  }
}
```

**Step 2: Create placeholder sub-components so this compiles**

Create minimal stubs for all 6 imported components (each in `src/components/quest/`). Each stub should export the named component with the correct props interface, rendering a simple placeholder div. These will be fully implemented in subsequent tasks.

Example stub for `intro-screen.tsx`:
```typescript
"use client";

export function IntroScreen({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <button onClick={onComplete} className="pixel-btn bg-primary text-primary-foreground px-8 py-3 font-pixel">
        IntroScreen Placeholder — Click to Continue
      </button>
    </div>
  );
}
```

Create similar stubs for: `stage-select.tsx`, `story-screen.tsx`, `battle-screen.tsx`, `victory-screen.tsx`, `defeat-screen.tsx`.

**Step 3: Verify dev server renders the page**

Run: `npm run dev`, navigate to `/main-quest`
Expected: Sees "IntroScreen Placeholder" button, clicking it transitions to stage select stub

**Step 4: Commit**

```bash
git add src/app/(main)/main-quest/main-quest-client.tsx src/components/quest/
git commit -m "feat(quest): add main quest state machine with placeholder screens"
```

---

## Task 11: Implement Intro Screen

**Files:**
- Modify: `src/components/quest/intro-screen.tsx`

**Step 1: Implement the full-screen story intro**

The intro covers the entire viewport (like the dashboard splash). Shows the quest intro text with a typewriter effect, one paragraph at a time. User presses any key or taps to advance. After all paragraphs, shows "Begin Journey" button.

Key elements:
- Full-screen overlay with `fixed inset-0 z-[9999]` (same pattern as dashboard splash)
- Background image: `/img/main stage/1-1.webp`
- Typewriter text animation using `font-chinese` for body text
- "Press any key to continue" indicator at bottom
- Final paragraph → "Begin Journey" button that calls `onComplete()`
- Use `QUEST_INTRO_TEXT` from `story-text.ts` for the paragraphs

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { QUEST_INTRO_TEXT } from "@/lib/quest/story-text";

interface IntroScreenProps {
  onComplete: () => void;
}

export function IntroScreen({ onComplete }: IntroScreenProps) {
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [showButton, setShowButton] = useState(false);

  const advance = useCallback(() => {
    if (currentParagraph < QUEST_INTRO_TEXT.length - 1) {
      setCurrentParagraph((p) => p + 1);
    } else {
      setShowButton(true);
    }
  }, [currentParagraph]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
      advance();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer"
      onClick={advance}
      style={{
        backgroundImage: 'url("/img/main stage/1-1.webp")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 max-w-2xl px-6 space-y-6">
        {QUEST_INTRO_TEXT.slice(0, currentParagraph + 1).map((text, i) => (
          <p
            key={i}
            className="text-lg text-white/90 leading-relaxed animate-fade-in-up"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            {text}
          </p>
        ))}

        {showButton ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
            className="pixel-btn bg-primary text-primary-foreground px-10 py-3 font-pixel text-sm leading-relaxed mx-auto block animate-fade-in-up"
          >
            Begin Journey 开始旅程
          </button>
        ) : (
          <p className="text-sm text-white/50 font-pixel text-center animate-pixel-pulse">
            Press any key to continue...
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Test visually**

Run: `npm run dev`, navigate to `/main-quest`
Expected: Full-screen intro with dark overlay, text paragraphs appear one by one

**Step 3: Commit**

```bash
git add src/components/quest/intro-screen.tsx
git commit -m "feat(quest): implement full-screen story intro with typewriter progression"
```

---

## Task 12: Implement Stage Select Screen

**Files:**
- Modify: `src/components/quest/stage-select.tsx`

**Step 1: Implement stage selection map**

Shows all 7 stages in a vertical scrollable list. Each stage card shows:
- Stage number + name + Chinese name
- Boss thumbnail + boss name
- Status: locked (grayed), available (glowing border), cleared (checkmark)
- A stage is "available" if its `prerequisiteStage` is cleared (or null for stage 1)

Use the pixel-art card style with `pixel-border`. Locked stages have `opacity-50 cursor-not-allowed`. Available stages pulse with `animate-pixel-pulse` on the border. Cleared stages show a green checkmark badge.

The party section at the top shows unlocked character portraits in a row.

Key imports: `STAGE_CONFIGS` from `stage-config.ts`, `QuestProgress`, `StageNumber` types.

Props:
```typescript
interface StageSelectProps {
  questProgress: QuestProgress[];
  unlockedCharacters: string[];
  onStageSelect: (stage: StageNumber) => void;
  onBack: () => void;
}
```

Component renders:
1. Header: "Journey to the West" title
2. Party portraits row (unlocked characters)
3. Stage list: 7 cards, each showing stage info + boss preview + lock/clear status
4. Tapping an available/cleared stage calls `onStageSelect(stage)`

**Step 2: Test visually**

Expected: Stage 1 is available (glowing), stages 2-7 are locked. Party shows only Son Wukong.

**Step 3: Commit**

```bash
git add src/components/quest/stage-select.tsx
git commit -m "feat(quest): implement stage selection screen with lock/clear states"
```

---

## Task 13: Implement Story Screen

**Files:**
- Modify: `src/components/quest/story-screen.tsx`

**Step 1: Implement pre-battle story narration**

Similar to intro screen but stage-specific. Shows:
- Stage background image
- Stage name + Chinese name as title
- Story intro paragraphs from `STAGE_STORIES[stage].intro`
- Character sprites at bottom (unlocked party members)
- "Enter Battle" button after all paragraphs shown
- "Back" button to return to stage select

Uses the same advance-on-click/keypress pattern as intro screen.

Props:
```typescript
interface StoryScreenProps {
  stage: StageNumber;
  onContinue: () => void;
  onBack: () => void;
}
```

**Step 2: Commit**

```bash
git add src/components/quest/story-screen.tsx
git commit -m "feat(quest): implement pre-battle story narration screen"
```

---

## Task 14: Implement Battle Screen Layout + HUD

**Files:**
- Modify: `src/components/quest/battle-screen.tsx`
- Create: `src/components/quest/battle-hud.tsx`

**Step 1: Write the battle HUD (HP bars, turn indicator)**

`battle-hud.tsx` renders:
- **Player section** (left): Party character portraits + HP hearts
- **Boss section** (right): Boss portrait + HP bar (percentage-based, drains as recordings complete)
- **Turn indicator** (center): "YOUR TURN" or "ENEMY TURN" with appropriate color
- **Round counter**: "Round X/Y"

HP hearts: Render `playerMaxHP` hearts. Filled hearts = current HP (red), empty hearts = lost HP (gray). Use pixel-art heart shapes (can use emoji or SVG).

Boss HP bar: Horizontal bar with percentage fill. Color transitions: green > 50%, yellow 25-50%, red < 25%.

```typescript
interface BattleHUDProps {
  playerHP: number;
  playerMaxHP: number;
  bossHP: number;
  bossMaxHP: number;
  bossName: string;
  bossImage: string;
  phase: "boss_attack" | "player_attack" | "animating";
  currentRound: number;
  totalRounds: number;
  unlockedCharacters: string[];
}
```

**Step 2: Write the battle screen**

`battle-screen.tsx` is the main battle container. It:
- Sets the stage background image (full container)
- Renders `BattleHUD` at the top
- Renders either `PlayerAttack` or `BossAttack` component based on `phase`
- Manages the battle state using `useState` + the battle-logic functions
- Handles phase transitions with animations (screen shake on damage, flash on block)
- Calls `onVictory`/`onDefeat` when battle ends

```typescript
interface BattleScreenProps {
  stage: StageNumber;
  initialState: BattleState;
  unlockedCharacters: string[];
  onVictory: (finalState: BattleState) => void;
  onDefeat: (finalState: BattleState) => void;
}
```

Internal state management:
- `battleState` via `useState(initialState)`
- After each MCQ answer: `processMCQAnswer()` → animation → `advanceBattle()`
- After each recording: `processRecordingComplete()` → animation → `advanceBattle()`
- Check `outcome` from `advanceBattle()` to trigger victory/defeat

**Step 3: Commit**

```bash
git add src/components/quest/battle-screen.tsx src/components/quest/battle-hud.tsx
git commit -m "feat(quest): implement battle screen layout with HUD (HP bars, turns)"
```

---

## Task 15: Implement Player Attack (Recording) Component

**Files:**
- Create: `src/components/quest/player-attack.tsx`

**Step 1: Write the player attack component**

Shows the current recording group's words and the AudioRecorder. Layout:
- "YOUR TURN — Attack!" banner
- Word display grid (for mono/multi) or passage text area (for C4)
- For mono/multi: words in a grid, each word is a button that plays TTS on tap
- For passage: scrollable text area with `font-chinese` styling
- AudioRecorder component at the bottom
- If `isRetry` is true: show "Show Pinyin" toggle button + TTS play buttons on words
- On recording complete: send to `/api/speech/assess` → return score to parent

Reuse the existing `AudioRecorder` from `src/components/practice/audio-recorder.tsx`.

```typescript
interface PlayerAttackProps {
  recordingGroup: RecordingGroup;
  isRetry: boolean;
  onComplete: (pronunciationScore: number) => void;
}
```

Flow:
1. Show words/passage
2. User records via AudioRecorder
3. `onRecordingComplete` callback gets audio Blob
4. POST to `/api/speech/assess` with `{ audio, referenceText, category }`
5. Parse response for overall pronunciation score
6. Call `onComplete(score)` to return to parent

For reference text formatting:
- Monosyllabic: words joined by spaces ("哲 洽 滕 昂 翻 悅 铭 欧 巢 披")
- Multisyllabic: words joined by spaces
- Passage: use `passageText` directly

**Step 2: Commit**

```bash
git add src/components/quest/player-attack.tsx
git commit -m "feat(quest): implement player attack component with recording and assessment"
```

---

## Task 16: Implement Boss Attack (MCQ) Component

**Files:**
- Create: `src/components/quest/boss-attack.tsx`

**Step 1: Write the boss MCQ attack component**

Shows an MCQ question with countdown timer. Layout:
- "ENEMY ATTACK — Defend!" banner with boss portrait
- If `context` exists: show narrative context text in italics
- Question prompt text
- Answer options as large pixel-art buttons (A, B, C, D...)
- Countdown timer bar at top (depletes over `timerSeconds`)
- Highlighted character shown in gold if `highlightedChar` exists

When user selects an answer or timer expires:
- Correct: green flash on selected option, "BLOCKED!" text
- Wrong/timeout: red flash, screen shake, "HIT!" text, then call `onAnswer(false)`
- Brief animation delay (1s) before calling parent callback

```typescript
interface BossAttackProps {
  question: QuestMCQ;
  timerSeconds: number;
  onAnswer: (isCorrect: boolean) => void;
}
```

Timer implementation:
- `useEffect` with `setInterval(1000)` decrementing a countdown state
- When countdown reaches 0: auto-submit as wrong answer
- Timer bar width: `(remaining / total) * 100%`
- Timer bar color: green > 50%, yellow 25-50%, red < 25%

**Step 2: Commit**

```bash
git add src/components/quest/boss-attack.tsx
git commit -m "feat(quest): implement boss attack MCQ component with countdown timer"
```

---

## Task 17: Implement Victory Screen

**Files:**
- Modify: `src/components/quest/victory-screen.tsx`

**Step 1: Write the victory screen**

Shows when boss HP reaches 0. Displays:
- "VICTORY!" title with golden glow animation
- Stage outro text from `STAGE_STORIES[stage].outro` (paragraph by paragraph)
- XP earned calculation (from `calculateQuestXP`)
- Stats: MCQ accuracy, average pronunciation score
- If stage unlocks a character: show character unlock cutscene (portrait reveal + "X has joined your party!")
- "Continue" button → saves progress via POST `/api/quest/progress` → returns to stage select

```typescript
interface VictoryScreenProps {
  stage: StageNumber;
  battleState: BattleState;
  questProgress: QuestProgress[];
  onReturnToStages: () => void;
  onProgressUpdate: (progress: QuestProgress[], characters: string[]) => void;
}
```

On mount:
1. POST to `/api/quest/progress` with `{ stage, is_cleared: true, score }`
2. If stage unlocks a character, show the unlock animation
3. Update parent state via `onProgressUpdate` with refreshed progress

Character unlock sequence:
- Dark overlay with spotlight
- Character portrait fades in with `animate-fade-in-up`
- Text: "{Character Name} has joined your party!" in gold pixel font
- Sparkle particle effects (CSS keyframe animation)

**Step 2: Commit**

```bash
git add src/components/quest/victory-screen.tsx
git commit -m "feat(quest): implement victory screen with XP, stats, and character unlock"
```

---

## Task 18: Implement Defeat Screen

**Files:**
- Modify: `src/components/quest/defeat-screen.tsx`

**Step 1: Write the defeat screen**

Shows when player HP reaches 0. Displays:
- "DEFEATED" title in red
- Boss quote/taunt (from story context)
- Stats: how many MCQ answered, accuracy
- "Retry" button → goes back to story screen for the same stage (increments attempts, enabling hints)
- "Return to Stage Select" button
- Note: "Hint: On your next attempt, you can use pinyin and audio hints!"

```typescript
interface DefeatScreenProps {
  stage: StageNumber;
  battleState: BattleState;
  onRetry: () => void;
  onReturnToStages: () => void;
}
```

On mount: POST to `/api/quest/progress` with `{ stage, is_cleared: false, score: 0 }` to increment attempts.

**Step 2: Commit**

```bash
git add src/components/quest/defeat-screen.tsx
git commit -m "feat(quest): implement defeat screen with retry and hint messaging"
```

---

## Task 19: End-to-End Verification

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run tests**

Run: `npx vitest run src/lib/quest/`
Expected: All battle logic tests pass

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Manual E2E test flow**

1. Navigate to `/dashboard` → click "Main Quest"
2. See intro screen → advance through paragraphs → "Begin Journey"
3. See stage select → Stage 1 available, others locked → click Stage 1
4. See story screen → advance paragraphs → "Enter Battle"
5. Battle: Boss attacks with MCQ → answer correctly/incorrectly → HP changes
6. Player attacks: record pronunciation → score shown → boss HP decreases
7. Complete all recordings → Victory screen with XP + stats
8. Return to stages → Stage 1 cleared, Stage 2 available
9. Attempt Stage 2 → fail intentionally → Defeat screen → Retry → hints enabled
10. Retry Stage 2 → pinyin/audio hints visible → clear it → Sam Jang unlocked

**Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(quest): complete main quest RPG mode with 7 stages"
```

---

## Task 20: Security Advisors Check

**Step 1: Run Supabase security advisors**

Use Supabase MCP `get_advisors` with type `security` to check for any RLS or security issues with the new `quest_progress` table.

**Step 2: Fix any issues flagged**

Apply any recommended migration fixes.

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| Foundation | 1-5 | Types, configs, questions, story, battle logic |
| Database | 6-7 | quest_progress table + API |
| Routing | 8-9 | Route structure, dashboard button |
| State Machine | 10-11 | Client orchestrator, intro screen |
| Stage Flow | 12-13 | Stage select, story narration |
| Battle Core | 14-16 | HUD, recording attack, MCQ defense |
| Results | 17-18 | Victory + unlock, defeat + retry |
| Verification | 19-20 | E2E test, security check |

**Total new files:** ~15 TypeScript files
**Total estimated lines:** ~3,000
**Dependencies:** None new (uses existing AudioRecorder, iFlytek, shadcn/ui)
