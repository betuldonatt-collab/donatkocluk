import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ParentProgramBoard, type ParentProgramTask } from "@/app/parent/_components/parent-program-board";
import { statusAppliedByApproval } from "./task-evidence";

const task = (over: Partial<ParentProgramTask>): ParentProgramTask => ({
  id: "t1",
  title: "Görev",
  description: null,
  task_type: "topic_study",
  course_id: "maarif7-matematik",
  task_date: "2026-10-06",
  status: "pending",
  order_index: 0,
  is_coach_assigned: true,
  total_count: null,
  correct_count: null,
  wrong_count: null,
  empty_count: null,
  subject_scores: null,
  duration_minutes: null,
  tracked_duration_seconds: null,
  evidence_image_paths: [],
  evidence_review_status: "none",
  evidence_photo_status: null,
  rejected_at: null,
  rejection_reason: null,
  evidence_review_note: null,
  resource_names: [],
  photo_urls: {},
  ...over,
});

const DAYS = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const board = (tasks: ParentProgramTask[]) => renderToStaticMarkup(<ParentProgramBoard days={DAYS} today="2026-10-06" tasks={tasks} fixedTasks={[]} />);

describe("the parent's Tam Program for a 7th grader (the LGS board)", () => {
  it("shows a 7th-grade Genel Deneme's six subjects with their Doğru / Yanlış / Boş", () => {
    const scores = Object.fromEntries(
      ["m7_turkce", "m7_sosyal", "m7_din", "m7_ingilizce", "m7_matematik", "m7_fen"].map((k, i) => [k, { correct: 10 + i, wrong: i, empty: 20 - i }]),
    );
    const html = board([task({ task_type: "general_exam", title: "7. SINIF Genel Deneme", course_id: null, subject_scores: scores })]);
    for (const label of ["Türkçe", "Sosyal Bilgiler", "Din Kültürü", "İngilizce", "Matematik", "Fen Bilimleri"]) expect(html).toContain(label);
    expect(html).toContain("D:10 Y:0 B:20");
  });

  it("an LGS Genel Deneme still shows its own subjects", () => {
    const html = board([task({ task_type: "general_exam", title: "LGS Genel Deneme", course_id: null, subject_scores: { lgs_inkilap: { correct: 7, wrong: 1, empty: 2 } } })]);
    expect(html).toContain("İnkılap Tarihi");
    expect(html).toContain("D:7 Y:1 B:2");
  });

  it("shows the coach's rejection of a photo, with the reason and the optional note", () => {
    const html = board([
      task({
        evidence_image_paths: ["s1/t1/a.jpg"],
        evidence_review_status: "rejected",
        evidence_photo_status: { "s1/t1/a.jpg": "rejected" },
        rejection_reason: "Fotoğraf okunmuyor.",
        evidence_review_note: "Daha net çek.",
        photo_urls: { "s1/t1/a.jpg": "https://example.test/a.jpg" },
      }),
    ]);
    expect(html).toContain("https://example.test/a.jpg");
    expect(html).toContain("Daha net çek.");
  });
});

describe("approving the photos of a task the student has taken back", () => {
  it("completes a task waiting for review as the student claimed it", () => {
    expect(statusAppliedByApproval({ wasPending: true, currentStatus: "pending", claimed: "done" })).toBe("done");
    expect(statusAppliedByApproval({ wasPending: true, currentStatus: "pending", claimed: "half_done" })).toBe("half_done");
  });

  it("never re-completes one the student has since marked Yapılmadı", () => {
    expect(statusAppliedByApproval({ wasPending: true, currentStatus: "not_done", claimed: "done" })).toBeNull();
  });

  it("does nothing for a task that was not waiting for review", () => {
    expect(statusAppliedByApproval({ wasPending: false, currentStatus: "pending", claimed: "done" })).toBeNull();
  });
});
