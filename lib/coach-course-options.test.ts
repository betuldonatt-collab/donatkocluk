import { describe, expect, it, vi } from "vitest";

// The task form imports server actions; only its pure option builders are used here.
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { courseOptionsFor } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { aytTrackOf } from "./curriculum";

const labels = (opts: { label: string }[]) => opts.map((o) => o.label);

describe("the coach's Ders list for a YKS student", () => {
  for (const isBranchExam of [false, true]) {
    describe(isBranchExam ? "Branş Denemesi" : "other task types", () => {
      const options = courseOptionsFor("YKS", isBranchExam);

      it("lists every course once (no duplicated AYT Matematik / Geometri / Edebiyat / Tarih 1 / Coğrafya 1)", () => {
        const all = labels(options);
        expect(new Set(all).size).toBe(all.length);
        expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
        for (const label of ["AYT Matematik", "AYT Geometri", "AYT Edebiyat", "AYT Tarih 1", "AYT Coğrafya 1"]) {
          expect(all.filter((l) => l === label), label).toHaveLength(1);
        }
      });

      it("does not offer Mantık", () => {
        expect(labels(options).some((l) => /mantık/i.test(l))).toBe(false);
        expect(options.some((o) => o.id === "ayt-mantik")).toBe(false);
      });

      it("keeps every other course (Psikoloji, Sosyoloji, Felsefe, the TYT subjects, AYT Fizik ...)", () => {
        const all = labels(options);
        for (const label of ["TYT Türkçe", "TYT Fizik", "AYT Fizik", "AYT Kimya", "AYT Biyoloji", "AYT Tarih 2", "AYT Coğrafya 2", "AYT Felsefe", "AYT Psikoloji", "AYT Sosyoloji"]) {
          expect(all, label).toContain(label);
        }
      });
    });
  }

  it("a Branş Denemesi still leads with the combined courses (TYT Fen, AYT Matematik ...), each once", () => {
    const options = courseOptionsFor("YKS", true);
    expect(labels(options).slice(0, 3)).toEqual(["TYT Sosyal", "TYT Matematik (Matematik + Geometri)", "TYT Fen"]);
    // the combined one is told apart from the standalone course of the same name
    expect(labels(options)).toContain("TYT Matematik (Matematik + Geometri)");
    expect(labels(options).filter((l) => l === "TYT Matematik")).toHaveLength(1);
    expect(labels(options)).toContain("AYT Matematik (Matematik + Geometri)");
    expect(labels(options).filter((l) => l === "AYT Sos 1")).toHaveLength(1);
  });

  it("keeps the student's own track's variant of a shared course (EA / Sözel / Sayısal)", () => {
    const idOf = (track: "sayisal" | "ea" | "sozel" | null, label: string) => courseOptionsFor("YKS", false, null, track).find((o) => o.label === label)?.id;
    expect(idOf("sayisal", "AYT Matematik")).toBe("ayt-matematik-sayisal");
    expect(idOf("ea", "AYT Matematik")).toBe("ayt-matematik-ea");
    expect(idOf("ea", "AYT Geometri")).toBe("ayt-geometri-ea");
    expect(idOf("sozel", "AYT Edebiyat")).toBe("ayt-edebiyat-sozel");
    expect(idOf("ea", "AYT Edebiyat")).toBe("ayt-edebiyat-ea");
    expect(idOf("sozel", "AYT Tarih 1")).toBe("ayt-tarih-1-sozel");
    // no known track: the first one (Sayısal for Matematik / Geometri, EA for Edebiyat / Tarih 1 / Coğrafya 1)
    expect(idOf(null, "AYT Matematik")).toBe("ayt-matematik-sayisal");
    expect(idOf(null, "AYT Edebiyat")).toBe("ayt-edebiyat-ea");
  });

  it("reads the student's track from profiles.academic_track", () => {
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
