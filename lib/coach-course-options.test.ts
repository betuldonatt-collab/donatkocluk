import { describe, expect, it, vi } from "vitest";

// The forms import server actions; only their pure option builders are used here.
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { courseOptionsFor } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { studentYksCourseOptions } from "@/app/student/_components/daily-tasks/add-custom-task-dialog";
import { aytTrackOf, type Track } from "./curriculum";

type Opts = { id: string; label: string }[];
const labels = (opts: Opts) => opts.map((o) => o.label);

// The coach's "Yeni görev ekle" and the student's "Ek Çalışma Ekle" build their YKS list the same way.
const FORMS: [string, (isBranchExam: boolean, track?: Track | null) => Opts][] = [
  ["the coach's task form", (b, t = null) => courseOptionsFor("YKS", b, null, t)],
  ["the student's Ek Çalışma Ekle", (b, t = null) => studentYksCourseOptions(b, t)],
];

for (const [formName, build] of FORMS) {
  describe(formName, () => {
    for (const isBranchExam of [false, true]) {
      describe(isBranchExam ? "Branş Denemesi" : "other task types", () => {
        const options = build(isBranchExam);

        it("lists every course once (no duplicated AYT Matematik / Geometri / Edebiyat / Tarih 1 / Coğrafya 1)", () => {
          const all = labels(options);
          expect(new Set(all).size).toBe(all.length);
          expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
          for (const label of ["AYT Matematik", "AYT Geometri", "AYT Edebiyat", "AYT Tarih 1", "AYT Coğrafya 1"]) {
            expect(all.filter((l) => l === label), label).toHaveLength(1);
          }
        });

        it("keeps Mantık (part of AYT Sos 2) and the rest of the Sözel courses", () => {
          const all = labels(options);
          for (const label of ["AYT Mantık", "AYT Felsefe", "AYT Psikoloji", "AYT Sosyoloji", "AYT Tarih 2", "AYT Coğrafya 2"]) {
            expect(all, label).toContain(label);
          }
          expect(options.some((o) => o.id === "ayt-mantik")).toBe(true);
        });

        it("keeps Geometri: TYT Geometri and AYT Geometri are present and selectable", () => {
          const all = labels(options);
          expect(all).toContain("TYT Geometri");
          expect(all).toContain("AYT Geometri");
          expect(options.some((o) => o.id === "tyt-geometri")).toBe(true);
          expect(options.some((o) => o.id === "ayt-geometri")).toBe(true);
        });

        it("keeps the TYT subjects and AYT Fizik / Kimya / Biyoloji", () => {
          const all = labels(options);
          for (const label of ["TYT Türkçe", "TYT Matematik", "TYT Fizik", "TYT Kimya", "TYT Biyoloji", "AYT Fizik", "AYT Kimya", "AYT Biyoloji"]) {
            expect(all, label).toContain(label);
          }
        });
      });
    }

    it("a Branş Denemesi leads with the combined courses, told apart from the standalone ones", () => {
      const options = build(true);
      expect(labels(options).slice(0, 3)).toEqual(["TYT Sosyal", "TYT Matematik (Matematik + Geometri)", "TYT Fen"]);
      expect(labels(options)).toContain("AYT Matematik (Matematik + Geometri)");
      expect(labels(options).filter((l) => l === "TYT Matematik")).toHaveLength(1);
      expect(labels(options).filter((l) => l === "AYT Sos 1")).toHaveLength(1);
      expect(labels(options)).toContain("AYT Sos 2");
    });

    it("a shared AYT subject is ONE course whatever the student's track (no track-specific copies)", () => {
      const idOf = (track: Track | null, label: string) => build(false, track).find((o) => o.label === label)?.id;
      for (const track of [null, "sayisal", "ea", "sozel"] as const) {
        expect(idOf(track, "AYT Matematik"), String(track)).toBe("ayt-matematik");
        expect(idOf(track, "AYT Geometri"), String(track)).toBe("ayt-geometri");
        expect(idOf(track, "AYT Edebiyat"), String(track)).toBe("ayt-edebiyat");
        expect(idOf(track, "AYT Tarih 1"), String(track)).toBe("ayt-tarih-1");
        expect(idOf(track, "AYT Coğrafya 1"), String(track)).toBe("ayt-cografya-1");
      }
    });
  });
}

describe("both forms offer exactly the same list", () => {
  it("for every task type and track", () => {
    for (const track of [null, "sayisal", "ea", "sozel"] as const) {
      for (const isBranchExam of [false, true]) {
        const coach = courseOptionsFor("YKS", isBranchExam, null, track);
        const student = studentYksCourseOptions(isBranchExam, track);
        // the coach's list also carries the routine pseudo-courses (Paragraf / Problem / Kitap Okuma); the student's does not
        const coachWithoutRoutines = coach.filter((o) => !["paragraf", "problem", "kitap-okuma"].includes(o.id));
        expect(coachWithoutRoutines).toEqual(student);
      }
    }
  });
});

describe("the student's track", () => {
  it("is read from profiles.academic_track", () => {
    expect(aytTrackOf("yks_sayisal")).toBe("sayisal");
    expect(aytTrackOf("yks_ea")).toBe("ea");
    expect(aytTrackOf("yks_sozel")).toBe("sozel");
    expect(aytTrackOf("yks_ydt")).toBeNull();
    expect(aytTrackOf("lgs_ortaokul")).toBeNull();
    expect(aytTrackOf(null)).toBeNull();
  });
});

describe("the other cohorts' lists are unchanged", () => {
  it("LGS and Maarif keep their own lists", () => {
    expect(labels(courseOptionsFor("LGS", false)).slice(0, 2)).toEqual(["Türkçe", "İnkılap Tarihi"]);
    expect(labels(courseOptionsFor("YKS", false, 7))).toHaveLength(6);
  });
});
