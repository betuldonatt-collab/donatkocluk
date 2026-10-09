import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/events/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("../app/coach/events/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/school-exam-actions", () => ({ decideCourseRemoval: vi.fn() }));
vi.mock("@/app/coach/school-grade-actions", () => ({ saveSchoolGradeForStudent: vi.fn(), setSchoolGradeLock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { Dialog } from "@/components/ui/dialog";
import { RollCall, type RollCallStudent } from "@/app/coach/events/_components/attendance-dialog";
import { SessionDots } from "@/app/coach/events/_components/event-attendance-section";
import { EventAttendanceCard } from "@/components/event-attendance-card";
import { KarneDetailClient as StudentKarneDetail } from "@/app/student/deneme-analizleri/karne/[id]/karne-detail-client";
import { KarneDetailClient as ParentKarneDetail } from "@/app/parent/karne/[id]/karne-detail-client";
import { ReportCardReview } from "@/app/coach/students/[id]/_components/karneler-tab";
import { buildParentEventAttendance, eventsInRange } from "@/lib/event-attendance";

const students: RollCallStudent[] = [
  { studentId: "s1", studentName: "Ayşe Yılmaz", rsvp: "attending", marks: { 1: "attended", 2: "not_attended" } },
  { studentId: "s2", studentName: "Mehmet Kaya", rsvp: "not_attending", marks: {} },
  { studentId: "s3", studentName: "Zeynep Demir", rsvp: null, marks: {} },
];

describe("the coach's roll call (Yoklama Al)", () => {
  it("first asks how many sessions the event has (an event with no roll call yet)", () => {
    const html = renderToStaticMarkup(
      <Dialog open>
        <RollCall eventId="e1" eventTitle="Seminer" savedSessionCount={null} students={students} onSaved={() => {}} />
      </Dialog>,
    );
    expect(html).toContain("Bu etkinlik kaç oturumdan oluşuyor?");
    expect(html).toContain('type="number"');
    expect(html).toContain("Devam");
    // no checklist yet
    expect(html).not.toContain("Hepsi geldi");
  });

  it("with a saved count it opens the checklist: one column per session, Geldi / Gelmedi for each student in each session", () => {
    const html = renderToStaticMarkup(
      <Dialog open>
        <RollCall eventId="e1" eventTitle="Seminer" savedSessionCount={3} students={students} onSaved={() => {}} />
      </Dialog>,
    );
    for (const n of [1, 2, 3]) expect(html).toContain(`${n}. Oturum`);
    expect(html).not.toContain("4. Oturum");
    for (const name of ["Ayşe Yılmaz", "Mehmet Kaya", "Zeynep Demir"]) {
      for (const n of [1, 2, 3]) {
        expect(html).toContain(`${name} — ${n}. oturum: Geldi`);
        expect(html).toContain(`${name} — ${n}. oturum: Gelmedi`);
      }
    }
    // the saved marks are pre-filled: Ayşe attended session 1 and missed session 2
    expect(html).toMatch(/aria-pressed="true" aria-label="Ayşe Yılmaz — 1\. oturum: Geldi"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Ayşe Yılmaz — 2\. oturum: Gelmedi"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Mehmet Kaya — 1\. oturum: Geldi"/);
    // each student's RSVP is shown next to the name, and there is a Kaydet button and a way back to the count
    expect(html).toContain("Katılacağım");
    expect(html).toContain("Katılmayacağım");
    expect(html).toContain("Yanıt vermedi");
    expect(html).toContain("Kaydet");
    expect(html).toContain("Oturum sayısını değiştir");
    expect(html).toContain("2 / 9 işaretlendi");
  });

  it("the roster list shows one dot per session", () => {
    const html = renderToStaticMarkup(<SessionDots marks={{ 1: "attended", 3: "not_attended" }} sessionCount={3} />);
    expect(html).toContain("1. oturum: Geldi");
    expect(html).toContain("2. oturum: işaretlenmedi");
    expect(html).toContain("3. oturum: Gelmedi");
  });
});

describe("the parent's report card: Etkinlik Katılımı", () => {
  const build = (rsvp: "attending" | "not_attending" | null, statuses: ("attended" | "not_attended")[]) =>
    buildParentEventAttendance({
      announcements: [{ id: "a1", title: "Deneme Semineri", event_date: "2026-10-05" }],
      configs: [{ announcement_id: "a1", session_count: statuses.length }],
      attendance: statuses.map((status, i) => ({ announcement_id: "a1", session_number: i + 1, status, marked_at: "2026-10-05T10:00:00Z" })),
      rsvps: rsvp ? [{ announcement_id: "a1", response: rsvp, decline_reason: null }] : [],
      rangeStart: "2026-10-01",
      rangeEnd: "2026-10-31",
    });

  it("shows the session-by-session breakdown with the student's RSVP (Example A: 1. Oturum: Katıldı, 2. Oturum: Katılmadı)", () => {
    const html = renderToStaticMarkup(<EventAttendanceCard events={build("attending", ["attended", "not_attended"])} />);
    expect(html).toContain("Etkinlik Katılımı");
    expect(html).toContain("Deneme Semineri");
    expect(html).toMatch(/1\. Oturum:[\s\S]*?Katıldı/);
    expect(html).toMatch(/2\. Oturum:[\s\S]*?Katılmadı/);
    expect(html).toContain("Öğrencinin yanıtı:");
    expect(html).toContain("Katılacağım");
    expect(html).toContain("2 oturumdan 1 tanesine katıldı");
  });

  it("CRITICAL: said 'Katılacağım' but was absent -> the explicit warning", () => {
    const html = renderToStaticMarkup(<EventAttendanceCard events={build("attending", ["not_attended", "not_attended"])} />);
    expect(html).toContain("Katılacağını belirtti ancak katılmadı.");
    expect(html).toContain('role="alert"');
  });

  it("no warning when they never said they would come, said no, or actually attended", () => {
    for (const events of [build(null, ["not_attended"]), build("not_attending", ["not_attended"]), build("attending", ["attended", "attended"])]) {
      const html = renderToStaticMarkup(<EventAttendanceCard events={events} />);
      expect(html).not.toContain("Katılacağını belirtti ancak");
      expect(html).not.toContain('role="alert"');
    }
  });

  it("a partial absence gets the milder note, not the red alert", () => {
    const html = renderToStaticMarkup(<EventAttendanceCard events={build("attending", ["attended", "not_attended", "not_attended"])} />);
    expect(html).toContain("Katılacağını belirtti ancak 2 oturuma katılmadı.");
    expect(html).not.toContain('role="alert"');
  });

  it("is not shown at all when the period has no event attendance", () => {
    expect(renderToStaticMarkup(<EventAttendanceCard events={[]} />)).toBe("");
  });
});

describe("locking (Kilitle)", () => {
  const html = (locked: boolean) =>
    renderToStaticMarkup(
      <Dialog open>
        <RollCall eventId="e1" eventTitle="Seminer" savedSessionCount={2} locked={locked} students={students} onSaved={() => {}} />
      </Dialog>,
    );

  it("an open roll call offers Kaydet and Kilitle, and its marks can be changed", () => {
    const out = html(false);
    expect(out).toContain("Kilitle");
    expect(out).toContain("Kaydet");
    expect(out).not.toContain("kilitlendi");
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Ayşe Yılmaz — 1\. oturum: Geldi"/);
  });

  it("a locked roll call is read-only: banner, every Geldi/Gelmedi button disabled, no Kaydet, no Kilitle, no way to change the session count", () => {
    const out = html(true);
    expect(out).toContain("Bu etkinliğin yoklaması kilitlendi");
    expect(out).toContain("yoklama kilitli, salt okunur");
    const cellButtons = out.match(/<button[^>]*aria-label="[^"]+ — \d\. oturum: (?:Geldi|Gelmedi)"[^>]*>/g) ?? [];
    expect(cellButtons).toHaveLength(3 * 2 * 2);
    for (const b of cellButtons) expect(b, b).toContain("disabled");
    expect(out).not.toContain("Kaydet");
    expect(out).not.toContain(">Kilitle<");
    expect(out).not.toContain("Oturum sayısını değiştir");
    // the saved marks are still shown
    expect(out).toMatch(/aria-pressed="true"[^>]*aria-label="Ayşe Yılmaz — 1\. oturum: Geldi"|aria-label="Ayşe Yılmaz — 1\. oturum: Geldi"[^>]*aria-pressed="true"/);
  });
});

describe("the same Etkinlik Katılımı section on every report card view", () => {
  const events = buildParentEventAttendance({
    announcements: [{ id: "a1", title: "Deneme Semineri", event_date: "2026-10-05" }],
    configs: [{ announcement_id: "a1", session_count: 2 }],
    attendance: [
      { announcement_id: "a1", session_number: 1, status: "attended", marked_at: "2026-10-05T10:00:00Z" },
      { announcement_id: "a1", session_number: 2, status: "not_attended", marked_at: "2026-10-05T10:00:00Z" },
    ],
    rsvps: [{ announcement_id: "a1", response: "attending", decline_reason: null }],
    rangeStart: "2026-10-01",
    rangeEnd: "2026-10-31",
  });

  it("shows the event title and the event date explicitly next to the session records", () => {
    const out = renderToStaticMarkup(<EventAttendanceCard events={events} />);
    expect(out).toContain("Etkinlik");
    expect(out).toContain("Deneme Semineri");
    expect(out).toContain("Etkinlik Tarihi:");
    expect(out).toContain("5 Ekim 2026");
  });

  const detailProps = {
    cycleNumber: 1,
    rangeStart: "2026-10-01",
    rangeEnd: "2026-10-31",
    approvedAt: "2026-10-31T10:00:00Z",
    coachNotes: null,
    stats: { tyt: { current: 40, previous: null }, ayt: { current: 30, previous: null } } as never,
    topicRows: [],
  };

  it("the parent's karne has it", () => {
    const out = renderToStaticMarkup(<ParentKarneDetail {...detailProps} eventAttendance={events} />);
    expect(out).toContain("Etkinlik Katılımı");
    expect(out).toContain("Deneme Semineri");
  });

  it("the student's karne has it", () => {
    const out = renderToStaticMarkup(<StudentKarneDetail {...detailProps} eventAttendance={events} />);
    expect(out).toContain("Etkinlik Katılımı");
    expect(out).toContain("Deneme Semineri");
    expect(out).toContain("Etkinlik Tarihi:");
    expect(out).toMatch(/1\. Oturum:[\s\S]*?Katıldı/);
  });

  it("the coach's karne has it, and shows only the events of that card's period", () => {
    const cycle = {
      id: "c1",
      cycle_number: 1,
      range_start: "2026-10-01",
      range_end: "2026-10-31",
      status: "approved",
      approved_at: "2026-10-31T10:00:00Z",
      coach_notes: null,
      stats: detailProps.stats,
      topic_mistakes: [],
      generated_at: "2026-10-31T10:00:00Z",
    } as never;
    const inPeriod = renderToStaticMarkup(<ReportCardReview cycle={cycle} eventAttendance={eventsInRange(events, "2026-10-01", "2026-10-31")} onApproved={() => {}} onDeleted={() => {}} />);
    expect(inPeriod).toContain("Etkinlik Katılımı");
    expect(inPeriod).toContain("Deneme Semineri");
    const otherPeriod = renderToStaticMarkup(<ReportCardReview cycle={cycle} eventAttendance={eventsInRange(events, "2026-11-01", "2026-11-30")} onApproved={() => {}} onDeleted={() => {}} />);
    expect(otherPeriod).not.toContain("Etkinlik Katılımı");
  });

  it("no event in the period: the section is not shown on any of them", () => {
    expect(renderToStaticMarkup(<StudentKarneDetail {...detailProps} eventAttendance={[]} />)).not.toContain("Etkinlik Katılımı");
    expect(renderToStaticMarkup(<ParentKarneDetail {...detailProps} />)).not.toContain("Etkinlik Katılımı");
  });
});
