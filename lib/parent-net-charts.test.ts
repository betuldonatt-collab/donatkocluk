import { describe, expect, it } from "vitest";

import { lgsNetChart, maarif7NetChart, netChartFor, parseGeneralExamTrack, type ParentGeneralExam } from "./parent-net-charts";

const M7_KEYS = ["m7_turkce", "m7_sosyal", "m7_din", "m7_ingilizce", "m7_matematik", "m7_fen"];
const LGS_KEYS = ["lgs_turkce", "lgs_inkilap", "lgs_din", "lgs_ingilizce", "lgs_matematik", "lgs_fen"];
// 70 doğru, 12 yanlış, rest boş over 90 questions (20 / 10 / 10 / 10 / 20 / 20)
const SCORES = (keys: string[]) => {
  const rows: [number, number][] = [[15, 3], [9, 0], [6, 3], [10, 0], [12, 6], [18, 0]];
  return Object.fromEntries(keys.map((k, i) => [k, { correct: rows[i][0], wrong: rows[i][1], empty: [20, 10, 10, 10, 20, 20][i] - rows[i][0] - rows[i][1] }]));
};
const exam = (id: string, title: string, date: string, keys: string[]): ParentGeneralExam => ({ id, title, task_date: date, subject_scores: SCORES(keys) });

describe("the parent home's 7th-grade net chart", () => {
  const exams = [
    exam("b", "7. SINIF Genel Deneme - B", "2026-10-08", M7_KEYS),
    exam("a", "7. SINIF Genel Deneme - A", "2026-10-01", M7_KEYS),
    exam("l", "LGS Genel Deneme", "2026-10-03", LGS_KEYS),
    exam("t", "TYT Genel Deneme", "2026-10-04", ["turkce"]),
  ];

  it("plots only the 7th-grade exams, oldest first, with the 3 yanlış 1 doğruyu götürür net (70 - 12/3 = 66)", () => {
    expect(maarif7NetChart(exams)).toEqual([
      { date: "2026-10-01", value: 66 },
      { date: "2026-10-08", value: 66 },
    ]);
  });

  it("leaves a half-entered 7th-grade exam off the chart", () => {
    const half: ParentGeneralExam = { id: "h", title: "7. SINIF Genel Deneme", task_date: "2026-10-09", subject_scores: { m7_turkce: { correct: 5, wrong: 1 } } };
    expect(maarif7NetChart([half])).toEqual([]);
    expect(maarif7NetChart([...exams, half])).toHaveLength(2);
  });

  it("is empty for a student with no 7th-grade exam, and never picks up LGS or TYT exams", () => {
    expect(maarif7NetChart([exams[2], exams[3]])).toEqual([]);
  });
});

describe("the other parent charts are unchanged", () => {
  it("LGS: only LGS exams, net 3:1", () => {
    const e = [exam("l", "LGS Genel Deneme", "2026-10-03", LGS_KEYS), exam("a", "7. SINIF Genel Deneme", "2026-10-01", M7_KEYS)];
    expect(lgsNetChart(e)).toEqual([{ date: "2026-10-03", value: 66 }]);
  });

  it("YKS default: 4 yanlış 1 doğruyu götürür", () => {
    expect(netChartFor([{ id: "t", title: "TYT Genel Deneme", task_date: "2026-10-04", subject_scores: { matematik: { correct: 20, wrong: 8 } } }])).toEqual([
      { date: "2026-10-04", value: 18 },
    ]);
  });

  it("recovers the track from the title", () => {
    expect(parseGeneralExamTrack("7. SINIF Genel Deneme")).toBe("m7");
    expect(parseGeneralExamTrack("LGS Genel Deneme")).toBe("lgs");
    expect(parseGeneralExamTrack("AYT Genel Deneme")).toBe("ayt");
    expect(parseGeneralExamTrack("Genel Deneme")).toBe("tyt");
  });
});
