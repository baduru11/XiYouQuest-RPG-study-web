export type PracticeMode = "study" | "practice" | "mock-exam";

export type ComponentNumber = 1 | 2 | 3 | 4 | 5;

export interface PronunciationResult {
  text: string;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  words: WordResult[];
}

export interface WordResult {
  word: string;
  accuracyScore: number;
  errorType: "None" | "Omission" | "Insertion" | "Mispronunciation";
}

export interface QuizQuestion {
  id: string;
  type: "word-choice" | "measure-word" | "sentence-order";
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface PracticeState {
  mode: PracticeMode;
  component: ComponentNumber;
  currentQuestionIndex: number;
  totalQuestions: number;
  score: number;
  streak: number;
  results: QuestionResult[];
  isComplete: boolean;
  startedAt: number;
}

export interface QuestionResult {
  questionText: string;
  userAnswer: string | null;
  isCorrect: boolean;
  pronunciationScore: number | null;
  feedback: string;
  xpEarned: number;
}
