import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/student/ingilizce-quiz/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("../app/student/ingilizce-quiz/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { VocabQuizDashboard } from "@/app/student/ingilizce-quiz/vocab-quiz-dashboard";
import { SessionResultText } from "@/app/student/ingilizce-quiz/vocab-quiz-session";
import { fillUnitStats } from "./lgs-vocab";
import { masteryTierColor } from "./progress-colors";

describe("İngilizce Kelime Quizi dashboard: progress from the first correct answer, in three tiers", () => {
  const stats = fillUnitStats([
    // 100 words: 10 with 3+ correct answers, 5 with 2, 20 with 1 -> 35 started
    { unitNumber: 1, total: 100, mastered: 10, level1: 20, level2: 5 },
    { unitNumber: 2, total: 40, mastered: 40, level1: 0, level2: 0 },
  ]);
  const html = renderToStaticMarkup(<VocabQuizDashboard initialUnitStats={stats} />);

  it("the counter is the words answered correctly at least once (xx/xxx), not only the mastered ones", () => {
    expect(html).toContain("35/100");
    expect(html).not.toContain("10/100");
    expect(html).toContain("40/40");
    expect(html).toContain("0/0");
  });

  it("the bar shows the three tiers as segments of the unit's words: deepest (3+), medium (2), light (1)", () => {
    const light = masteryTierColor(1);
    const medium = masteryTierColor(2);
    const dark = masteryTierColor(3);
    // widths are each tier's share of the 100 words, deepest first
    expect(html).toContain(`width:10%;background-color:${dark}`);
    expect(html).toContain(`width:5%;background-color:${medium}`);
    expect(html).toContain(`width:20%;background-color:${light}`);
    expect(new Set([light, medium, dark]).size).toBe(3);
  });

  it("explains the tiers with a small legend", () => {
    expect(html).toContain("1 doğru");
    expect(html).toContain("2 doğru");
    expect(html).toContain("3+ doğru");
  });
});

describe("dashboard with an RPC row that lacks the tier counts", () => {
  it("never renders NaN: started falls back to the mastered words, the bar widths stay numbers", () => {
    const stats = fillUnitStats([{ unitNumber: 1, total: 217, mastered: 12 } as never]);
    const html = renderToStaticMarkup(<VocabQuizDashboard initialUnitStats={stats} />);
    expect(html).not.toContain("NaN");
    expect(html).toContain("12/217");
  });
});

describe("end-of-session text", () => {
  const text = (u: number, a: number) => renderToStaticMarkup(<SessionResultText uniqueWords={u} attempts={a} />).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

  it("says how many different words took how many attempts -- never '17 out of 10'", () => {
    expect(text(10, 17)).toBe("10 kelimeyi 17 denemede doğru bildin.");
  });

  it("with no repeats it says every word was right on the first try", () => {
    expect(text(10, 10)).toBe("10 kelimenin hepsini ilk denemede doğru bildin.");
  });
});
