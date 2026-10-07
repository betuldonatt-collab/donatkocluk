import { describe, expect, it } from "vitest";

import {
  applyCorrectToUnitStat,
  buildUnitStats,
  checkVocabAnswer,
  fillUnitStats,
  levenshteinDistance,
  masteryLevel,
  nextWordProgress,
  requeueAfterMiss,
  selectQuizBatch,
  shuffled,
  summarizeSession,
  unitStarted,
  vocabUnitTitle,
  WORD_MASTERY_COUNT,
  type UnitStat,
  type WordProgressSummary,
} from "./lgs-vocab";
import { masteryTierColor } from "./progress-colors";

// A seeded generator, so the "random" tests are repeatable.
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

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

describe("checkVocabAnswer: '&' and 'and' are the same", () => {
  it("'Black & White' in the database accepts 'black and white' and the ampersand version, in either direction of the pair", () => {
    expect(checkVocabAnswer("black and white", "Black & White", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("Black & White", "Black & White", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("black&white", "Black & White", "tr_to_en")).toBe("EXACT_MATCH");
  });

  it("'Black and White' in the database accepts the ampersand version too", () => {
    expect(checkVocabAnswer("black & white", "Black and White", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("BLACK AND WHITE", "Black and White", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("black&white", "Black and White", "tr_to_en")).toBe("EXACT_MATCH");
  });

  it("works with extra spaces, and inside a slash-separated list of meanings", () => {
    expect(checkVocabAnswer("  black   and   white ", "Black & White", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("salt and pepper", "tuz ve biber / Salt & Pepper", "tr_to_en")).toBe("EXACT_MATCH");
  });

  it("applies on the Turkish side too (an ampersand in a Turkish meaning)", () => {
    expect(checkVocabAnswer("anne & baba", "Anne & Baba", "en_to_tr")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("anne and baba", "Anne & Baba", "en_to_tr")).toBe("EXACT_MATCH");
  });

  it("still does not accept a genuinely different answer, and the typo rule still applies after normalising", () => {
    expect(checkVocabAnswer("black or white", "Black & White", "tr_to_en")).toBe("INCORRECT");
    expect(checkVocabAnswer("black white", "Black & White", "tr_to_en")).toBe("INCORRECT");
    expect(checkVocabAnswer("black and whitee", "Black & White", "tr_to_en")).toBe("ACCEPTED_TYPO");
    // 'and' inside another word is not touched
    expect(checkVocabAnswer("sandwich", "sandwich", "tr_to_en")).toBe("EXACT_MATCH");
    expect(checkVocabAnswer("sandwich", "sand & wich", "tr_to_en")).toBe("INCORRECT");
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
    const progress = new Map<string, WordProgressSummary>([["w1", { correct_count: 3, is_mastered: true, last_tested_at: null }]]);
    const batch = selectQuizBatch(words, progress, 10);
    expect(batch.map((w) => w.id)).not.toContain("w1");
    expect(batch).toHaveLength(3);
  });

  it("returns the open words in a random order, not the list's own order -- and a different order for a different shuffle", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, english_word: `e${i}`, turkish_meaning: `t${i}` }));
    const a = selectQuizBatch(many, new Map(), 30, seeded(1)).map((w) => w.id);
    const b = selectQuizBatch(many, new Map(), 30, seeded(2)).map((w) => w.id);
    const original = many.map((w) => w.id);
    expect([...a].sort()).toEqual([...original].sort()); // nothing lost, nothing duplicated
    expect(a).not.toEqual(original);
    expect(a).not.toEqual(b);
    // the real default (Math.random) never hands back the sequential list either
    expect(selectQuizBatch(many, new Map(), 30).map((w) => w.id)).not.toEqual(original);
  });

  it("is not biased by streak or last-tested time any more: a never-tested word and a half-learned one mix freely", () => {
    const progress = new Map<string, WordProgressSummary>([
      ["w1", { correct_count: 2, is_mastered: false, last_tested_at: "2026-01-01T00:00:00Z" }],
      ["w2", { correct_count: 0, is_mastered: false, last_tested_at: "2025-01-01T00:00:00Z" }],
    ]);
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) firsts.add(selectQuizBatch(words, progress, 4, seeded(seed))[0].id);
    expect(firsts.size).toBeGreaterThan(2); // every open word can come first
  });

  it("caps the batch at `limit`", () => {
    expect(selectQuizBatch(words, new Map(), 2)).toHaveLength(2);
  });

  it("returns the display fields plus correctCount, not the rest of the progress row", () => {
    const [first] = selectQuizBatch([words[0]], new Map(), 1);
    expect(first).toEqual({ id: "w1", english_word: "apple", turkish_meaning: "elma", correctCount: 0 });
  });

  it("carries each word's own correct_count through for the per-word level dots", () => {
    const progress = new Map<string, WordProgressSummary>([["w2", { correct_count: 2, is_mastered: false, last_tested_at: null }]]);
    const batch = selectQuizBatch(words, progress, 10);
    expect(batch.find((w) => w.id === "w2")?.correctCount).toBe(2);
    expect(batch.find((w) => w.id === "w3")?.correctCount).toBe(0); // no progress row -> 0
  });
});

describe("shuffled", () => {
  it("returns a new array with the same items and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(input, seeded(7));
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("is roughly uniform: every item lands in every position over many shuffles", () => {
    const seen = Array.from({ length: 4 }, () => new Set<number>());
    const rng = seeded(12345);
    for (let i = 0; i < 400; i++) shuffled([0, 1, 2, 3], rng).forEach((item, pos) => seen[pos].add(item));
    for (const positions of seen) expect(positions.size).toBe(4);
  });
});

describe("nextWordProgress (the one rule behind submitVocabAnswer)", () => {
  it("the first correct answer counts at once: correct_count 0 -> 1, flagged as the first", () => {
    expect(nextWordProgress({ correctCount: 0, correctStreak: 0 }, true)).toEqual({
      correctCount: 1,
      correctStreak: 1,
      isMastered: false,
      firstCorrect: true,
      becameMastered: false,
    });
  });

  it("later correct answers raise the level but are never 'first' again (the progress counter does not move twice for one word)", () => {
    const second = nextWordProgress({ correctCount: 1, correctStreak: 1 }, true);
    expect(second).toMatchObject({ correctCount: 2, firstCorrect: false, becameMastered: false });
    const third = nextWordProgress({ correctCount: 2, correctStreak: 2 }, true);
    expect(third).toMatchObject({ correctCount: 3, isMastered: true, firstCorrect: false, becameMastered: true });
    // beyond 3: still mastered, not newly
    expect(nextWordProgress({ correctCount: 3, correctStreak: 3 }, true)).toMatchObject({ correctCount: 4, isMastered: true, becameMastered: false });
  });

  it("3 correct answers IN TOTAL master a word, not 3 in a row", () => {
    let p = { correctCount: 0, correctStreak: 0 };
    for (const answer of [true, false, true, false, true]) {
      const next = nextWordProgress(p, answer);
      p = { correctCount: next.correctCount, correctStreak: next.correctStreak };
    }
    expect(p.correctCount).toBe(3);
    expect(nextWordProgress({ correctCount: 2, correctStreak: 0 }, true).isMastered).toBe(true);
  });

  it("a miss never takes back what was earned: correct_count stays, only the streak resets", () => {
    for (const count of [0, 1, 2, 5]) {
      const missed = nextWordProgress({ correctCount: count, correctStreak: 2 }, false);
      expect(missed).toMatchObject({ correctCount: count, correctStreak: 0, firstCorrect: false, becameMastered: false });
      expect(missed.isMastered).toBe(count >= 3);
    }
  });
});

describe("masteryLevel / tier colors", () => {
  it("1 correct = level 1, 2 = level 2, 3 or more = level 3 (0 = none)", () => {
    expect([0, 1, 2, 3, 4, 10].map(masteryLevel)).toEqual([0, 1, 2, 3, 3, 3]);
  });

  it("three distinct shades, light -> medium -> darkest", () => {
    const lightness = (c: string) => Number(/ (\d+)% \//.exec(c)![1]);
    const [l1, l2, l3] = ([1, 2, 3] as const).map((l) => lightness(masteryTierColor(l)));
    expect(l1).toBeGreaterThan(l2);
    expect(l2).toBeGreaterThan(l3);
    expect(new Set([1, 2, 3].map((l) => masteryTierColor(l as 1 | 2 | 3))).size).toBe(3);
  });
});

describe("requeueAfterMiss", () => {
  const queue = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));

  it("brings a missed word back 3 words later, leaving the original where it was asked", () => {
    const out = requeueAfterMiss(queue, 1, { id: "b" });
    expect(out.map((w) => w.id)).toEqual(["a", "b", "c", "d", "e", "b", "f"]);
  });

  it("goes to the very end when fewer than 3 words remain -- even for the last word of the batch", () => {
    expect(requeueAfterMiss(queue, 4, { id: "e" }).map((w) => w.id)).toEqual(["a", "b", "c", "d", "e", "f", "e"]);
    expect(requeueAfterMiss(queue, 5, { id: "f" }).map((w) => w.id)).toEqual(["a", "b", "c", "d", "e", "f", "f"]);
  });

  it("does not queue a second copy while one is already waiting", () => {
    const withCopy = requeueAfterMiss(queue, 0, { id: "a" });
    expect(requeueAfterMiss(withCopy, 1, { id: "a" }).map((w) => w.id)).toEqual(withCopy.map((w) => w.id));
  });

  it("does not mutate the input queue", () => {
    const copy = [...queue];
    requeueAfterMiss(queue, 2, { id: "c" });
    expect(queue).toEqual(copy);
  });
});

describe("fillUnitStats", () => {
  const stat = (unitNumber: number, total: number, mastered: number, level1 = 0, level2 = 0): UnitStat => ({ unitNumber, total, mastered, level1, level2 });

  it("always returns all 10 units in order, even with no rows", () => {
    const stats = fillUnitStats([]);
    expect(stats).toHaveLength(10);
    expect(stats.map((s) => s.unitNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stats.every((s) => s.total === 0 && s.mastered === 0 && s.level1 === 0 && s.level2 === 0)).toBe(true);
  });

  it("fills in only the units a row was given for, leaving the rest at 0/0", () => {
    const stats = fillUnitStats([stat(1, 2, 1, 1, 0), stat(2, 1, 0)]);
    expect(stats[0]).toEqual(stat(1, 2, 1, 1, 0));
    expect(stats[1]).toEqual(stat(2, 1, 0));
    expect(stats[2]).toEqual(stat(3, 0, 0));
  });

  it("ignores a row for a unit number outside 1-10 instead of crashing", () => {
    expect(fillUnitStats([stat(11, 5, 5)])).toHaveLength(10);
  });

  it("'started' (the xx/xxx counter) is every word with at least one correct answer", () => {
    expect(unitStarted(stat(1, 100, 10, 20, 5))).toBe(35);
    expect(unitStarted(stat(1, 100, 0))).toBe(0);
  });
});

describe("applyCorrectToUnitStat (the dashboard right after a session)", () => {
  const base: UnitStat = { unitNumber: 1, total: 50, mastered: 4, level1: 10, level2: 6 };

  it("a word's first correct answer raises 'started' by exactly one", () => {
    const next = applyCorrectToUnitStat(base, 0, 1);
    expect(next).toMatchObject({ level1: 11, level2: 6, mastered: 4 });
    expect(unitStarted(next)).toBe(unitStarted(base) + 1);
  });

  it("later correct answers move a word between tiers without changing 'started'", () => {
    const second = applyCorrectToUnitStat(base, 1, 2);
    expect(second).toMatchObject({ level1: 9, level2: 7, mastered: 4 });
    expect(unitStarted(second)).toBe(unitStarted(base));
    const third = applyCorrectToUnitStat(base, 2, 3);
    expect(third).toMatchObject({ level2: 5, mastered: 5 });
    expect(unitStarted(third)).toBe(unitStarted(base));
    expect(applyCorrectToUnitStat(base, 3, 4)).toBe(base);
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

describe("WORD_MASTERY_COUNT", () => {
  it("is 3, matching the quiz's own 'answer it right 3 times' rule (in total, not in a row)", () => {
    expect(WORD_MASTERY_COUNT).toBe(3);
  });
});

describe("fillUnitStats: never NaN", () => {
  it("a row that lacks (or garbles) the tier counts becomes zeros, so started and the bar widths stay numbers", () => {
    const [unit1] = fillUnitStats([
      { unitNumber: 1, total: 217, mastered: 12, level1: undefined as unknown as number, level2: null as unknown as number },
    ]);
    expect(unit1).toEqual({ unitNumber: 1, total: 217, mastered: 12, level1: 0, level2: 0 });
    expect(unitStarted(unit1)).toBe(12);
    expect(Number.isNaN(unitStarted(fillUnitStats([{ unitNumber: 2, total: 5 } as unknown as UnitStat])[1]))).toBe(false);
  });
});

describe("buildUnitStats", () => {
  const totals = [
    { unit_number: 1, total: 217 }, // an RPC row WITHOUT mastered / level columns at all
    { unit_number: 2, total: 40, mastered: 7, level1: 3, level2: 2 },
  ];

  it("counts the three tiers from the student's own progress rows (1 correct, 2, 3 or more), whatever the RPC carried", () => {
    const progress = [
      { unit_number: 1, correct_count: 1 },
      { unit_number: 1, correct_count: 1 },
      { unit_number: 1, correct_count: 2 },
      { unit_number: 1, correct_count: 3 },
      { unit_number: 1, correct_count: 9 },
      { unit_number: 2, correct_count: 2 },
      { unit_number: 1, correct_count: 0 }, // never answered correctly: not started
    ];
    const [u1, u2] = buildUnitStats(totals, progress);
    expect(u1).toEqual({ unitNumber: 1, total: 217, level1: 2, level2: 1, mastered: 2 });
    expect(unitStarted(u1)).toBe(5);
    expect(u2).toEqual({ unitNumber: 2, total: 40, level1: 0, level2: 1, mastered: 0 }); // progress wins over the RPC's own tiers
  });

  it("a unit with no progress rows is 0 started out of its total", () => {
    const [u1] = buildUnitStats(totals, []);
    expect(u1).toEqual({ unitNumber: 1, total: 217, level1: 0, level2: 0, mastered: 0 });
  });

  it("when the progress read failed it falls back to the RPC's tier counts, coerced -- never NaN", () => {
    const [u1, u2] = buildUnitStats(totals, null);
    expect(u1).toEqual({ unitNumber: 1, total: 217, level1: 0, level2: 0, mastered: 0 });
    expect(u2).toEqual({ unitNumber: 2, total: 40, level1: 3, level2: 2, mastered: 7 });
    expect(unitStarted(u2)).toBe(12);
  });
});

describe("summarizeSession", () => {
  it("counts the different words presented and the attempts -- a re-queued word is one word, several attempts", () => {
    const queue = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "b" }, { id: "a" }, { id: "b" }];
    expect(summarizeSession(queue, 6)).toEqual({ uniqueWords: 3, attempts: 6 });
    expect(summarizeSession([{ id: "a" }, { id: "b" }], 2)).toEqual({ uniqueWords: 2, attempts: 2 });
    expect(summarizeSession([], 0)).toEqual({ uniqueWords: 0, attempts: 0 });
  });
});
