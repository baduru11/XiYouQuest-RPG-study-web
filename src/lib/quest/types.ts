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
  /** Split recording groups (max 5 words each, passages unchanged) */
  recordingGroups: RecordingGroup[];
  /** Current round index */
  currentRound: number;
  /** Current phase within the round */
  phase: "player_menu" | "player_attack" | "boss_attack" | "animating";
  /** Current MCQ index within the round's mcqIndices */
  currentMCQInRound: number;
  /** Player current HP */
  playerHP: number;
  /** Player max HP (base 3 + 2 per companion) */
  playerMaxHP: number;
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
