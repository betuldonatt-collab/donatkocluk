import { describe, expect, it } from "vitest";

import {
  checkVocabAnswer,
  fillUnitStats,
  levenshteinDistance,
  pastelGreenForProgress,
  pastelGreenForStreakDot,
  pastelGreenStepForProgress,
  selectQuizBatch,
  vocabUnitTitle,
  WORD_MASTERY_STREAK,
  type WordProgressSummary,
} from "./lgs-vocab";

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("apple", "apple")).toBe(0);
  });

  it("counts a single substitution as distance 1", () => {
    expect(levenshteinDistance("apple", "appla")).toBe(1);
  });

  it("counts a single missing letter as distance 1", () => {
    expect(levenshteinDistance("apartment", "aparment")).toBe(1);
  });

  it("counts a single extra letter as distance 1", () => {
    expect(levenshteinDistance("beach", "beachh")).toBe(1);
  });

  it("grows with unrelated words", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });
});

describe("checkVocabAnswer", () => {
  it("EXACT_MATCH regardless of case, either direction", () => {
    expect(checkVocabAnswer("Apple", "apple", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("elma", "Elma", "en_to_tr")).toBe("EXACT_MATCH");
  });

  it("trims surrounding whitespace before comparing", () => {
    expect(checkVocabAnswer("  apple  ", "apple", "tr_to_en")).toBe("EXACT_MATCH");
  });

  it("ACCEPTED_TYPO at edit distance 1 for an English answer over 4 letters", () => {
    expect(checkVocabAnswer("aparment", "apartment", "tr_to_en")).toBe("ACCEPTED_TYPO");
    expect(checkVocabAnswer("beachh", "beach", "tr_to_en")).toBe("ACCEPTED_TYPO");
  });

  it("does not forgive a typo for a short (<=4 letter) English word", () => {
    // "over" (4 letters) mistyped as "oven" -- distance 1, but too short to forgive.
    expect(checkVocabAnswer("oven", "over", "tr_to_en")).toBe("INCORRECT");
  });

  it("does not forgive a typo at distance 2 or more", () => {
    expect(checkVocabAnswer("aprtmnt", "apartment", "tr_to_en")).toBe("INCORRECT");
  });

  it("never forgives a typo on the Turkish (en_to_tr) side, even over 4 letters", () => {
    expect(checkVocabAnswer("elmaa", "elma", "en_to_tr")).toBe("INCORRECT");
  });

  it("lowercases an English answer with the English locale, not Turkish (a mobile keyboard's auto-capitalized 'I' must stay 'i', not become dotless 'ı')", () => {
    expect(checkVocabAnswer("Item", "item", "tr_to_en")).toBe("EXACT_MATCH");
  });

  it("lowercases a Turkish answer with the Turkish locale (dotted/dotless İ-I)", () => {
    expect(checkVocabAnswer("İSTANBUL", "istanbul", "en_to_tr")).toBe("EXACT_MATCH");
  });

  it("accepts any one of several slash-separated meanings", () => {
    expect(checkVocabAnswer("çekici", "çekici/büyüleyici", "en_to_tr")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("büyüleyici", "çekici/büyüleyici", "en_to_tr")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("ilginç", "çekici/büyüleyici", "en_to_tr")).toBe("INCORRECT");
  });

  it("ignores surrounding whitespace around each slash-separated meaning", () => {
    expect(checkVocabAnswer("büyüleyici", "çekici / büyüleyici", "en_to_tr")).toBe("EXACT_MATCH");
  });

  it("tolerates a typo inside one of several slash-separated English meanings", () => {
    expect(checkVocabAnswer("atractive", "attractive/charming", "tr_to_en")).toBe("ACCEPTED_TYPO");
  });

  it("ignores hyphens the student omits, either direction", () => {
    expect(checkVocabAnswer("wellknown", "well-known", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("xray", "x-ray", "tr_to_en")).toBe("EXACT_MATCH");
  });

  it("ignores hyphens even when the student types one the answer doesn't have", () => {
    expect(checkVocabAnswer("well-known", "wellknown", "tr_to_en")).toBe("EXACT_MATCH");
  });
});

describe("selectQuizBatch", () => {
  const words = [
    { id: "w1", english_word: "apple", turkish_meaning: "elma" },
    { id: "w2", english_word: "book", turkish_meaning: "kitap" },
    { id: "w3", english_word: "cat", turkish_meaning: "kedi" },
    { id: "w4", english_word: "dog", turkish_meaning: "köpek" },
  ];

  it("drops mastered words entirely", () => {
    const progress = new Map<string, WordProgressSummary>([
      ["w1", { correct_streak: 3, is_mastered: true, last_tested_at: null }],
    ]);
    const batch = selectQuizBatch(words, progress, 10);
    expect(batch.map((w) => w.id)).not.toContain("w1");
    expect(batch).toHaveLength(3);
  });

  it("orders lowest correct_streak first", () => {
    const progress = new Map<string, WordProgressSummary>([
      ["w1", { correct_streak: 2, is_mastered: false, last_tested_at: null }],
      ["w2", { correct_streak: 0, is_mastered: false, last_tested_at: null }],
      ["w3", { correct_streak: 1, is_mastered: false, last_tested_at: null }],
    ]);
    const batch = selectQuizBatch(words, progress, 10);
    expect(batch.map((w) => w.id)).toEqual(["w2", "w4", "w3", "w1"]); // w4 has no row -> streak 0, ties with w2 but tested "never" (epoch, first)
  });

  it("within a tied streak, orders never-tested / oldest last_tested_at first", () => {
    const progress = new Map<string, WordProgressSummary>([
      ["w1", { correct_streak: 0, is_mastered: false, last_tested_at: "2026-01-01T00:00:00Z" }],
      ["w2", { correct_streak: 0, is_mastered: false, last_tested_at: "2025-01-01T00:00:00Z" }],
      // w3, w4 have no progress row at all -- treated as "never tested" (oldest).
    ]);
    const batch = selectQuizBatch(words, progress, 10);
    expect(batch.map((w) => w.id)).toEqual(["w3", "w4", "w2", "w1"]);
  });

  it("caps the batch at `limit`", () => {
    const batch = selectQuizBatch(words, new Map(), 2);
    expect(batch).toHaveLength(2);
  });

  it("returns the display fields plus correctStreak, not the rest of the progress row", () => {
    const [first] = selectQuizBatch(words, new Map(), 1);
    expect(first).toEqual({ id: "w1", english_word: "apple", turkish_meaning: "elma", correctStreak: 0 });
  });

  it("carries each word's own correct_streak through for the per-word dot indicator", () => {
    const progress = new Map<string, WordProgressSummary>([
      ["w2", { correct_streak: 2, is_mastered: false, last_tested_at: null }],
    ]);
    const batch = selectQuizBatch(words, progress, 10);
    expect(batch.find((w) => w.id === "w2")?.correctStreak).toBe(2);
    expect(batch.find((w) => w.id === "w3")?.correctStreak).toBe(0); // no progress row -> 0
  });
});

describe("fillUnitStats", () => {
  it("always returns all 10 units in order, even with no rows", () => {
    const stats = fillUnitStats([]);
    expect(stats).toHaveLength(10);
    expect(stats.map((s) => s.unitNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stats.every((s) => s.total === 0 && s.mastered === 0)).toBe(true);
  });

  it("fills in only the units a row was given for, leaving the rest at 0/0", () => {
    const stats = fillUnitStats([
      { unitNumber: 1, total: 2, mastered: 1 },
      { unitNumber: 2, total: 1, mastered: 0 },
    ]);
    expect(stats[0]).toEqual({ unitNumber: 1, total: 2, mastered: 1 });
    expect(stats[1]).toEqual({ unitNumber: 2, total: 1, mastered: 0 });
    expect(stats[2]).toEqual({ unitNumber: 3, total: 0, mastered: 0 });
  });

  it("ignores a row for a unit number outside 1-10 instead of crashing", () => {
    const stats = fillUnitStats([{ unitNumber: 11, total: 5, mastered: 5 }]);
    expect(stats).toHaveLength(10);
  });
});

describe("vocabUnitTitle", () => {
  it("maps each of the 10 units to its official LGS İngilizce title", () => {
    expect(vocabUnitTitle(1)).toBe("1. Ünite: Friendship");
    expect(vocabUnitTitle(5)).toBe("5. Ünite: The Internet");
    expect(vocabUnitTitle(10)).toBe("10. Ünite: Natural Forces");
  });

  it("falls back to a bare 'N. Ünite' for an out-of-range number instead of crashing", () => {
    expect(vocabUnitTitle(11)).toBe("11. Ünite");
    expect(vocabUnitTitle(0)).toBe("0. Ünite");
  });
});

describe("pastelGreenStepForProgress", () => {
  it("buckets 0-100% into 5 steps of 20 points each", () => {
    expect(pastelGreenStepForProgress(0)).toBe(0);
    expect(pastelGreenStepForProgress(19)).toBe(0);
    expect(pastelGreenStepForProgress(20)).toBe(1);
    expect(pastelGreenStepForProgress(39)).toBe(1);
    expect(pastelGreenStepForProgress(40)).toBe(2);
    expect(pastelGreenStepForProgress(59)).toBe(2);
    expect(pastelGreenStepForProgress(60)).toBe(3);
    expect(pastelGreenStepForProgress(79)).toBe(3);
    expect(pastelGreenStepForProgress(80)).toBe(4);
    expect(pastelGreenStepForProgress(100)).toBe(4);
  });

  it("clamps out-of-range input instead of indexing past the step table", () => {
    expect(pastelGreenStepForProgress(-10)).toBe(0);
    expect(pastelGreenStepForProgress(150)).toBe(4);
  });
});

describe("pastelGreenForProgress", () => {
  it("darkens (lightness decreases) as progress climbs, step by step", () => {
    // hsl(142 <saturation>% <lightness>% / <alpha>) -- the lightness is the
    // percentage immediately before " / <alpha>)".
    const lightnessOf = (color: string) => Number(color.match(/(\d+)%\s*\/\s*[\d.]+\)$/)?.[1]);
    const lightnesses = [0, 20, 40, 60, 80].map((pct) => lightnessOf(pastelGreenForProgress(pct)));
    for (let i = 1; i < lightnesses.length; i++) {
      expect(lightnesses[i]).toBeLessThan(lightnesses[i - 1]);
    }
  });

  it("never leaves the pastel range (saturation stays moderate) even at full progress", () => {
    const saturation = Number(pastelGreenForProgress(100).match(/hsl\(\d+ (\d+)%/)?.[1]);
    expect(saturation).toBeLessThanOrEqual(50);
  });

  it("applies the requested alpha without changing the hue/lightness step", () => {
    expect(pastelGreenForProgress(50, 0.08)).toMatch(/\/ 0\.08\)$/);
    expect(pastelGreenForProgress(50, 0.08).replace("0.08", "1")).toBe(pastelGreenForProgress(50));
  });
});

describe("pastelGreenForStreakDot", () => {
  const lightnessOf = (color: string) => Number(color.match(/(\d+)%\s*\/\s*[\d.]+\)$/)?.[1]);

  it("darkens from the first dot to the last", () => {
    const dots = [0, 1, 2].map((i) => lightnessOf(pastelGreenForStreakDot(i, 3)));
    expect(dots[0]).toBeGreaterThan(dots[1]);
    expect(dots[1]).toBeGreaterThan(dots[2]);
  });

  it("the last dot always lands on the deepest step, same as a fully-mastered unit card", () => {
    expect(pastelGreenForStreakDot(2, 3)).toBe(pastelGreenForProgress(100));
  });

  it("the first dot is clearly visible, not a barely-there near-white tint", () => {
    // A single small dot has far less surface area than the dashboard's own
    // wide bar -- its lightest step must stay noticeably darker than that
    // bar's own 0-20% bucket (lightnessOf(pastelGreenForProgress(0)) = 88),
    // or the "1st correct answer" dot reads as unfilled.
    expect(lightnessOf(pastelGreenForStreakDot(0, 3))).toBeLessThanOrEqual(75);
  });

  it("still never leaves the pastel range (moderate saturation) at any dot", () => {
    const saturationOf = (color: string) => Number(color.match(/hsl\(\d+ (\d+)%/)?.[1]);
    for (const i of [0, 1, 2]) {
      expect(saturationOf(pastelGreenForStreakDot(i, 3))).toBeLessThanOrEqual(50);
    }
  });
});

describe("WORD_MASTERY_STREAK", () => {
  it("is 3, matching the quiz's own 'answer it right 3 times in a row' rule", () => {
    expect(WORD_MASTERY_STREAK).toBe(3);
  });
});
