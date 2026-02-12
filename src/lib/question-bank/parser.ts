import fs from "fs";
import path from "path";

export interface ParsedQuestion {
  component: 1 | 2 | 3 | 4 | 5;
  setNumber: number;
  content: string;
  pinyin: string | null;
}

export function parseMonosyllabicFile(filePath: string): ParsedQuestion[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
  const questions: ParsedQuestion[] = [];

  let setNumber = 1;
  for (const line of lines) {
    const chars = line.trim().split(/\s+/);
    for (const char of chars) {
      if (char.length === 0) continue;
      questions.push({
        component: 1,
        setNumber,
        content: char,
        pinyin: null,
      });
    }
    if (questions.filter((q) => q.setNumber === setNumber).length >= 100) {
      setNumber++;
    }
  }

  return questions;
}

export function parseMultisyllabicFile(filePath: string): ParsedQuestion[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
  const questions: ParsedQuestion[] = [];

  let setNumber = 1;
  let countInSet = 0;

  for (const line of lines) {
    const words = line.trim().split(/\s+/);
    for (const word of words) {
      if (word.length === 0) continue;
      questions.push({
        component: 2,
        setNumber,
        content: word,
        pinyin: null,
      });
      countInSet++;
      if (countInSet >= 50) {
        setNumber++;
        countInSet = 0;
      }
    }
  }

  return questions;
}

export function loadAllQuestions(dataDir: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  const monoPath = path.join(dataDir, "monosyllabic.md");
  if (fs.existsSync(monoPath)) {
    questions.push(...parseMonosyllabicFile(monoPath));
  }

  const multiPath = path.join(dataDir, "multisyllabic.md");
  if (fs.existsSync(multiPath)) {
    questions.push(...parseMultisyllabicFile(multiPath));
  }

  return questions;
}
