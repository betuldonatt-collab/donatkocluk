import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/coach", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/coach/students/[id]/karne-summary-actions", () => ({ getKarneSummary: vi.fn() }));

import { KarnelerTab, ReportCardReview } from "@/app/coach/students/[id]/_components/karneler-tab";
import type { CoachReportCardRow } from "@/app/coach/actions";

// The expanded report card in the coach's Karneler list is only what the coach DOES with it: the note, approving, deleting. What the Karne
// SAYS (numbers, exams, attendance) is the document above the list, the one the student and the parent receive.

const cycle = (over: Partial<CoachReportCardRow> = {}): CoachReportCardRow => ({
  id: "c1",
  cycle_number: 2,
  range_start: "2026-10-01",
  range_end: "2026-10-28",
  status: "draft",
  coach_notes: "Güzel bir dönemdi.",
  stats: { tyt: { current: 52, previous: 48.5 }, ayt: { current: 30, previous: null }, totalDurationMinutes: 600 },
  topic_mistakes: [],
  generated_at: "2026-10-29T10:00:00Z",
  approved_at: null,
  ...over,
});

const render = (c: CoachReportCardRow) => renderToStaticMarkup(<ReportCardReview cycle={c} onApproved={() => {}} onDeleted={() => {}} />);

describe("the expanded report card (draft)", () => {
  const html = render(cycle());

  it("has the note input, filled with the saved note, and the approve button", () => {
    expect(html).toContain("Öğrenciye Not");
    expect(html).toContain("<textarea");
    expect(html).toContain("Güzel bir dönemdi.");
    expect(html).not.toContain('disabled=""'); // (the textarea's class list always says "disabled:...", so look for the attribute)
    expect(html).toContain("Onayla ve Gönder");
  });

  it("has the delete action", () => {
    expect(html).toContain("Karneyi Sil");
  });

  it("says what approving does", () => {
    expect(html).toContain("Onayladığında öğrenci ve veli bu dönemin karnesini notunla birlikte görür.");
  });

  it("no longer repeats the Karne's content: no net cards, score breakdowns, topic grids, time or attendance", () => {
    for (const text of [
      "Ortalama Net",
      "Doğru / Yanlış / Boş",
      "Ders Bazlı Kırılım",
      "Konu Bazlı Hata Sıklığı",
      "Toplam Çalışma Süresi",
      "Etkinlik Katılımı",
      "Önceki döneme göre",
    ]) {
      expect(html, text).not.toContain(text);
    }
  });
});

describe("the expanded report card (approved)", () => {
  const html = render(cycle({ status: "approved", approved_at: "2026-10-30T09:00:00Z" }));

  it("shows the approval date instead of the approve button, the note read-only, and still the delete action", () => {
    expect(html).not.toContain("Onayla ve Gönder");
    expect(html).toContain("tarihinde onaylandı");
    expect(html).toMatch(/<textarea[^>]*\sdisabled=""/);
    expect(html).toContain("Karneyi Sil");
  });

  it("without an approval timestamp it still says Onaylandı", () => {
    expect(render(cycle({ status: "approved", approved_at: null }))).toContain("Onaylandı");
  });
});

describe("the short-cycle warning", () => {
  it("shows for a period under 28 days and not for a full one", () => {
    expect(render(cycle({ range_start: "2026-10-01", range_end: "2026-10-10" }))).toContain("Bu dönem 28 günden kısa (10 gün)");
    expect(render(cycle({ range_start: "2026-10-01", range_end: "2026-10-28" }))).not.toContain("günden kısa");
  });
});

describe("the tab around it", () => {
  it("the whole-history attendance and the detailed card code are gone from the Karneler tab and its page wiring", () => {
    const tab = readFileSync("app/coach/students/[id]/_components/karneler-tab.tsx", "utf8");
    for (const gone of ["ScoreBreakdownCard", "TopicGrid", "NetCard", "TotalDurationCard", "EventAttendanceCard", "CourseTabs", "eventAttendance"]) {
      expect(tab, gone).not.toContain(gone);
    }
    expect(readFileSync("app/coach/students/[id]/page.tsx", "utf8")).not.toContain("fetchStudentEventAttendance");
    expect(readFileSync("app/coach/students/[id]/_components/detail-tabs.tsx", "utf8")).not.toContain("eventAttendance");
  });

  it("the live Karne preview, the cross-period trend and the cycle list are all still there", () => {
    const html = renderToStaticMarkup(
      <KarnelerTab
        studentId="s1"
        cycles={[cycle({ status: "approved", approved_at: "2026-10-30T09:00:00Z" })]}
        defaultRange={null}
        allTimeTrackedMinutes={90}
        today="2026-10-30"
      />,
    );
    expect(html).toContain("Tüm Zamanlar Toplam Süre");
    expect(html).toContain("2. Dönem");
    expect(html).toContain("Yeni Dönem Karnesi Oluştur");
    expect(html).toContain('aria-label="Karne"'); // KarneLiveSection
  });
});
