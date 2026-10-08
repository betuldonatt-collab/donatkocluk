import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/coach/dashboard", useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { AlertPanel } from "@/app/coach/dashboard/_components/alert-panel";
import { CoachSidebar } from "@/app/coach/_components/coach-sidebar";
import type { CoachAlerts } from "@/app/coach/dashboard/types";
import { coachCohorts, coachCohortsFromRoster, NO_COHORTS, showCohortPanel } from "./coach-cohorts";

const grades = (entries: [string, number | null][]) => new Map<string, number | null>(entries);

describe("coachCohorts: which groups a coach manages (active students only)", () => {
  it("a coach with only Lise (YKS) and LGS students has no 7. Sınıf group", () => {
    const cohorts = coachCohorts(
      [
        { id: "a", exam_type: "YKS" },
        { id: "b", exam_type: "YKS" },
        { id: "c", exam_type: "LGS" },
      ],
      grades([["a", null], ["b", 11], ["c", null]]),
    );
    expect(cohorts).toEqual({ yks: true, lgs: true, maarif7: false });
  });

  it("a 7th grader makes the 7. Sınıf group; 9th / 10th / 11th graders count as YKS (they share that panel)", () => {
    expect(coachCohorts([{ id: "a", exam_type: "YKS" }], grades([["a", 7]]))).toEqual({ yks: false, lgs: false, maarif7: true });
    for (const grade of [9, 10, 11]) {
      expect(coachCohorts([{ id: "a", exam_type: "YKS" }], grades([["a", grade]]))).toEqual({ yks: true, lgs: false, maarif7: false });
    }
  });

  it("an LGS student is LGS whatever the Maarif flag says", () => {
    expect(coachCohorts([{ id: "a", exam_type: "LGS" }], grades([["a", 7]]))).toEqual({ yks: false, lgs: true, maarif7: false });
  });

  it("a deactivated student does not keep a group alive; a missing flag counts as active", () => {
    expect(coachCohorts([{ id: "a", exam_type: "LGS", is_active: false }], grades([]))).toEqual(NO_COHORTS);
    expect(coachCohorts([{ id: "a", exam_type: "LGS", is_active: null }, { id: "b", exam_type: "YKS" }], grades([]))).toEqual({ yks: true, lgs: true, maarif7: false });
  });

  it("no students, no groups", () => {
    expect(coachCohorts([], grades([]))).toEqual(NO_COHORTS);
  });

  it("showCohortPanel: shown for a managed group, or whenever it still holds something to act on", () => {
    expect(showCohortPanel(true, 0)).toBe(true);
    expect(showCohortPanel(false, 0)).toBe(false);
    expect(showCohortPanel(false, 2)).toBe(true);
  });
});

describe("the dashboard's alert panel only renders the groups the coach manages", () => {
  const alerts: CoachAlerts = { inactive: [], lowPerformance: [], missingExams: [], pendingReportCards: [], lgsMissingTasks: [] };
  const render = (cohorts: { yks: boolean; lgs: boolean; maarif7: boolean }, pendingApprovals: never[] = []) =>
    renderToStaticMarkup(
      <AlertPanel
        alerts={{ ...alerts, pendingReportCards: [{ student: { id: "s", full_name: "Ayşe" }, reportCardId: "r", cycleNumber: 1, generatedAt: "2026-10-01" }] }}
        pendingApprovals={pendingApprovals}
        focusReviews={[]}
        courseRemovals={[]}
        cohorts={cohorts}
      />,
    );

  it("a Lise + LGS coach: YKS and LGS panels, no 7. Sınıf panel at all", () => {
    const html = render({ yks: true, lgs: true, maarif7: false });
    expect(html).toContain("YKS Onay Bekleyen Görevler");
    expect(html).toContain("LGS Onay Bekleyen Görevler");
    expect(html).toContain("LGS ve 7. Sınıf Eksik/Tamamlanmayan Görevler");
    expect(html).not.toContain("7. Sınıf Onay Bekleyen Görevler");
  });

  it("a coach with only YKS students sees neither the LGS nor the 7. Sınıf panels", () => {
    const html = render({ yks: true, lgs: false, maarif7: false });
    expect(html).toContain("YKS Onay Bekleyen Görevler");
    expect(html).not.toContain("LGS Onay Bekleyen Görevler");
    expect(html).not.toContain("7. Sınıf Onay Bekleyen Görevler");
    expect(html).not.toContain("Eksik/Tamamlanmayan Görevler");
  });

  it("a coach with only 7th graders sees the 7. Sınıf approvals and the shared missing-tasks panel, nothing else of the groups", () => {
    const html = render({ yks: false, lgs: false, maarif7: true });
    expect(html).toContain("7. Sınıf Onay Bekleyen Görevler");
    expect(html).toContain("LGS ve 7. Sınıf Eksik/Tamamlanmayan Görevler");
    expect(html).not.toContain("YKS Onay Bekleyen Görevler");
    expect(html).not.toContain("LGS Onay Bekleyen Görevler");
  });

  it("the group-independent cards are always there", () => {
    const html = render({ yks: false, lgs: false, maarif7: false });
    expect(html).toContain("Pasif Öğrenciler");
    expect(html).toContain("Düşük Performans");
    expect(html).toContain("Onay Bekleyen Karneler");
    expect(html).not.toContain("Onay Bekleyen Görevler");
  });

  it("a pending approval is never hidden with its group: the panel stays when it holds a task", () => {
    const task = { studentId: "s1", studentName: "Ali", studentExamType: "LGS", studentIsMaarif7: false, id: "t1", task_date: "2026-10-01", task_type: "question_bank", title: "x", course_id: null, topic_id: null, evidence_image_paths: [] } as never;
    const html = render({ yks: true, lgs: false, maarif7: false }, [task]);
    expect(html).toContain("LGS Onay Bekleyen Görevler");
  });
});

describe("coachCohortsFromRoster + the sidebar countdowns", () => {
  const link = (id: string, profile: { exam_type?: "YKS" | "LGS"; is_active?: boolean; is_maarif7?: boolean } | null) => ({ student_id: id, profiles: profile });

  it("derives the groups from one embedded roster read (object or single-element array for the profile)", () => {
    expect(coachCohortsFromRoster([link("a", { exam_type: "YKS" }), link("b", { exam_type: "LGS" })])).toEqual({ yks: true, lgs: true, maarif7: false });
    expect(coachCohortsFromRoster([{ student_id: "a", profiles: [{ exam_type: "YKS", is_maarif7: true }] }])).toEqual({ yks: false, lgs: false, maarif7: true });
    expect(coachCohortsFromRoster([link("a", { exam_type: "LGS", is_active: false })])).toEqual(NO_COHORTS);
    expect(coachCohortsFromRoster([link("a", null)])).toEqual(NO_COHORTS);
  });

  it("null (roster unreadable) stays null so the caller can fall back to showing everything", () => {
    expect(coachCohortsFromRoster(null)).toBeNull();
  });

  it("the sidebar shows one countdown per exam the coach has students for", () => {
    const html = (cohorts: { yks: boolean; lgs: boolean; maarif7: boolean } | null) =>
      renderToStaticMarkup(<CoachSidebar cohorts={cohorts} />);
    const pills = (h: string) => ({ yks: h.includes("YKS:"), lgs: h.includes("LGS:") });
    expect(pills(html({ yks: true, lgs: false, maarif7: false }))).toEqual({ yks: true, lgs: false });
    expect(pills(html({ yks: false, lgs: true, maarif7: false }))).toEqual({ yks: false, lgs: true });
    expect(pills(html({ yks: false, lgs: false, maarif7: true }))).toEqual({ yks: false, lgs: true }); // 7th graders count down to the LGS
    expect(pills(html({ yks: true, lgs: true, maarif7: false }))).toEqual({ yks: true, lgs: true });
    expect(pills(html(null))).toEqual({ yks: true, lgs: true }); // unknown: both, as before
  });
});
