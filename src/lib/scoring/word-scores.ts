/**
 * Match ISE word-level scores back to reference items.
 * Handles exact matches, character-level aggregation for multi-char words,
 * and returns null for unmatched items.
 *
 * Ported from exam-runner.tsx — used by both mock exam and learning path assessment.
 */
export function matchWordScores(
  items: string[],
  words: Array<{ word: string; accuracyScore: number; errorType: string }>
): { word: string; score: number | null }[] {
  const filteredWords = words.filter(
    (w) => w.errorType !== "Insertion" && w.errorType !== "Omission"
  );
  const usedIndices = new Set<number>();
  let searchFrom = 0;

  return items.map((word) => {
    // Strategy 1: exact match (forward search)
    let idx = -1;
    for (let i = searchFrom; i < filteredWords.length; i++) {
      if (filteredWords[i].word === word && !usedIndices.has(i)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      idx = filteredWords.findIndex(
        (w, i) => w.word === word && !usedIndices.has(i)
      );
    }
    if (idx >= 0) {
      usedIndices.add(idx);
      searchFrom = idx + 1;
      return { word, score: filteredWords[idx]?.accuracyScore ?? null };
    }

    // Strategy 2: character-level aggregation for multi-char words
    if (word.length > 1 && filteredWords.length > 0) {
      const charScores: number[] = [];
      let charSearchFrom = searchFrom;
      for (const char of word) {
        let charIdx = -1;
        for (let i = charSearchFrom; i < filteredWords.length; i++) {
          if (filteredWords[i].word === char && !usedIndices.has(i)) {
            charIdx = i;
            break;
          }
        }
        if (charIdx >= 0) {
          usedIndices.add(charIdx);
          charSearchFrom = charIdx + 1;
          charScores.push(filteredWords[charIdx].accuracyScore ?? 0);
        }
      }
      if (charScores.length > 0) {
        searchFrom = charSearchFrom;
        return {
          word,
          score: Math.round(charScores.reduce((a, b) => a + b, 0) / charScores.length),
        };
      }
    }

    return { word, score: null };
  });
}
