import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { KarneDocument } from "@/components/karne-document";
import { KarnePeriodPicker } from "@/components/karne-period-picker";
import { buildParentEventAttendance } from "./event-attendance";
import { computeKarneSummary, type KarneSummaryTask } from "./karne-summary";
import { formatPeriod, isIsoDate, parsePeriod, presetPeriods, samePeriod } from "./karne-periods";

const RANGE = { start: "2026-10-01", end: "2026-10-28" };
const task = (t: Partial<KarneSummaryTask> & { task_date: string }): KarneSummaryTask => ({ status: "done", task_type: "question_bank", ...t });

const events = buildParentEventAttendance({
  announcements: [{ id: "e1", title: "Deneme Semineri", event_date: "2026-10-05" }],
  configs: [{ announcement_id: "e1", session_count: 2 }],
  attendance: [
    { announcement_id: "e1", session_number: 1, status: "attended", marked_at: "2026-10-05T10:00:00Z" },
    { announcement_id: "e1", session_number: 2, status: "not_attended", marked_at: "2026-10-05T10:00:00Z" },
  ],
  rsvps: [{ announcement_id: "e1", response: "attending", decline_reason: null }],
  rangeStart: RANGE.start,
  rangeEnd: RANGE.end,
});

const tasks: KarneSummaryTask[] = [
  task({ task_date: "2026-10-02", course_id: "tyt-matematik", total_count: 20, correct_count: 15, wrong_count: 3, empty_count: 2, tracked_duration_minutes: 2480 }),
  task({ task_date: "2026-09-10", course_id: "tyt-matematik", total_count: 30, correct_count: 20, wrong_count: 6, empty_count: 4, tracked_duration_minutes: 600 }),
  task({
    task_date: "2026-10-10",
    task_type: "general_exam",
    title: "TYT Genel Deneme 3",
    subject_scores: { turkce: { correct: 30, wrong: 5, empty: 5 }, matematik: { correct: 20, wrong: 10, empty: 10 } },
  }),
  task({
    task_date: "2026-10-17",
    task_type: "general_exam",
    title: "AYT Genel Deneme 1",
    subject_scores: { ayt_matematik: { correct: 20, wrong: 8, empty: 12 }, ayt_fizik: { correct: 8, wrong: 3, empty: 3 } },
  }),
];
const summary = computeKarneSummary({ rangeStart: RANGE.start, rangeEnd: RANGE.end, today: "2026-10-29", now: "2026-10-29T08:00:00Z", tasks, events });
const render = (props: Partial<Parameters<typeof KarneDocument>[0]> = {}) =>
  renderToStaticMarkup(<KarneDocument summary={summary} studentName="Ayşe Yılmaz" classLabel="11-A" {...props} />);

describe("the Karne document", () => {
  const html = render({ coachNote: "Bu dönem çok düzenliydi.", approval: { approvedAt: "2026-10-30T10:00:00Z", cycleNumber: 3 } });

  it("names the student and the period, and says when it is a coach-approved card", () => {
    expect(html).toContain("Ayşe Yılmaz");
    expect(html).toContain("11-A");
    expect(html).toContain("01 Eki – 28 Eki 2026");
    expect(html).toContain("Koç onaylı");
    expect(html).toContain("3. dönem");
  });

  it("shows the four showcase tiles", () => {
    for (const label of ["Program tamamlama", "Çözülen soru", "Etkinlik katılımı", "Tutarlılık"]) expect(html).toContain(label);
    // questions: 20 + exam answers; D / Y / B
    expect(html).toContain("✓");
    expect(html).toContain("✗");
    expect(html).toContain("○");
    // consistency
    expect(html).toContain("gün çalıştı");
  });

  it("gives the study time its own prominent block, stated explicitly as tracked (kronometre) time", () => {
    expect(html).toContain("Toplam çalışma süresi");
    expect(html).toContain("kronometre");
    // 2480 minutes tracked in the period
    expect(html).toContain("41 sa 20 dk");
    expect(html).toContain("Toplam 41 sa 20 dk kronometre ile çalıştı");
    expect(html).toContain("hedeflenen süre değildir");
  });

  it("every change carries a symbol and the words 'geçen döneme göre' (not colour alone)", () => {
    expect(html).toMatch(/[▲▼] [+−]/);
    expect(html).toContain("geçen döneme göre");
  });

  it("has the weekly momentum chart with the period's weeks drawn thick and the earlier ones thin", () => {
    expect(html).toContain("İvme");
    expect(html).toContain('aria-label="Haftalık program tamamlama yüzdesi"');
    // the period's weeks: thick line and large dots; the earlier weeks: small grey dots (and thin lines between consecutive ones)
    expect(html).toContain('stroke-width="3.5"');
    expect(html).toContain('r="4"');
    expect(html).toContain('r="2.5"');
  });

  it("shows the ONE coach note when there is one, and nothing when there is not", () => {
    expect(html).toContain("Koçun Notu");
    expect(html).toContain("Bu dönem çok düzenliydi.");
    const without = render({ coachNote: null });
    expect(without).not.toContain("Koçun Notu");
  });

  it("the exam overview is high level: exams with nets, averages and main-branch bars -- no topics", () => {
    expect(html).toContain("Deneme Özeti");
    expect(html).toContain("TYT Genel Deneme");
    expect(html).toContain("AYT Genel Deneme");
    expect(html).toContain("Dönem ortalaması");
    expect(html).toContain("Ana branş ortalamaları");
    // AYT branches appear because the period has an AYT exam
    expect(html).toContain("Fizik");
    expect(html).not.toMatch(/Konu Bazlı|Hata Sıklığı|Gelişim Haritası|Detaylı Analiz/);
  });

  it("lists the event attendance with the softened wording, and no link to the old detailed pages", () => {
    expect(html).toContain("Etkinlik Katılımı");
    expect(html).toContain("1. Oturum");
    expect(html).toContain("Katılım bildirilmişti; 1 oturuma katılım sağlamadı.");
    expect(html).not.toContain("kaydı yok");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/karne/");
  });

  it("is marked for A4 printing; the exam and event sections exist only when the period has exams / events", () => {
    expect(html).toContain("karne-doc");
    const quiet = computeKarneSummary({ rangeStart: RANGE.start, rangeEnd: RANGE.end, today: "2026-10-29", now: "2026-10-29T08:00:00Z", tasks: [tasks[0]], events: [] });
    const one = renderToStaticMarkup(<KarneDocument summary={quiet} studentName="A" />);
    expect(one).not.toContain("Deneme Özeti");
    expect(one).not.toContain("Etkinlik Katılımı</h3>");
  });

  it("the momentum chart is titled with 'yüzdesi'", () => {
    expect(html).toContain("İvme — haftalık program tamamlama yüzdesi");
  });

  it("shows the questions BY COURSE: Toplam, ✓, ✗, ○ for each course -- and nothing at topic level", () => {
    expect(html).toContain("Ders bazında çözülen soru");
    expect(html).toMatch(/TYT Matematik<\/td><td[^>]*>20<\/td><td[^>]*>15<\/td><td[^>]*>3<\/td><td[^>]*>2<\/td>/);
    expect(html).toContain("Genel Deneme");
    expect(html).not.toMatch(/Konu|Ünite|topic/i);
  });

  it("states where the numbers come from: live, or frozen at approval for the parent", () => {
    expect(render()).toContain("Veriler güncel kayıtlardan hesaplanmıştır.");
    expect(render({ frozen: true })).toContain("onayladığı tarihteki verileri gösterir");
    expect(html).toContain("Yoklaması alınmayan oturumlar katılım oranına dahil edilmez");
  });

  it("an empty period still renders: dashes and honest empty states, no NaN", () => {
    const empty = computeKarneSummary({ rangeStart: RANGE.start, rangeEnd: RANGE.end, today: "2026-10-29", now: "2026-10-29T08:00:00Z", tasks: [], events: [] });
    const out = renderToStaticMarkup(<KarneDocument summary={empty} studentName="Ayşe" />);
    expect(out).not.toContain("NaN");
    expect(out).toContain("Bu dönemde yoklaması alınan etkinlik yok");
    expect(out).toContain("Bu dönem için görev verisi yok.");
    expect(out).toContain("0 dk");
  });
});

describe("the document stays an executive summary (1-2 pages)", () => {
  it("contains no detailed-analysis components or data (topic heat map, topic lists, per-topic mistakes)", () => {
    const src = readFileSync(new URL("../components/karne-document.tsx", import.meta.url), "utf8");
    for (const forbidden of ["TopicGrid", "KarneTopicRow", "topic_mistakes", "topicRows", "CourseTabs", "gelisim-haritasi", "heatTier", "HEAT_TIER"]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
    // it only knows the summary, the event card pieces and layout primitives
    const imports = src.match(/from "[^"]+"/g) ?? [];
    expect(imports).not.toContainEqual(expect.stringMatching(/curriculum|gelisim|topic/));
  });

  it("nothing is truncated: every course, every exam and every event of the period is shown", () => {
    const manyExams: KarneSummaryTask[] = Array.from({ length: 9 }, (_, i) =>
      task({
        task_date: `2026-10-${String(1 + i * 3).padStart(2, "0")}`,
        task_type: "general_exam",
        title: `TYT Genel Deneme ${i + 1}`,
        subject_scores: { turkce: { correct: 20 + i, wrong: 5, empty: 5 } },
      }),
    );
    const manyEvents = buildParentEventAttendance({
      announcements: Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, title: `Etkinlik ${i}`, event_date: `2026-10-${String(2 + i).padStart(2, "0")}` })),
      configs: [],
      attendance: Array.from({ length: 7 }, (_, i) => ({ announcement_id: `e${i}`, session_number: 1, status: "attended" as const, marked_at: "2026-10-05T10:00:00Z" })),
      rsvps: [],
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
    });
    const manyCourses: KarneSummaryTask[] = Array.from({ length: 14 }, (_, i) =>
      task({ task_date: "2026-10-02", course_id: `tyt-ders-${i}`, correct_count: 10 + i, wrong_count: 2, empty_count: 1 }),
    );
    const big = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: "2026-10-29",
      now: "2026-10-29T08:00:00Z",
      tasks: [...manyExams, ...manyCourses],
      events: manyEvents,
    });
    // 14 courses + the Genel Deneme row
    expect(big.questions.byCourse).toHaveLength(15);
    const out = renderToStaticMarkup(<KarneDocument summary={big} studentName="A" />);
    // all 9 exams, all 7 events, all 14 courses
    expect(out.match(/TYT Genel Deneme \d/g)).toHaveLength(9);
    expect(out.match(/Etkinlik \d/g)).toHaveLength(7);
    expect((out.match(/Tyt ders \d+|TYT ders \d+/gi) ?? []).length).toBe(14);
    // no folding / cut-off wording anywhere
    expect(out).not.toMatch(/Diğer dersler|deneme gösteriliyor|etkinlik daha/);
  });
});

describe("period handling", () => {
  it("validates ?from=&to= and rejects what would be absurd", () => {
    const today = "2026-10-29";
    expect(parsePeriod("2026-10-01", "2026-10-28", today)).toEqual({ from: "2026-10-01", to: "2026-10-28" });
    expect(parsePeriod("2026-10-28", "2026-10-01", today)).toBeNull(); // reversed
    expect(parsePeriod("2025-01-01", "2026-10-28", today)).toBeNull(); // longer than a year
    expect(parsePeriod("2026-10-01", "2027-06-01", today)).toBeNull(); // far in the future
    expect(parsePeriod("2026-02-30", "2026-03-10", today)).toBeNull(); // not a real date
    expect(parsePeriod(undefined, "2026-10-01", today)).toBeNull();
    expect(isIsoDate("2026-10-01")).toBe(true);
    expect(isIsoDate("1.10.2026")).toBe(false);
  });

  it("offers last 28 days / this month / last month", () => {
    const p = presetPeriods("2026-10-15");
    expect(p.map((x) => x.key)).toEqual(["last28", "thisMonth", "lastMonth"]);
    expect(p[0].period).toEqual({ from: "2026-09-18", to: "2026-10-15" });
    expect(p[1].period).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(p[2].period).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(samePeriod(p[1].period, { from: "2026-10-01", to: "2026-10-15" })).toBe(true);
    expect(formatPeriod("2026-12-20", "2027-01-10")).toBe("20 Ara 2026 – 10 Oca 2027");
  });

  it("the picker is a hidden-when-printing filter with the period chips and a custom range", () => {
    const html = renderToStaticMarkup(
      <KarnePeriodPicker
        period={{ from: "2026-10-01", to: "2026-10-28" }}
        today="2026-10-29"
        basePath="/student/deneme-analizleri/karne"
        options={[
          { key: "c1", label: "3. Dönem", hint: "onaylı", period: { from: "2026-10-01", to: "2026-10-28" } },
          ...presetPeriods("2026-10-29").map((p) => ({ key: p.key, label: p.label, period: p.period })),
        ]}
      />,
    );
    expect(html).toContain("print:hidden");
    expect(html).toContain("3. Dönem");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Son 28 gün");
    expect(html).toContain('type="date"');
    expect(html).toContain("/student/deneme-analizleri/karne?from=2026-10-01&amp;to=2026-10-28");
  });
});

describe("print setup", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  it("prints on A4 portrait with the light colours pinned (dark theme must not print white-on-white)", () => {
    expect(css).toContain("@page karne");
    expect(css).toMatch(/@page karne \{[^}]*size: A4 portrait/);
    expect(css).toMatch(/\.karne-doc \{[^}]*page: karne;[^}]*--background: #ffffff;[^}]*--foreground: #18181b/);
    expect(css).toContain("print-color-adjust: exact");
  });

  it("prints ONLY the document: everything on the page that is not the Karne (or around it) is removed from the sheet", () => {
    // the coach's page also holds the header, other tabs and the whole report-card list; window.print() used to print all of it (7 pages)
    expect(css).toMatch(/body:has\(\.karne-doc\) \*:not\(:has\(\.karne-doc\)\):not\(\.karne-doc\):not\(\.karne-doc \*\) \{\s*display: none !important;/);
  });
});

describe("wiring on the three panels", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the student's Karnelerim is the document with the live period picker", () => {
    const src = read("../app/student/deneme-analizleri/karne/page.tsx");
    expect(src).toContain("<KarneDocument");
    expect(src).toContain("<KarnePeriodPicker");
    expect(src).toContain("fetchKarneSummary");
  });

  it("the parent's Karne reads ONLY approved cards, from the frozen snapshot, with no free date picking", () => {
    const src = read("../app/parent/karne/page.tsx");
    expect(src).toContain('.eq("status", "approved")');
    expect(src).toContain("executive_summary");
    expect(src).toContain("frozen={snapshot !== null}");
    expect(src).not.toContain("KarnePeriodPicker");
    expect(src).not.toContain('type="date"');
  });

  it("the coach's Karneler tab shows the document above the existing cycle list", () => {
    const src = read("../app/coach/students/[id]/_components/karneler-tab.tsx");
    expect(src).toContain("<KarneLiveSection");
    const live = read("../app/coach/students/[id]/_components/karne-live-section.tsx");
    expect(live).toContain("<KarneDocument");
    expect(live).toContain("getKarneSummary");
  });
});
