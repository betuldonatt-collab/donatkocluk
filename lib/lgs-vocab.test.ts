import { describe, expect, it } from "vitest";

import { checkVocabAnswer, computeUnitStats, levenshteinDistance, selectQuizBatch, type WordProgressSummary } from "./lgs-vocab";

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

  it("returns only the display fields, not progress internals", () => {
    const [first] = selectQuizBatch(words, new Map(), 1);
    expect(first).toEqual({ id: "w1", english_word: "apple", turkish_meaning: "elma" });
  });
});

describe("computeUnitStats", () => {
  it("always returns all 10 units in order, even with no words", () => {
    const stats = computeUnitStats([], new Set());
    expect(stats).toHaveLength(10);
    expect(stats.map((s) => s.unitNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stats.every((s) => s.total === 0 && s.mastered === 0)).toBe(true);
  });

  it("counts total and mastered per unit", () => {
    const words = [
      { id: "a", unit_number: 1 },
      { id: "b", unit_number: 1 },
      { id: "c", unit_number: 2 },
    ];
    const stats = computeUnitStats(words, new Set(["a"]));
    expect(stats[0]).toEqual({ unitNumber: 1, total: 2, mastered: 1 });
    expect(stats[1]).toEqual({ unitNumber: 2, total: 1, mastered: 0 });
  });
});
