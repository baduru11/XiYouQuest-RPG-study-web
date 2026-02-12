import { MONO_PINYIN, MULTI_PINYIN } from "./voice/pinyin-data";

// Tone-mark vowel lookup: vowel → [tone1, tone2, tone3, tone4]
const TONE_MARKS: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  v: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

/**
 * Convert a single tone-number pinyin syllable to tone-mark form.
 * e.g. "zhe2" → "zhé", "guo2" → "guó", "lv3" → "lǚ", "r5" → "er"
 */
function syllableToToneMark(s: string): string {
  if (s === "r5" || s === "r") return "er";

  const match = s.match(/^([a-zv]+)([1-5])$/);
  if (!match) return s;

  const [, base, toneStr] = match;
  const tone = parseInt(toneStr);

  if (tone === 5) return base.replace(/v/g, "ü");

  // Tone placement: 'a'/'e' always gets it, then 'ou' → 'o', else last vowel
  let target = -1;
  for (let i = 0; i < base.length; i++) {
    if (base[i] === "a" || base[i] === "e") {
      target = i;
      break;
    }
  }
  if (target === -1) {
    const ouIdx = base.indexOf("ou");
    if (ouIdx !== -1) {
      target = ouIdx;
    } else {
      for (let i = base.length - 1; i >= 0; i--) {
        if ("aiouev".includes(base[i])) {
          target = i;
          break;
        }
      }
    }
  }

  if (target === -1) return base.replace(/v/g, "ü");

  const vowel = base[target];
  const marked = TONE_MARKS[vowel]?.[tone - 1];
  if (!marked) return base.replace(/v/g, "ü");

  return (
    base.substring(0, target).replace(/v/g, "ü") +
    marked +
    base.substring(target + 1).replace(/v/g, "ü")
  );
}

/**
 * Look up a word and return human-readable tone-marked pinyin.
 * Multi-char words use space-separated syllables: "guó wáng"
 * Single chars return a single syllable: "bā"
 * Returns null if the word is not in our pinyin data.
 */
export function lookupPinyinDisplay(word: string): string | null {
  const raw = MULTI_PINYIN[word] ?? (word.length === 1 ? MONO_PINYIN[word] : null);
  if (!raw) return null;
  return raw.split(" ").map(syllableToToneMark).join(" ");
}
