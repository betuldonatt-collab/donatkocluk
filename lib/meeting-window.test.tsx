import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("../app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { MeetingBanner } from "@/app/coach/dashboard/_components/meeting-banner";
import { NextSessionCard } from "@/app/student/_components/next-session-card";
import type { CoachingSession } from "@/app/coach/dashboard/types";
import { canConfirmMeeting, confirmOpensAt, meetingJoinState } from "./meeting-window";

const START = new Date("2026-10-08T14:00:00.000Z");
const at = (minutes: number, seconds = 0) => new Date(START.getTime() + (minutes * 60 + seconds) * 1000);

describe("meetingJoinState: Görüşmeye Katıl is live for exactly 10 minutes from the scheduled start", () => {
  it("not active before the start, even one millisecond before", () => {
    expect(meetingJoinState(START, at(-60))).toBe("before");
    expect(meetingJoinState(START, at(-1))).toBe("before");
    expect(meetingJoinState(START, new Date(START.getTime() - 1))).toBe("before");
  });

  it("active from exactly the start", () => {
    expect(meetingJoinState(START, START)).toBe("open");
    expect(meetingJoinState(START, at(5))).toBe("open");
    expect(meetingJoinState(START, at(9, 59))).toBe("open");
  });

  it("closed from exactly 10 minutes on", () => {
    expect(meetingJoinState(START, at(10))).toBe("closed");
    expect(meetingJoinState(START, at(10, 1))).toBe("closed");
    expect(meetingJoinState(START, at(180))).toBe("closed");
  });

  it("accepts an ISO string or a timestamp as the start", () => {
    expect(meetingJoinState(START.toISOString(), START)).toBe("open");
    expect(meetingJoinState(START.getTime(), at(11))).toBe("closed");
  });
});

describe("canConfirmMeeting: Görüşme gerçekleşti mi? only strictly after start + 30 minutes", () => {
  it("hidden before, at the start, during the join window and at exactly 30:00", () => {
    for (const t of [at(-5), START, at(10), at(29), at(29, 59), at(30)]) expect(canConfirmMeeting(START, t)).toBe(false);
  });

  it("available from one second past the 30th minute on", () => {
    expect(canConfirmMeeting(START, at(30, 1))).toBe(true);
    expect(canConfirmMeeting(START, new Date(at(30).getTime() + 1))).toBe(true);
    expect(canConfirmMeeting(START, at(90))).toBe(true);
  });

  it("confirmOpensAt is the start plus 30 minutes", () => {
    expect(confirmOpensAt(START).getTime()).toBe(at(30).getTime());
  });
});

describe("the two panels", () => {
  afterEach(() => vi.useRealTimers());

  const session = {
    id: "s1",
    student_id: "st1",
    scheduled_at: START.toISOString(),
    meeting_url: "https://meet.example/abc",
    outcome: "pending",
  } as unknown as CoachingSession;
  const roster = [{ id: "st1", full_name: "Ayşe Yılmaz" }] as never;

  function banner(now: Date) {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return renderToStaticMarkup(<MeetingBanner session={session} roster={roster} onEvaluated={() => {}} />);
  }
  function card(now: Date, url: string | null = "https://meet.example/abc") {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return renderToStaticMarkup(<NextSessionCard scheduledAt={START.toISOString()} meetingUrl={url} />);
  }
  const activeJoin = (html: string) => html.includes('href="https://meet.example/abc"');
  const joinButtonDisabled = (html: string) => /<button[^>]*disabled[^>]*>[^]*?Görüşmeye Katıl/.test(html);

  it("coach, before the start: the join button is there but not active, and the evaluation is hidden", () => {
    const html = banner(at(-5));
    expect(html).toContain("Sıradaki Görüşme");
    expect(activeJoin(html)).toBe(false);
    expect(joinButtonDisabled(html)).toBe(true);
    expect(html).not.toContain("Görüşme Gerçekleşti");
  });

  it("coach, in the 10 minutes from the start: the join link is live, the evaluation is still hidden", () => {
    for (const t of [START, at(5), at(9, 59)]) {
      const html = banner(t);
      expect(activeJoin(html), String(t)).toBe(true);
      expect(html).not.toContain("Görüşme Gerçekleşti");
    }
  });

  it("coach, from 10 to 30 minutes: no join button any more, no evaluation yet -- with a hint when it opens", () => {
    for (const t of [at(10), at(20), at(30)]) {
      const html = banner(t);
      expect(activeJoin(html), String(t)).toBe(false);
      expect(html).not.toContain("Görüşmeye Katıl");
      expect(html).not.toContain("Görüşme Gerçekleşti");
      expect(html).toContain("Katılım süresi doldu");
      expect(html).toContain("sonrasında");
    }
  });

  it("coach, after 30 minutes: the evaluation (Görüşme Gerçekleşti / Gerçekleşmedi) appears", () => {
    const html = banner(at(30, 1));
    expect(html).toContain("Görüşme Değerlendirmesi Bekliyor");
    expect(html).toContain("Görüşme Gerçekleşti");
    expect(html).toContain("Görüşme Gerçekleşmedi");
    expect(activeJoin(html)).toBe(false);
  });

  it("student, before the start: disabled; in the window: live; afterwards: gone", () => {
    const before = card(at(-1));
    expect(activeJoin(before)).toBe(false);
    expect(joinButtonDisabled(before)).toBe(true);

    for (const t of [START, at(5), at(9, 59)]) expect(activeJoin(card(t)), String(t)).toBe(true);

    for (const t of [at(10), at(25), at(120)]) {
      const html = card(t);
      expect(activeJoin(html), String(t)).toBe(false);
      expect(html).not.toContain("Görüşmeye Katıl");
      expect(html).toContain("Katılım süresi doldu");
    }
  });

  it("student, with no meeting link: never an active join button", () => {
    expect(activeJoin(card(at(5), null))).toBe(false);
    expect(joinButtonDisabled(card(at(5), null))).toBe(true);
  });
});
