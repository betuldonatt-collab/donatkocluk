import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/student/kaynak-takibi/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { EditableCourseTable } from "@/app/coach/students/[id]/_components/editable-course-table";
import { CourseTable } from "@/app/student/kaynak-takibi/_components/course-table";
import { findCourseById } from "./curriculum";
import { unitLevelGroups } from "./curriculum/topic-groups";
import { inheritUnitLevelSteps, PIPELINE_CONFIG, summarizePipeline, type PipelineMap } from "./topic-pipeline";
import { kaynakTakibiRows } from "./curriculum/rows";

const zero = { total: 0, correct: 0, wrong: 0, empty: 0 };
const course = (id: string) => findCourseById(id)!;
const FEN = "lgs-fen-bilimleri";
const KONU_COUNTS = [2, 5, 4, 6, 6, 4, 3]; // Ünite 1..7

type Stats = Record<string, typeof zero>;

function render(courseId: string, byTopic: Stats, student: boolean, progress: Record<string, { solved: boolean; reviewed: boolean }> = {}, pipelineMap: PipelineMap = {}) {
  const c = course(courseId);
  const topicStats = { byTopic, karma: zero };
  const pipeline = { config: PIPELINE_CONFIG.LGS, map: pipelineMap, onToggle: () => {} };
  return renderToStaticMarkup(
    student ? (
      <CourseTable course={c} resources={[{ id: "r1", name: "Kaynak A" }]} progress={progress} topicStats={topicStats} onAddResource={async () => {}} onToggle={() => {}} pipeline={pipeline} />
    ) : (
      <EditableCourseTable
        course={c}
        resources={[{ id: "r1", name: "Kaynak A", is_active: true }]}
        progress={progress}
        topicStats={topicStats}
        onAddResource={() => {}}
        onToggle={() => {}}
        onArchiveResource={() => {}}
        onReactivateResource={() => {}}
        onDeleteResource={async () => {}}
        pipeline={pipeline}
      />
    ),
  );
}

// Ünite 1's "(Genel)" master holds the migrated whole-unit numbers and ticks; its first Konu has numbers of its own.
const FEN_STATS: Stats = {
  "lgs-fen-bilimleri-genel-u0": { total: 20, correct: 15, wrong: 4, empty: 1 },
  "lgs-fen-bilimleri-u0-t0": { total: 10, correct: 7, wrong: 2, empty: 1 },
};
const FEN_PROGRESS = { "lgs-fen-bilimleri-genel-u0::r1": { solved: true, reviewed: false } };
const FEN_PIPELINE: PipelineMap = {
  "lgs-fen-bilimleri-genel-u0": { meb_kaynagi: true },
  "lgs-fen-bilimleri-u0-t0": { okul_ilerlemesi: true },
};

function tags(html: string, name: string) {
  return html.split(`<${name}`).slice(1).map((t) => `<${name}${t.slice(0, t.indexOf(">") + 1)}`);
}
function checkbox(html: string, labelPart: string) {
  const found = tags(html, "button").filter((t) => t.includes('role="checkbox"') && t.includes(labelPart));
  expect(found, labelPart).toHaveLength(1);
  return found[0];
}

describe("LGS Fen Bilimleri: unit-level helpers", () => {
  it("one group per unit: its master (where the unit-level ticks live) and every topic behind the unit's total -- Fen only", () => {
    const groups = unitLevelGroups(course(FEN));
    expect([...groups.keys()]).toHaveLength(7);
    expect(groups.get("1. Ünite: Mevsimler ve İklim")).toEqual({
      masterId: "lgs-fen-bilimleri-genel-u0",
      topicIds: ["lgs-fen-bilimleri-genel-u0", "lgs-fen-bilimleri-u0-t0", "lgs-fen-bilimleri-u0-t1"],
    });
    for (const id of ["lgs-matematik", "lgs-din-kulturu", "lgs-turkce", "lgs-inkilap-tarihi", "lgs-ingilizce", "tyt-fizik", "tyt-matematik"]) {
      expect(unitLevelGroups(course(id)).size, id).toBe(0);
    }
  });

  it("the progress summary reads the unit-level (end) steps from the master, the start steps per Konu", () => {
    const fen = course(FEN);
    const rows = kaynakTakibiRows(fen);
    const masters = new Map([...unitLevelGroups(fen)].map(([label, u]) => [label, u.masterId]));
    const collapsed: PipelineMap = {};
    for (const r of rows) collapsed[r.id] = r.id === "lgs-fen-bilimleri-u0-t0" ? { okul_ilerlemesi: true, meb_kaynagi: false } : { okul_ilerlemesi: false, meb_kaynagi: false };
    const merged = inheritUnitLevelSteps(collapsed, rows, FEN_PIPELINE, PIPELINE_CONFIG.LGS.end, masters);
    // both Konu of Ünite 1 now read the unit's MEB tick; nothing else changed
    expect(merged["lgs-fen-bilimleri-u0-t0"]).toMatchObject({ okul_ilerlemesi: true, meb_kaynagi: true });
    expect(merged["lgs-fen-bilimleri-u0-t1"]).toMatchObject({ okul_ilerlemesi: false, meb_kaynagi: true });
    expect(merged["lgs-fen-bilimleri-u1-t0"]).toMatchObject({ meb_kaynagi: false });
    const summary = summarizePipeline(fen, merged, PIPELINE_CONFIG.LGS);
    expect(summary.totalTopics).toBe(30);
    expect(summary.perStep.meb_kaynagi).toBe(2);
    // a course without unit-level groups is passed through untouched
    expect(inheritUnitLevelSteps(collapsed, rows, FEN_PIPELINE, PIPELINE_CONFIG.LGS.end, new Map())).toBe(collapsed);
  });
});

describe.each([
  ["student", true],
  ["coach", false],
])("LGS Fen Bilimleri Kaynak Takibi, %s table: hybrid layout", (_who, student) => {
  const html = render(FEN, FEN_STATS, student, FEN_PROGRESS, FEN_PIPELINE);

  it("Konu rows stay one per Konu, with no master / parent / (Genel) row", () => {
    expect(html).not.toContain("(Genel)");
    expect(html).not.toContain("data-topic-group-parent");
    for (const name of ["Mevsimlerin Oluşumu", "İklim ve Hava Hareketleri", "Kalıtım", "Mutasyon ve Modifikasyon", "Biyoteknoloji"]) {
      expect(html).toContain(name);
    }
  });

  it("every unit has ONE merged block per merged column group: Soru Dağılımı (4), resource pair (2), MEB + Çıkmış Sorular (2), plus the Ünite cell", () => {
    for (const n of new Set(KONU_COUNTS)) {
      const unitsOfThisSize = KONU_COUNTS.filter((c) => c === n).length;
      const spans = html.match(new RegExp(`rowSpan="${n}"`, "g")) ?? [];
      // (the header's own rowSpan=2 cells -- Ünite, Konu and the four pipeline steps -- are not unit blocks)
      const headerCells = n === 2 ? 6 : 0;
      expect(spans.length - headerCells, `rowSpan ${n}`).toBe(unitsOfThisSize * (4 + 1 + 2 + 2));
    }
  });

  it("the checkboxes: per Konu only Okul İlerlemesi + Konu Tekrarı; per unit only the resource pair and the two end steps", () => {
    const boxes = tags(html, "button").filter((t) => t.includes('role="checkbox"'));
    const konuTotal = KONU_COUNTS.reduce((a, b) => a + b, 0); // 30
    expect(boxes).toHaveLength(konuTotal * 2 + KONU_COUNTS.length * (2 + 2));
    expect(boxes.filter((t) => t.includes("Mevsimlerin Oluşumu"))).toHaveLength(2); // Okul İlerlemesi, Konu Tekrarı
    expect(boxes.filter((t) => t.includes("Kalıtım"))).toHaveLength(2);
    // unit-level boxes are named after the unit, not a Konu
    expect(boxes.filter((t) => t.includes("2. Ünite: Dna ve Genetik Kod") && t.includes("Soru Çözümü"))).toHaveLength(1);
    expect(boxes.filter((t) => t.includes("2. Ünite: Dna ve Genetik Kod") && t.includes("MEB Kaynağı"))).toHaveLength(1);
    expect(boxes.filter((t) => t.includes("2. Ünite: Dna ve Genetik Kod") && t.includes("Çıkmış Sorular"))).toHaveLength(1);
    expect(boxes.filter((t) => t.includes("Kalıtım") && (t.includes("Soru Çözümü") || t.includes("MEB")))).toHaveLength(0);
  });

  it("the merged Soru Dağılımı block is the unit's aggregate -- the master's migrated numbers + its Konu's", () => {
    // Ünite 1 (2 Konu): 20 + 10 = 30 questions, 15 + 7 = 22 D, 4 + 2 = 6 Y, 1 + 1 = 2 B -- each in one cell spanning 2 rows
    for (const [value] of [[30], [22], [6], [2]] as const) {
      expect(html, String(value)).toMatch(new RegExp(`<td[^>]*rowSpan="2"[^>]*>${value}</td>`));
    }
    // a unit with no numbers shows dashes, once
    expect(html).toMatch(/<td[^>]*rowSpan="5"[^>]*>–<\/td>/);
    // the Konu row of Ünite 1 does not repeat its own numbers beside the merged block
    expect(html).not.toMatch(/<td[^>]*>10<\/td>/);
  });

  it("the merged checkboxes show and drive the unit's master state (migrated ticks), not a Konu's", () => {
    expect(checkbox(html, "1. Ünite: Mevsimler ve İklim - Kaynak A - Soru Çözümü")).toContain('aria-checked="true"');
    expect(checkbox(html, "1. Ünite: Mevsimler ve İklim - Kaynak A - Kaynak Taraması Yapıldı")).toContain('aria-checked="false"');
    expect(checkbox(html, "1. Ünite: Mevsimler ve İklim - MEB Kaynağı")).toContain('aria-checked="true"');
    expect(checkbox(html, "1. Ünite: Mevsimler ve İklim - Çıkmış Sorular")).toContain('aria-checked="false"');
    // Ünite 2 has no ticks
    expect(checkbox(html, "2. Ünite: Dna ve Genetik Kod - Kaynak A - Soru Çözümü")).toContain('aria-checked="false"');
    // the Konu's own start-step tick (Okul İlerlemesi on the first Konu) stays on the Konu row
    expect(checkbox(html, "Mevsimlerin Oluşumu - Okul İlerlemesi")).toContain('aria-checked="true"');
    expect(checkbox(html, "İklim ve Hava Hareketleri - Okul İlerlemesi")).toContain('aria-checked="false"');
  });

  it("the old compact unit-total line is gone (the merged block replaced it)", () => {
    expect(html).not.toContain("data-unit-total");
  });
});

describe.each([
  ["student", true],
  ["coach", false],
])("%s table: every other course keeps its one-row-per-topic layout", (_who, student) => {
  it("Matematik, Din, Türkçe: a stat cell and a resource pair on every row, no merged blocks beyond the Ünite cell", () => {
    for (const id of ["lgs-matematik", "lgs-din-kulturu", "lgs-turkce"]) {
      const c = course(id);
      const rows = kaynakTakibiRows(c);
      const html = render(id, { [rows[0].memberTopicIds[0]]: { total: 5, correct: 3, wrong: 1, empty: 1 } }, student);
      const boxes = tags(html, "button").filter((t) => t.includes('role="checkbox"'));
      // per row: Okul İlerlemesi, Konu Tekrarı, Soru Çözümü, Kaynak Taraması, MEB, Çıkmış Sorular
      expect(boxes, id).toHaveLength(rows.length * 6);
    }
  });

  it("other levels keep their parent rows", () => {
    expect(render("tyt-fizik", {}, student)).toContain("data-topic-group-parent");
  });
});
