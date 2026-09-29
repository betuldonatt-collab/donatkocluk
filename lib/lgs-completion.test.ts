import { describe, expect, it } from "vitest";

import { LGS_EXAM_SUBJECTS } from "./curriculum/subject-groups";
import { lgsCompletionProblem } from "./lgs-completion";

const base = { title: "T", photoCount: 1, correct: null, wrong: null, empty: null, subjectScores: null } as const;

describe("lgsCompletionProblem", () => {
  it("needs at least one photo for every task type except Kitap Okuma", () => {
    for (const taskType of ["question_bank", "video", "topic_study", "branch_exam", "general_exam", "extra_custom"]) {
      expect(lgsCompletionProblem({ ...base, taskType, photoCount: 0, correct: 1, wrong: 0, empty: 0 })).toMatch(/kanıt fotoğrafı/);
    }
  });

  it("lets video / konu çalışması through with just a photo", () => {
    for (const taskType of ["video", "topic_study", "extra_custom"]) {
      expect(lgsCompletionProblem({ ...base, taskType })).toBeNull();
    }
  });

  it("Kitap Okuma needs a page range instead of a photo -- no photo required, correct (Okunan Sayfa) required", () => {
    // No photo at all, but a page range already derived Okunan Sayfa: ready.
    expect(lgsCompletionProblem({ ...base, taskType: "reading", photoCount: 0, correct: 12 })).toBeNull();
    // A photo present but no page range entered yet: still not ready --
    // the photo is no longer what this task type is judged on.
    expect(lgsCompletionProblem({ ...base, taskType: "reading", photoCount: 1, correct: null })).toMatch(
      /başlangıç ve bitiş sayfasını/,
    );
  });

  it("needs Doğru/Yanlış/Boş for Soru Çözümü and Branş Denemesi (0 counts, blank does not)", () => {
    for (const taskType of ["question_bank", "branch_exam"]) {
      expect(lgsCompletionProblem({ ...base, taskType })).toMatch(/doğru, yanlış ve boş/);
      expect(lgsCompletionProblem({ ...base, taskType, correct: 5, wrong: 1, empty: null })).toMatch(/doğru, yanlış ve boş/);
      expect(lgsCompletionProblem({ ...base, taskType, correct: 0, wrong: 0, empty: 0 })).toBeNull();
    }
  });

  it("needs a complete per-subject result set for Genel Deneme", () => {
    const full = Object.fromEntries(LGS_EXAM_SUBJECTS.map((s) => [s.key, { correct: s.questions, wrong: 0, empty: 0 }]));
    expect(lgsCompletionProblem({ ...base, taskType: "general_exam", title: "LGS Genel Deneme", subjectScores: full })).toBeNull();
    expect(lgsCompletionProblem({ ...base, taskType: "general_exam", title: "LGS Genel Deneme", subjectScores: null })).toMatch(/tüm derslerin/);
    const partial = { ...full, lgs_fen: { correct: 5, wrong: 1, empty: null } };
    expect(lgsCompletionProblem({ ...base, taskType: "general_exam", title: "LGS Genel Deneme", subjectScores: partial })).toMatch(/tüm derslerin/);
  });
});
