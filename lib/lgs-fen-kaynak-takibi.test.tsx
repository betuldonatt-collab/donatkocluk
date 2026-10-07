import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/student/kaynak-takibi/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { EditableCourseTable } from "@/app/coach/students/[id]/_components/editable-course-table";
import { CourseTable } from "@/app/student/kaynak-takibi/_components/course-table";
import { findCourseById } from "./curriculum";
import { unitTotalTopicIds } from "./curriculum/topic-groups";

const zero = { total: 0, correct: 0, wrong: 0, empty: 0 };
const course = (id: string) => findCourseById(id)!;

function render(courseId: string, byTopic: Record<string, typeof zero>, student: boolean) {
  const c = course(courseId);
  const topicStats = { byTopic, karma: zero };
  return renderToStaticMarkup(
    student ? (
      <CourseTable course={c} resources={[{ id: "r1", name: "Kaynak A" }]} progress={{}} topicStats={topicStats} onAddResource={async () => {}} onToggle={() => {}} />
    ) : (
      <EditableCourseTable
        course={c}
        resources={[{ id: "r1", name: "Kaynak A", is_active: true }]}
        progress={{}}
        topicStats={topicStats}
        onAddResource={() => {}}
        onToggle={() => {}}
        onArchiveResource={() => {}}
        onReactivateResource={() => {}}
        onDeleteResource={async () => {}}
      />
    ),
  );
}

// Ünite 1's "(Genel)" master holds the migrated whole-unit numbers; its first Konu has its own; Ünite 2 has nothing yet.
const FEN_STATS = {
  "lgs-fen-bilimleri-genel-u0": { total: 20, correct: 15, wrong: 4, empty: 1 },
  "lgs-fen-bilimleri-u0-t0": { total: 10, correct: 7, wrong: 2, empty: 1 },
};

describe("LGS Fen Bilimleri Kaynak Takibi: the unit total under the vertical Ünite label", () => {
  it("which topics a unit total sums: the master and every raw topic of the unit's Konu -- Fen only", () => {
    const ids = unitTotalTopicIds(course("lgs-fen-bilimleri"));
    expect([...ids.keys()]).toHaveLength(7);
    expect(ids.get("1. Ünite: Mevsimler ve İklim")).toEqual(["lgs-fen-bilimleri-genel-u0", "lgs-fen-bilimleri-u0-t0", "lgs-fen-bilimleri-u0-t1"]);
    for (const id of ["lgs-matematik", "lgs-din-kulturu", "lgs-turkce", "lgs-inkilap-tarihi", "lgs-ingilizce", "tyt-fizik", "tyt-matematik"]) {
      expect(unitTotalTopicIds(course(id)).size, id).toBe(0);
    }
  });

  it.each([
    ["student", true],
    ["coach", false],
  ])("%s table: Konu rows + vertical Ünite label with the unit's total (master numbers included); no parent / (Genel) row", (_who, student) => {
    const html = render("lgs-fen-bilimleri", FEN_STATS, student);
    // only the unit with numbers shows a total: 20 + 10 = 30 questions, 15 + 7 = 22 correct, 4 + 2 = 6 wrong, 1 + 1 = 2 empty
    expect(html.match(/data-unit-total/g)).toHaveLength(1);
    const total = html.slice(html.indexOf("data-unit-total"));
    expect(total).toContain("T 30");
    expect(total).toContain("D 22");
    expect(total).toContain("Y 6");
    expect(total).toContain("B 2");
    // the clean layout: no "(Genel)" row, no gray parent row
    expect(html).not.toContain("(Genel)");
    expect(html).not.toContain("data-topic-group-parent");
    expect(html).toContain("Mevsimlerin Oluşumu");
    expect(html).toContain("İklim ve Hava Hareketleri");
    // the vertical label is still there, and the Konu row keeps its own numbers
    expect(html).toContain("1. Ünite: Mevsimler ve İklim");
  });

  it.each([
    ["student", true],
    ["coach", false],
  ])("%s table: no total line when the unit has no numbers; none for any other course", (_who, student) => {
    expect(render("lgs-fen-bilimleri", {}, student)).not.toContain("data-unit-total");
    for (const id of ["lgs-matematik", "lgs-din-kulturu", "lgs-turkce"]) {
      const first = course(id).units[0].topics[0].id;
      expect(render(id, { [first]: { total: 5, correct: 3, wrong: 1, empty: 1 } }, student), id).not.toContain("data-unit-total");
    }
  });

  it("other levels keep their parent rows (this change is Fen-only)", () => {
    expect(render("tyt-fizik", {}, true)).toContain("data-topic-group-parent");
    expect(render("tyt-fizik", {}, false)).toContain("data-topic-group-parent");
  });
});
