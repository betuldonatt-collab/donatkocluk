import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PastQuestionsTable } from "@/app/student/cikmis-sorular/_components/past-questions-table";
import { TopicGroupSelect } from "@/components/topic-group-select";
import { findTopicById, LGS_COURSES, topicOptionsForCourse, type Course } from "./index";
import { isLgsMasterId, lgsMasterUnitLabels, withLgsUnitMasters, withoutLgsMasters } from "./lgs-masters";
import { lgsNodeIdForTopicId, lgsSelectionNodes } from "./lgs-selection";
import { flattenSelectionRows } from "./rows";
import { groupOfTopic, groupParentLayout, mainTopicOptions, mainValueOf, topicGroups } from "./topic-groups";
import { allPipelineSteps, pipelineConfigFor, validatePipelineStep } from "../topic-pipeline";

const FEN = "lgs-fen-bilimleri";
const FEN_MASTER = "lgs-fen-bilimleri-genel-u6";
const FLAT_COURSES = ["lgs-matematik", "lgs-din-kulturu", "lgs-turkce", "lgs-inkilap-tarihi", "lgs-ingilizce"];
const course = (id: string): Course => LGS_COURSES.find((c) => c.id === id)!;

describe("LGS unit masters: Fen Bilimleri only", () => {
  it("the only master of any LGS course is Fen Bilimleri's Ünite 7; every other course is untouched", () => {
    for (const c of LGS_COURSES) {
      const masters = lgsSelectionNodes(c).filter((n) => isLgsMasterId(n.id));
      if (c.id === FEN) {
        expect(masters.map((n) => [n.id, n.label])).toEqual([[FEN_MASTER, "7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi (Genel)"]]);
      } else {
        expect(masters, c.id).toEqual([]);
        // the course object is the workbook's own, not even copied
        expect(withLgsUnitMasters(c), c.id).toBe(c);
      }
    }
    for (const id of FLAT_COURSES) expect(course(id).units.flatMap((u) => u.topics).some((t) => isLgsMasterId(t.id)), id).toBe(false);
  });

  it("goes exactly where Fen offers a real choice: the one unit with >= 2 selection nodes (Ünite 7: three Konu)", () => {
    const native = lgsSelectionNodes(withoutLgsMasters(course(FEN)));
    const perUnit = new Map<string, number>();
    for (const n of native) perUnit.set(n.unitLabel, (perUnit.get(n.unitLabel) ?? 0) + 1);
    const multi = [...perUnit].filter(([, count]) => count >= 2);
    expect(multi).toEqual([["7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi", 3]]);
  });

  it("the configured unit exists in the raw data (a regenerated lgs.json that renames it fails here)", () => {
    const units = new Set(withoutLgsMasters(course(FEN)).units.map((u) => u.unit));
    for (const label of lgsMasterUnitLabels(FEN)) expect(units.has(label), label).toBe(true);
    expect(lgsMasterUnitLabels("lgs-matematik")).toEqual([]);
    expect(lgsMasterUnitLabels("lgs-din-kulturu")).toEqual([]);
  });

  it("withoutLgsMasters gives back the workbook's own units", () => {
    const native = withoutLgsMasters(course(FEN));
    expect(native.units.length).toBe(course(FEN).units.length - 1);
    expect(withLgsUnitMasters(native).units).toEqual(course(FEN).units);
  });
});

describe("LGS unit masters: the strict id rule", () => {
  it("every existing selection node keeps its id, label, members and order -- the master is only inserted", () => {
    const before = lgsSelectionNodes(withoutLgsMasters(course(FEN)));
    const after = lgsSelectionNodes(course(FEN)).filter((n) => !isLgsMasterId(n.id));
    expect(after).toEqual(before);
  });

  it("every node id of every LGS course is a real topic id of that course (validatePipelineStep's rule), the master included", () => {
    for (const c of LGS_COURSES) {
      const raw = new Set(c.units.flatMap((u) => u.topics.map((t) => t.id)));
      for (const n of lgsSelectionNodes(c)) {
        expect(raw.has(n.id), `${c.id}: ${n.id}`).toBe(true);
        for (const member of n.memberTopicIds) expect(raw.has(member), `${c.id}: ${member}`).toBe(true);
      }
    }
  });

  it("the master id follows '<course>-genel-u<n>' and collides with no workbook topic id", () => {
    const native = new Set(withoutLgsMasters(course(FEN)).units.flatMap((u) => u.topics.map((t) => t.id)));
    const added = course(FEN).units.flatMap((u) => u.topics.map((t) => t.id)).filter((id) => !native.has(id));
    expect(added).toEqual([FEN_MASTER]);
    expect([...native].some((id) => isLgsMasterId(id))).toBe(false);
  });

  it("no topic is dropped or duplicated: the nodes still cover every raw topic exactly once (every LGS course)", () => {
    for (const c of LGS_COURSES) {
      const raw = c.units.flatMap((u) => u.topics.map((t) => t.id));
      const covered = lgsSelectionNodes(c).flatMap((n) => n.memberTopicIds);
      expect([...covered].sort(), c.id).toEqual([...raw].sort());
    }
  });

  it("the old granular ids still fold onto the same node, and the master resolves to itself", () => {
    const fen = course(FEN);
    expect(lgsNodeIdForTopicId(fen, "lgs-fen-bilimleri-u6-t1")).toBe("lgs-fen-bilimleri-u6-t0");
    expect(lgsNodeIdForTopicId(fen, FEN_MASTER)).toBe(FEN_MASTER);
    expect(findTopicById(FEN, FEN_MASTER)?.name).toBe("7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi (Genel)");
  });

  it("the pipeline accepts the master (a real topic of the course) and still rejects an invented id", () => {
    const step = allPipelineSteps(pipelineConfigFor("LGS", null))[0].key;
    expect(() => validatePipelineStep("LGS", { courseId: FEN, topicId: FEN_MASTER, step, value: true })).not.toThrow();
    expect(() => validatePipelineStep("LGS", { courseId: FEN, topicId: "lgs-fen-bilimleri-genel-u99", step, value: true })).toThrow("Geçersiz konu.");
    expect(() => validatePipelineStep("LGS", { courseId: FEN, topicId: "lgs-fen-bilimleri-u0-t0", step, value: true })).not.toThrow();
    // Matematik has no master: its would-be id is not a topic
    expect(() => validatePipelineStep("LGS", { courseId: "lgs-matematik", topicId: "lgs-matematik-genel-u0", step, value: true })).toThrow("Geçersiz konu.");
  });
});

describe("LGS Fen Bilimleri: the Ünite -> Konu picker", () => {
  const mainOptions = (id: string) => mainTopicOptions(course(id), topicOptionsForCourse(course(id))).map((o) => o.label);

  it("first step: Ünite 1-6 and the Ünite 7 master; second step: Ünite 7's three Konu (not the Alt konu topics)", () => {
    const labels = mainOptions(FEN);
    expect(labels).toEqual([
      "1. Ünite: Mevsimler ve İklim",
      "2. Ünite: Dna ve Genetik Kod",
      "3. Ünite: Basınç",
      "4. Ünite: Madde ve Endüstri",
      "5. Ünite: Basit Makineler",
      "6. Ünite: Enerji Dönüşümleri ve Çevre Bilimi",
      "7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi (Genel)",
      "Karma",
    ]);
    const groups = topicGroups(course(FEN));
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((t) => t.name)).toEqual(["Elektrik Yükleri ve Elektriklenme", "Elektrik Yüklü Cisimler", "Elektrik Enerjisinin Dönüşümü"]);
    // members are selection nodes (real ids), not raw Alt konu topics
    expect(groups[0].members.map((t) => t.id)).toEqual(["lgs-fen-bilimleri-u6-t0", "lgs-fen-bilimleri-u7-t0", "lgs-fen-bilimleri-u8-t0"]);
  });

  it("every other LGS course: flat list, no groups, no second step", () => {
    for (const id of FLAT_COURSES) {
      expect(topicGroups(course(id)), id).toEqual([]);
      const options = topicOptionsForCourse(course(id));
      expect(mainTopicOptions(course(id), options), id).toEqual(options);
      expect(mainOptions(id).some((l) => l.includes("(Genel)")), id).toBe(false);
      const first = lgsSelectionNodes(course(id))[0];
      expect(renderToStaticMarkup(<TopicGroupSelect course={course(id)} topicId={first.id} onChange={() => {}} />), id).toBe("");
    }
  });

  it("a stored Konu reads as the Ünite 7 master in the first step; the second step shows the Konu", () => {
    const fen = course(FEN);
    expect(mainValueOf(fen, "lgs-fen-bilimleri-u7-t0")).toBe(FEN_MASTER);
    expect(mainValueOf(fen, FEN_MASTER)).toBe(FEN_MASTER);
    expect(groupOfTopic(fen, "lgs-fen-bilimleri-u8-t0")?.masterId).toBe(FEN_MASTER);
    expect(groupOfTopic(fen, "lgs-fen-bilimleri-u0-t0")).toBeNull(); // Ünite 1 is flat
  });

  it("second step: 'Konu (opsiyonel)' with Genel (ünitenin tamamı) + the Ünite 7 Konu; nothing for a flat Ünite", () => {
    const fen = course(FEN);
    const onMaster = renderToStaticMarkup(<TopicGroupSelect course={fen} topicId={FEN_MASTER} onChange={() => {}} />);
    expect(onMaster).toContain("Konu (opsiyonel)");
    expect(onMaster).not.toContain("Alt konu");
    expect(onMaster).toContain("Genel (ünitenin tamamı)");
    expect(onMaster).toContain("Elektrik Yükleri ve Elektriklenme");
    expect(onMaster).toContain("Elektrik Yüklü Cisimler");
    expect(onMaster).toContain("Elektrik Enerjisinin Dönüşümü");
    expect(onMaster).not.toContain("Sürtünme ile Elektriklenme"); // Alt konu stays read-only context

    const onKonu = renderToStaticMarkup(<TopicGroupSelect course={fen} topicId="lgs-fen-bilimleri-u7-t0" onChange={() => {}} />);
    expect(onKonu).toMatch(/<option value="lgs-fen-bilimleri-u7-t0" selected="">Elektrik Yüklü Cisimler<\/option>/);

    expect(renderToStaticMarkup(<TopicGroupSelect course={fen} topicId="lgs-fen-bilimleri-u0-t0" onChange={() => {}} />)).toBe("");
  });
});

describe("LGS Fen Bilimleri: Kaynak Takibi and Çıkmış Sorular", () => {
  it("rows: the master leads Ünite 7's block and every other row is exactly as before", () => {
    const fen = course(FEN);
    const rows = flattenSelectionRows(fen);
    const native = flattenSelectionRows(withoutLgsMasters(fen));
    expect(rows).toHaveLength(native.length + 1);
    const at = rows.findIndex((r) => r.id === FEN_MASTER);
    expect(rows[at]).toMatchObject({ unitLabel: "7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi", unitRowSpan: 4 });
    expect(rows[at + 1]).toMatchObject({ id: "lgs-fen-bilimleri-u6-t0", unitRowSpan: null });
    expect(rows.filter((r) => r.id !== FEN_MASTER).map((r) => r.id)).toEqual(native.map((r) => r.id));
  });

  it("one parent row, for Ünite 7, totalling the master and every raw topic its Konu fold", () => {
    const fen = course(FEN);
    const layout = groupParentLayout(fen, flattenSelectionRows(fen));
    expect([...layout.parentBefore.keys()]).toEqual([FEN_MASTER]);
    const parent = layout.parentBefore.get(FEN_MASTER)!;
    expect(parent).toMatchObject({ unitRowSpan: 5, aggregatedStats: false });
    expect(parent.memberTopicIds).toContain(FEN_MASTER);
    expect(parent.memberTopicIds).toContain("lgs-fen-bilimleri-u6-t1"); // a raw Alt konu folded into the first Konu
    expect(parent.memberTopicIds).not.toContain("lgs-fen-bilimleri-u0-t0"); // another Ünite
    expect(new Set(parent.memberTopicIds).size).toBe(parent.memberTopicIds.length);
  });

  it("every other LGS course lays out exactly as before (no extra rows, no parent rows)", () => {
    for (const id of FLAT_COURSES) {
      const rows = flattenSelectionRows(course(id));
      expect(groupParentLayout(course(id), rows).parentBefore.size, id).toBe(0);
      expect(rows.some((r) => isLgsMasterId(r.id)), id).toBe(false);
    }
  });

  it("Çıkmış Sorular keeps the workbook's own rows: no master row for Fen (nor anything else)", () => {
    for (const c of LGS_COURSES) {
      expect(renderToStaticMarkup(<PastQuestionsTable course={c} />), c.id).not.toContain("(Genel)");
    }
  });
});
