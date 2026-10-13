import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { StudentTimelineCard } from "@/app/coach/students/[id]/_components/student-timeline-card";

// The coach's notes card is collapsed on every load, so a note meant for the parents is never on screen by accident while the
// coach shares a screen with the student.

const note = (id: string, content: string, over: Record<string, unknown> = {}) => ({
  id,
  type: "parent_meeting",
  guardian_descriptor: "Anne",
  content,
  created_at: "2026-10-10T10:00:00Z",
  parent_share_status: "none",
  admin_revision_note: null,
  ...over,
});
const missed = {
  id: "s1",
  scheduled_at: "2026-10-12T10:00:00Z",
  outcome: "not_happened",
  evaluation_notes: null,
  missed_reason: "student_no_show",
  missed_reason_note: "GIZLI-NEDEN-NOTU",
  is_paid: false,
};

const render = (hasMore = false) =>
  renderToStaticMarkup(
    <StudentTimelineCard
      studentId="st1"
      notes={[note("n1", "GIZLI-NOT-ICERIGI"), note("n2", "ikinci not")] as never}
      sessions={[missed] as never}
      initialHasMore={hasMore}
    />,
  );

describe("StudentTimelineCard: collapsed by default", () => {
  const html = render();

  it("starts closed: the toggle says so, and no note, reason or form is rendered at all", () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Notları Göster");
    expect(html).not.toContain("Notları Gizle");
    expect(html).not.toContain("GIZLI-NOT-ICERIGI");
    expect(html).not.toContain("ikinci not");
    expect(html).not.toContain("GIZLI-NEDEN-NOTU");
    expect(html).not.toContain("Veli Görüşmesi");
    expect(html).not.toContain('id="student-timeline-content"');
  });

  it("shows how many records there are (notes + missed sessions), with a + while more can be loaded", () => {
    expect(html).toContain("3 kayıt");
    expect(render(true)).toContain("3+ kayıt");
  });

  it("keeps 'Not Ekle' available while closed", () => {
    expect(html).toContain("Not Ekle");
  });

  it("the open state is plain component state: nothing is remembered between loads", () => {
    const src = readFileSync(new URL("../app/coach/students/[id]/_components/student-timeline-card.tsx", import.meta.url), "utf8");
    expect(src).toContain("const [open, setOpen] = useState(false);");
    expect(src).toContain("{open && (");
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});
