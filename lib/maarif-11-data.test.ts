import { describe, expect, it } from "vitest";

import { computeMaarif11SubjectStats, type Maarif11Subject } from "./maarif-11-data";

describe("computeMaarif11SubjectStats", () => {
  it("returns an empty array for no subjects", () => {
    expect(computeMaarif11SubjectStats([])).toEqual([]);
  });

  it("counts total sub-topics across every unit of a subject", () => {
    const subjects: Maarif11Subject[] = [
      {
        id: "matematik",
        name: "Matematik",
        units: [
          { id: "u1", name: "Ünite 1", subTopics: [{ id: "t1", name: "Konu 1" }, { id: "t2", name: "Konu 2" }] },
          { id: "u2", name: "Ünite 2", subTopics: [{ id: "t3", name: "Konu 3" }] },
        ],
      },
    ];
    expect(computeMaarif11SubjectStats(subjects)).toEqual([{ subjectId: "matematik", completed: 0, total: 3 }]);
  });

  it("counts only sub-topics marked completed, not merely present", () => {
    const subjects: Maarif11Subject[] = [
      {
        id: "tarih",
        name: "Tarih",
        units: [
          {
            id: "u1",
            name: "Ünite 1",
            subTopics: [
              { id: "t1", name: "Konu 1", completed: true },
              { id: "t2", name: "Konu 2", completed: false },
              { id: "t3", name: "Konu 3" },
            ],
          },
        ],
      },
    ];
    expect(computeMaarif11SubjectStats(subjects)).toEqual([{ subjectId: "tarih", completed: 1, total: 3 }]);
  });

  it("a subject with no units at all reports 0/0, not a crash", () => {
    const subjects: Maarif11Subject[] = [{ id: "bos", name: "Boş Ders", units: [] }];
    expect(computeMaarif11SubjectStats(subjects)).toEqual([{ subjectId: "bos", completed: 0, total: 0 }]);
  });

  it("keeps each subject's own stat independent of the others", () => {
    const subjects: Maarif11Subject[] = [
      { id: "a", name: "A", units: [{ id: "u1", name: "U1", subTopics: [{ id: "t1", name: "T1", completed: true }] }] },
      { id: "b", name: "B", units: [{ id: "u1", name: "U1", subTopics: [{ id: "t1", name: "T1" }, { id: "t2", name: "T2" }] }] },
    ];
    expect(computeMaarif11SubjectStats(subjects)).toEqual([
      { subjectId: "a", completed: 1, total: 1 },
      { subjectId: "b", completed: 0, total: 2 },
    ]);
  });
});
