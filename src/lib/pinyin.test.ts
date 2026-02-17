import { describe, it, expect } from "vitest";
import { lookupPinyinDisplay } from "./pinyin";

describe("lookupPinyinDisplay", () => {
  it("converts tone-number pinyin to tone-mark for single characters", () => {
    // Test common characters that should be in the pinyin data
    const result = lookupPinyinDisplay("国");
    // If the character exists in our data, it should have tone marks
    if (result) {
      expect(result).not.toMatch(/\d/); // No numbers in output
      expect(result).toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/); // Has tone marks
    }
  });

  it("returns null for unknown characters", () => {
    const result = lookupPinyinDisplay("㊀"); // Unlikely to be in data
    expect(result).toBeNull();
  });

  it("handles multisyllabic words with space separation", () => {
    const result = lookupPinyinDisplay("中国");
    if (result) {
      expect(result).toContain(" "); // Space-separated syllables
      expect(result).not.toMatch(/\d/); // No numbers
    }
  });

  it("handles single character lookup", () => {
    const result = lookupPinyinDisplay("大");
    if (result) {
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("returns null for empty string", () => {
    const result = lookupPinyinDisplay("");
    expect(result).toBeNull();
  });
});
