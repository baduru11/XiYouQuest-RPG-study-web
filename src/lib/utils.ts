import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Fisher-Yates shuffle — returns a new shuffled copy of the array */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Format a date string as a relative time (e.g. "2h ago", "3d ago") */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Randomize answer positions in a quiz question */
export function randomizeAnswerPositions<T extends { options: string[]; correctIndex: number }>(question: T): T {
  const indices = question.options.map((_, i) => i);
  const shuffledIndices = shuffle(indices);
  const shuffledOptions = shuffledIndices.map(i => question.options[i]);
  const newCorrectIndex = shuffledIndices.indexOf(question.correctIndex);

  return {
    ...question,
    options: shuffledOptions,
    correctIndex: newCorrectIndex,
  };
}
