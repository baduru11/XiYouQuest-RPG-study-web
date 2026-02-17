import { describe, it, expect } from "vitest";
import { calculateXP, getUserLevel, getAffectionLevel } from "../xp";

describe("calculateXP", () => {
  it("gives 10 XP for perfect pronunciation (90+)", () => {
    const result = calculateXP({ pronunciationScore: 95, isCorrect: true, currentStreak: 0 });
    expect(result.baseXP).toBe(10);
    expect(result.multiplier).toBe(1);
    expect(result.totalXP).toBe(10);
  });

  it("gives 5 XP for good pronunciation (60-89)", () => {
    const result = calculateXP({ pronunciationScore: 75, isCorrect: true, currentStreak: 0 });
    expect(result.baseXP).toBe(5);
    expect(result.totalXP).toBe(5);
  });

  it("gives 2 XP for attempted pronunciation (<60)", () => {
    const result = calculateXP({ pronunciationScore: 40, isCorrect: false, currentStreak: 0 });
    expect(result.baseXP).toBe(2);
    expect(result.totalXP).toBe(2);
  });

  it("gives perfect XP for correct quiz answers (no pronunciation score)", () => {
    const result = calculateXP({ isCorrect: true, currentStreak: 0 });
    expect(result.baseXP).toBe(10);
  });

  it("gives attempted XP for incorrect quiz answers", () => {
    const result = calculateXP({ isCorrect: false, currentStreak: 0 });
    expect(result.baseXP).toBe(2);
  });

  it("applies 1.5x streak multiplier at 5-streak", () => {
    const result = calculateXP({ pronunciationScore: 95, isCorrect: true, currentStreak: 5 });
    expect(result.multiplier).toBe(1.5);
    expect(result.totalXP).toBe(15); // 10 * 1.5
  });

  it("applies 2x streak multiplier at 10-streak", () => {
    const result = calculateXP({ pronunciationScore: 95, isCorrect: true, currentStreak: 10 });
    expect(result.multiplier).toBe(2.0);
    expect(result.totalXP).toBe(20); // 10 * 2
  });

  it("applies highest applicable streak multiplier at 15-streak", () => {
    const result = calculateXP({ pronunciationScore: 95, isCorrect: true, currentStreak: 15 });
    expect(result.multiplier).toBe(2.0);
    expect(result.totalXP).toBe(20);
  });

  it("floors total XP", () => {
    // 5 XP * 1.5 multiplier = 7.5 -> 7
    const result = calculateXP({ pronunciationScore: 75, isCorrect: true, currentStreak: 5 });
    expect(result.totalXP).toBe(7);
  });
});

describe("getUserLevel", () => {
  it("returns Beginner for 0 XP", () => {
    const result = getUserLevel(0);
    expect(result.level).toBe(1);
    expect(result.name).toBe("Beginner");
  });

  it("returns correct level for mid-range XP", () => {
    const result = getUserLevel(600);
    expect(result.level).toBe(4);
    expect(result.name).toBe("Practitioner");
  });

  it("returns PSC God for 10000+ XP", () => {
    const result = getUserLevel(10000);
    expect(result.level).toBe(10);
    expect(result.name).toBe("PSC God");
    expect(result.xpToNext).toBeNull();
  });

  it("calculates xpToNext correctly", () => {
    const result = getUserLevel(50);
    expect(result.level).toBe(1);
    expect(result.xpToNext).toBe(50); // 100 - 50
  });
});

describe("getAffectionLevel", () => {
  it("returns Acquaintance for 0 XP", () => {
    const result = getAffectionLevel(0);
    expect(result.level).toBe(1);
    expect(result.name).toBe("Acquaintance");
  });

  it("returns Soulmate for 2000+ XP", () => {
    const result = getAffectionLevel(2000);
    expect(result.level).toBe(5);
    expect(result.name).toBe("Soulmate");
    expect(result.xpToNext).toBeNull();
  });

  it("returns Friend for 200 XP", () => {
    const result = getAffectionLevel(200);
    expect(result.level).toBe(2);
    expect(result.name).toBe("Friend");
  });
});
