import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PastQuestionsTable } from "@/app/student/cikmis-sorular/_components/past-questions-table";
import { TopicGroupSelect } from "@/components/topic-group-select";
import { findCourseById, findTopicById, LGS_COURSES, topicOptionsForCourse, type Course } from "./index";
import { isLgsMasterId, lgsMasterUnitLabels, withLgsUnitMasters, withoutLgsMasters } from "./lgs-masters";
import { lgsNodeIdForTopicId, lgsSelectionNodes } from "./lgs-selection";
import { flattenSelectionRows } from "./rows";
import { groupOfTopic, groupParentLayout, mainTopicOptions, mainValueOf, topicGroups } from "./topic-groups";
import { allPipelineSteps, pipelineConfigFor, validatePipelineStep } from "../topic-pipeline";

const course = (id: string): Course => LGS_COURSES.find((c) => c.id === id)!;
const MASTER_COURSES = ["lgs-matematik", "lgs-fen-bilimleri", "lgs-din-kulturu"];
const FLAT_COURSES = ["lgs-turkce", "lgs-inkilap-tarihi", "lgs-ingilizce"];

describe("LGS unit masters: which units get one", () => {
  it("exactly the units that offer a choice (>= 2 selection nodes), nowhere else", () => {
    for (const c of LGS_COURSES) {
      const native = lgsSelectionNodes(withoutLgsMasters(c));
      const perUnit = new Map<string, number>();
      for (const n of native) perUnit.set(n.unitLabel, (perUnit.get(n.unitLabel) ?? 0) + 1);
      const multiNodeUnits = [...perUnit].filter(([, count]) => count >= 2).map(([label]) => label);

      const masterNodes = lgsSelectionNodes(c).filter((n) => isLgsMasterId(n.id));
      expect(masterNodes.map((n) => n.unitLabel), c.id).toEqual(MASTER_COURSES.includes(c.id) ? multiNodeUnits : []);
    }
  });

  it("Matematik: 6 (one per Ünite, two Konu each); Fen Bilimleri: only Ünite 7 (three Konu); Din Kültürü: 5", () => {
    const masterLabels = (id: string) => lgsSelectionNodes(course(id)).filter((n) => isLgsMasterId(n.id)).map((n) => n.label);
    expect(masterLabels("lgs-matematik")).toEqual(["1. Ünite (Genel)", "2. Ünite (Genel)", "3. Ünite (Genel)", "4. Ünite (Genel)", "5. Ünite (Genel)", "6. Ünite (Genel)"]);
    expect(masterLabels("lgs-fen-bilimleri")).toEqual(["7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi (Genel)"]);
    expect(masterLabels("lgs-din-kulturu")).toHaveLength(5);
    for (const id of FLAT_COURSES) expect(masterLabels(id), id).toEqual([]);
  });

  it("the configured units all exist in the raw data (a regenerated lgs.json that renames one fails here)", () => {
    for (const id of MASTER_COURSES) {
      const units = new Set(withoutLgsMasters(course(id)).units.map((u) => u.unit));
      for (const label of lgsMasterUnitLabels(id)) expect(units.has(label), `${id}: ${label}`).toBe(true);
    }
  });

  it("is idempotent in shape: withoutLgsMasters gives back the workbook's own units", () => {
    for (const id of MASTER_COURSES) {
      const native = withoutLgsMasters(course(id));
      expect(native.units.length).toBeLessThan(course(id).units.length);
      expect(withLgsUnitMasters(native).units).toEqual(course(id).units);
    }
    for (const id of FLAT_COURSES) expect(withoutLgsMasters(course(id)).units).toEqual(course(id).units);
  });
});

describe("LGS unit masters: the strict id rule", () => {
  it("every existing selection node keeps its id, label, members and order -- the masters are only inserted", () => {
    for (const id of MASTER_COURSES) {
      const before = lgsSelectionNodes(withoutLgsMasters(course(id)));
      const after = lgsSelectionNodes(course(id)).filter((n) => !isLgsMasterId(n.id));
      expect(after).toEqual(before);
    }
  });

  it("every node id of every LGS course is a real topic id of that course (validatePipelineStep's rule), masters included", () => {
    for (const c of LGS_COURSES) {
      const raw = new Set(c.units.flatMap((u) => u.topics.map((t) => t.id)));
      for (const n of lgsSelectionNodes(c)) {
        expect(raw.has(n.id), `${c.id}: ${n.id}`).toBe(true);
        for (const member of n.memberTopicIds) expect(raw.has(member), `${c.id}: ${member}`).toBe(true);
      }
    }
  });

  it("master ids are unique, follow '<course>-genel-u<n>', and never collide with a workbook topic id", () => {
    for (const c of LGS_COURSES) {
      const native = new Set(withoutLgsMasters(c).units.flatMap((u) => u.topics.map((t) => t.id)));
      const masters = c.units.flatMap((u) => u.topics.map((t) => t.id)).filter((id) => !native.has(id));
      expect(new Set(masters).size).toBe(masters.length);
      for (const id of masters) {
        expect(id.startsWith(`${c.id}-genel-u`), id).toBe(true);
        expect(isLgsMasterId(id)).toBe(true);
      }
      expect([...native].some((id) => isLgsMasterId(id))).toBe(false);
    }
  });

  it("no topic is dropped or duplicated: the nodes still cover every raw topic exactly once", () => {
    for (const c of LGS_COURSES) {
      const raw = c.units.flatMap((u) => u.topics.map((t) => t.id));
      const covered = lgsSelectionNodes(c).flatMap((n) => n.memberTopicIds);
      expect([...covered].sort()).toEqual([...raw].sort());
    }
  });

  it("the old granular ids still fold onto the same node, and a master resolves to itself", () => {
    const mat = course("lgs-matematik");
    expect(lgsNodeIdForTopicId(mat, "lgs-matematik-u0-t1")).toBe("lgs-matematik-u0-t0"); // EKOK -> Çarpanlar ve Katlar
    expect(lgsNodeIdForTopicId(mat, "lgs-matematik-genel-u0")).toBe("lgs-matematik-genel-u0");
    expect(findTopicById("lgs-matematik", "lgs-matematik-genel-u0")?.name).toBe("1. Ünite (Genel)");
  });

  it("the pipeline accepts a master (a real topic of the course) and still rejects an invented id", () => {
    const step = allPipelineSteps(pipelineConfigFor("LGS", null))[0].key;
    expect(() => validatePipelineStep("LGS", { courseId: "lgs-matematik", topicId: "lgs-matematik-genel-u0", step, value: true })).not.toThrow();
    expect(() => validatePipelineStep("LGS", { courseId: "lgs-matematik", topicId: "lgs-matematik-genel-u99", step, value: true })).toThrow("Geçersiz konu.");
    expect(() => validatePipelineStep("LGS", { courseId: "lgs-matematik", topicId: "lgs-matematik-u0-t0", step, value: true })).not.toThrow();
  });
});

describe("LGS unit masters: the Ünite -> Konu picker", () => {
  const mainOptions = (id: string) => mainTopicOptions(course(id), topicOptionsForCourse(course(id))).map((o) => o.label);

  it("Matematik: the first step lists the six Ünite masters, the second its two Konu (not the Alt konu topics)", () => {
    expect(mainOptions("lgs-matematik")).toEqual(["1. Ünite (Genel)", "2. Ünite (Genel)", "3. Ünite (Genel)", "4. Ünite (Genel)", "5. Ünite (Genel)", "6. Ünite (Genel)", "Karma"]);
    const groups = topicGroups(course("lgs-matematik"));
    expect(groups).toHaveLength(6);
    expect(groups[0].members.map((t) => t.name)).toEqual(["Çarpanlar ve Katlar", "Üslü İfadeler"]);
    // the members are selection nodes (real ids), not the raw Alt konu topics EKOK / EBOB
    expect(groups[0].members.map((t) => t.id)).toEqual(["lgs-matematik-u0-t0", "lgs-matematik-u1-t0"]);
  });

  it("Fen Bilimleri: Ünite 1-6 stay flat; Ünite 7 is one entry with its three Konu behind it", () => {
    const labels = mainOptions("lgs-fen-bilimleri");
    expect(labels).toContain("1. Ünite: Mevsimler ve İklim");
    expect(labels).toContain("7. Ünite: Elektrik Yükleri ve Elektrik Enerjisi (Genel)");
    expect(labels).not.toContain("Elektrik Yükleri ve Elektriklenme");
    expect(labels).toHaveLength(6 + 1 + 1); // Ünite 1-6, the Ünite 7 master, Karma
    expect(topicGroups(course("lgs-fen-bilimleri"))[0].members.map((t) => t.name)).toEqual([
      "Elektrik Yükleri ve Elektriklenme",
      "Elektrik Yüklü Cisimler",
      "Elektrik Enerjisinin Dönüşümü",
    ]);
  });

  it("Din Kültürü: five Ünite masters; the unit's own node and the peygamber / sure items are its Konu", () => {
    expect(mainOptions("lgs-din-kulturu")).toHaveLength(5 + 1);
    const first = topicGroups(course("lgs-din-kulturu"))[0];
    expect(first.members.map((t) => t.name)).toEqual(["Kader ve Kaza İnancı", "Bir Peygamber Tanıyorum: Hz. Musa", "Bir Ayet Tanıyorum: Ayet El Kürsi ve Anlamı"]);
  });

  it("Türkçe, İnkılap Tarihi and İngilizce are untouched: flat lists, no groups, no second step", () => {
    for (const id of FLAT_COURSES) {
      expect(topicGroups(course(id)), id).toEqual([]);
      const options = topicOptionsForCourse(course(id));
      expect(mainTopicOptions(course(id), options), id).toEqual(options);
    }
  });

  it("a stored Konu reads as its Ünite master in the first step (the second step shows the Konu)", () => {
    const mat = course("lgs-matematik");
    expect(mainValueOf(mat, "lgs-matematik-u1-t0")).toBe("lgs-matematik-genel-u0");
    expect(mainValueOf(mat, "lgs-matematik-genel-u0")).toBe("lgs-matematik-genel-u0");
    expect(groupOfTopic(mat, "lgs-matematik-u3-t0")?.masterId).toBe("lgs-matematik-genel-u1");
  });

  it("second step: 'Konu (opsiyonel)' with Genel (ünitenin tamamı) + the unit's Konu; nothing for a flat unit", () => {
    const mat = course("lgs-matematik");
    const onMaster = renderToStaticMarkup(<TopicGroupSelect course={mat} topicId="lgs-matematik-genel-u0" onChange={() => {}} />);
    expect(onMaster).toContain("Konu (opsiyonel)");
    expect(onMaster).not.toContain("Alt konu");
    expect(onMaster).toContain("Genel (ünitenin tamamı)");
    expect(onMaster).toContain("Çarpanlar ve Katlar");
    expect(onMaster).toContain("Üslü İfadeler");
    expect(onMaster).not.toContain("EKOK");
    expect(onMaster).not.toContain("Kareköklü İfadeler"); // another unit's Konu

    const onKonu = renderToStaticMarkup(<TopicGroupSelect course={mat} topicId="lgs-matematik-u1-t0" onChange={() => {}} />);
    expect(onKonu).toMatch(/<option value="lgs-matematik-u1-t0" selected="">Üslü İfadeler<\/option>/);

    for (const id of ["lgs-turkce", "lgs-inkilap-tarihi", "lgs-ingilizce"]) {
      const first = lgsSelectionNodes(course(id))[0];
      expect(renderToStaticMarkup(<TopicGroupSelect course={course(id)} topicId={first.id} onChange={() => {}} />), id).toBe("");
    }
    // Fen Ünite 1 is its own node: no second step
    expect(renderToStaticMarkup(<TopicGroupSelect course={course("lgs-fen-bilimleri")} topicId="lgs-fen-bilimleri-u0-t0" onChange={() => {}} />)).toBe("");
  });

  it("other cohorts keep their wording ('Alt konu (opsiyonel)')", () => {
    const tyt = findCourseById("tyt-fizik")!;
    const master = topicGroups(tyt)[0];
    expect(renderToStaticMarkup(<TopicGroupSelect course={tyt} topicId={master.masterId} onChange={() => {}} />)).toContain("Alt konu (opsiyonel)");
  });
});

describe("LGS unit masters: Kaynak Takibi and the other tables", () => {
  it("Matematik rows: each Ünite block starts with its master; the node rows keep their ids", () => {
    const mat = course("lgs-matematik");
    const rows = flattenSelectionRows(mat);
    expect(rows).toHaveLength(12 + 6);
    expect(rows[0]).toMatchObject({ id: "lgs-matematik-genel-u0", label: "1. Ünite (Genel)", unitRowSpan: 3 });
    expect(rows[1]).toMatchObject({ id: "lgs-matematik-u0-t0", label: "Çarpanlar ve Katlar", unitRowSpan: null });
    expect(rows[2]).toMatchObject({ id: "lgs-matematik-u1-t0", unitRowSpan: null });
  });

  it("a parent row per grouped Ünite, totalling the master and every raw topic its Konu fold", () => {
    const mat = course("lgs-matematik");
    const layout = groupParentLayout(mat, flattenSelectionRows(mat));
    expect(layout.parentBefore.size).toBe(6);
    const parent = layout.parentBefore.get("lgs-matematik-genel-u0")!;
    expect(parent).toMatchObject({ unitLabel: "1. Ünite", unitRowSpan: 4, aggregatedStats: false });
    expect(parent.memberTopicIds).toContain("lgs-matematik-genel-u0");
    expect(parent.memberTopicIds).toContain("lgs-matematik-u0-t1"); // EKOK: folded into Çarpanlar ve Katlar
    expect(parent.memberTopicIds).toContain("lgs-matematik-u1-t2"); // Bilimsel Gösterim
    expect(parent.memberTopicIds).not.toContain("lgs-matematik-u2-t0"); // another Ünite
    expect(new Set(parent.memberTopicIds).size).toBe(parent.memberTopicIds.length);
  });

  it("flat LGS courses lay out exactly as before (no parent rows)", () => {
    for (const id of FLAT_COURSES) expect(groupParentLayout(course(id), flattenSelectionRows(course(id))).parentBefore.size, id).toBe(0);
  });

  it("Çıkmış Sorular is not touched by the masters (the workbook's own rows only)", () => {
    for (const id of MASTER_COURSES) {
      expect(renderToStaticMarkup(<PastQuestionsTable course={course(id)} />), id).not.toContain("(Genel)");
    }
  });
});
