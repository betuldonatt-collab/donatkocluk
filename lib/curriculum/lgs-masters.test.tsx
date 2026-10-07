import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PastQuestionsTable } from "@/app/student/cikmis-sorular/_components/past-questions-table";
import { TopicGroupSelect } from "@/components/topic-group-select";
import { ExamTopicTable } from "@/app/student/deneme-analizleri/_components/exam-topic-table";
import lgsJson from "./lgs.json";
import { findTopicById, LGS_COURSES, toTurkishTitleCase, topicOptionsForCourse, type Course } from "./index";
import { isLgsMasterId, lgsMasterUnitLabels, withLgsUnitMasters, withoutLgsMasters } from "./lgs-masters";
import { lgsNodeIdForTopicId, lgsSelectionNodes } from "./lgs-selection";
import { flattenSelectionRows, withGroupHeadings } from "./rows";
import { groupOfTopic, groupParentLayout, mainTopicOptions, mainValueOf, topicGroups } from "./topic-groups";
import { allPipelineSteps, pipelineConfigFor, validatePipelineStep } from "../topic-pipeline";

const FEN = "lgs-fen-bilimleri";
const masterId = (n: number) => `lgs-fen-bilimleri-genel-u${n}`;
const FLAT_COURSES = ["lgs-matematik", "lgs-din-kulturu", "lgs-turkce", "lgs-inkilap-tarihi", "lgs-ingilizce"];
const course = (id: string): Course => LGS_COURSES.find((c) => c.id === id)!;
const fenUnitLabels = () => [...new Set(withoutLgsMasters(course(FEN)).units.map((u) => toTurkishTitleCase(u.unit)))];

describe("LGS unit masters: Fen Bilimleri only, all seven units", () => {
  it("every Fen unit has exactly one master; no other LGS course has any", () => {
    for (const c of LGS_COURSES) {
      const masters = lgsSelectionNodes(c).filter((n) => isLgsMasterId(n.id));
      if (c.id === FEN) {
        expect(masters.map((n) => n.id)).toEqual([0, 1, 2, 3, 4, 5, 6].map(masterId));
        // "<the unit's label as the other rows show it> (Genel)"
        expect(masters.map((n) => n.label)).toEqual(fenUnitLabels().map((l) => `${l} (Genel)`));
        expect(masters.map((n) => n.unitLabel)).toEqual(fenUnitLabels());
      } else {
        expect(masters, c.id).toEqual([]);
        expect(withLgsUnitMasters(c), c.id).toBe(c); // the course object is the workbook's own, not even copied
      }
    }
    for (const id of FLAT_COURSES) expect(course(id).units.flatMap((u) => u.topics).some((t) => isLgsMasterId(t.id)), id).toBe(false);
  });

  it("each Fen unit offers a real choice: at least two selection nodes (the reason it gets a master)", () => {
    const native = lgsSelectionNodes(withoutLgsMasters(course(FEN)));
    const perUnit = new Map<string, number>();
    for (const n of native) perUnit.set(n.unitLabel, (perUnit.get(n.unitLabel) ?? 0) + 1);
    expect([...perUnit.values()]).toEqual([2, 5, 4, 6, 6, 4, 3]);
  });

  it("the configured units exist in the raw data (a regenerated lgs.json that renames one fails here)", () => {
    const units = new Set(withoutLgsMasters(course(FEN)).units.map((u) => u.unit));
    expect(lgsMasterUnitLabels(FEN)).toHaveLength(7);
    for (const label of lgsMasterUnitLabels(FEN)) expect(units.has(label), label).toBe(true);
    expect(lgsMasterUnitLabels("lgs-matematik")).toEqual([]);
    expect(lgsMasterUnitLabels("lgs-din-kulturu")).toEqual([]);
  });

  it("withoutLgsMasters gives back the workbook's own units", () => {
    const native = withoutLgsMasters(course(FEN));
    expect(native.units.length).toBe(course(FEN).units.length - 7);
    expect(withLgsUnitMasters(native).units).toEqual(course(FEN).units);
  });
});

describe("LGS Fen Bilimleri: the Konu data and the strict id rule", () => {
  it("the Konu of Ünite 1-6 are the workbook's own topics: no topic was invented, renamed or re-id'd", () => {
    const raw = (lgsJson as Course[]).find((c) => c.id === FEN)!;
    const current = withoutLgsMasters(course(FEN));
    expect(current.units.map((u) => u.topics.map((t) => [t.id, t.name]))).toEqual(raw.units.map((u) => u.topics.map((t) => [t.id, t.name])));
    // every Ünite 1-6 Konu is a node of its own, under its existing id
    const nodes = lgsSelectionNodes(current);
    for (const u of raw.units.filter((u) => u.konu === undefined)) {
      for (const t of u.topics) expect(nodes.find((n) => n.id === t.id), t.id).toMatchObject({ label: t.name, memberTopicIds: [t.id] });
    }
  });

  it("every existing selection node keeps its id, label, members and order -- the masters are only inserted", () => {
    const before = lgsSelectionNodes(withoutLgsMasters(course(FEN)));
    const after = lgsSelectionNodes(course(FEN)).filter((n) => !isLgsMasterId(n.id));
    expect(after).toEqual(before);
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

  it("master ids follow '<course>-genel-u<n>', are unique and collide with no workbook topic id", () => {
    const native = new Set(withoutLgsMasters(course(FEN)).units.flatMap((u) => u.topics.map((t) => t.id)));
    const added = course(FEN).units.flatMap((u) => u.topics.map((t) => t.id)).filter((id) => !native.has(id));
    expect(added).toEqual([0, 1, 2, 3, 4, 5, 6].map(masterId));
    expect([...native].some((id) => isLgsMasterId(id))).toBe(false);
  });

  it("no topic is dropped or duplicated: the nodes still cover every raw topic exactly once (every LGS course)", () => {
    for (const c of LGS_COURSES) {
      const raw = c.units.flatMap((u) => u.topics.map((t) => t.id));
      const covered = lgsSelectionNodes(c).flatMap((n) => n.memberTopicIds);
      expect([...covered].sort(), c.id).toEqual([...raw].sort());
    }
  });

  it("a raw Alt konu id still folds onto its Konu node (Ünite 7), and a master resolves to itself", () => {
    const fen = course(FEN);
    expect(lgsNodeIdForTopicId(fen, "lgs-fen-bilimleri-u6-t1")).toBe("lgs-fen-bilimleri-u6-t0");
    expect(lgsNodeIdForTopicId(fen, "lgs-fen-bilimleri-u0-t1")).toBe("lgs-fen-bilimleri-u0-t1"); // a Ünite 1 Konu is its own node
    expect(lgsNodeIdForTopicId(fen, masterId(0))).toBe(masterId(0));
    expect(findTopicById(FEN, masterId(2))?.name).toBe("3. Ünite: Basınç (Genel)");
  });

  it("the pipeline accepts every master and Konu (real topics of the course) and still rejects an invented id", () => {
    const step = allPipelineSteps(pipelineConfigFor("LGS", null))[0].key;
    const ok = (topicId: string) => validatePipelineStep("LGS", { courseId: FEN, topicId, step, value: true });
    for (let n = 0; n < 7; n++) expect(() => ok(masterId(n))).not.toThrow();
    for (const node of lgsSelectionNodes(course(FEN))) expect(() => ok(node.id), node.id).not.toThrow();
    expect(() => ok("lgs-fen-bilimleri-genel-u7")).toThrow("Geçersiz konu.");
    expect(() => ok("lgs-fen-bilimleri-u0-t9")).toThrow("Geçersiz konu.");
    // Matematik has no master: its would-be id is not a topic
    expect(() => validatePipelineStep("LGS", { courseId: "lgs-matematik", topicId: "lgs-matematik-genel-u0", step, value: true })).toThrow("Geçersiz konu.");
  });
});

describe("LGS Fen Bilimleri: the Ünite -> Konu picker", () => {
  const mainOptions = (id: string) => mainTopicOptions(course(id), topicOptionsForCourse(course(id))).map((o) => o.label);

  it("first step: the seven Ünite masters; second step: that Ünite's Konu", () => {
    expect(mainOptions(FEN)).toEqual([...fenUnitLabels().map((l) => `${l} (Genel)`), "Karma"]);
    const groups = topicGroups(course(FEN));
    expect(groups).toHaveLength(7);
    expect(groups[0].members.map((t) => t.name)).toEqual(["Mevsimlerin Oluşumu", "İklim ve Hava Hareketleri"]);
    expect(groups[2].members.map((t) => t.name)).toEqual(["Katı Basıncı", "Sıvı Basıncı", "Açık Hava Basıncı", "Basıncın Günlük Yaşam ve Teknolojideki Uygulamaları"]);
    expect(groups[6].members.map((t) => t.name)).toEqual(["Elektrik Yükleri ve Elektriklenme", "Elektrik Yüklü Cisimler", "Elektrik Enerjisinin Dönüşümü"]);
    // members are selection nodes (real ids); Ünite 7's are its Konu nodes, not the Alt konu topics
    expect(groups[6].members.map((t) => t.id)).toEqual(["lgs-fen-bilimleri-u6-t0", "lgs-fen-bilimleri-u7-t0", "lgs-fen-bilimleri-u8-t0"]);
    expect(groups.map((g) => g.members.length)).toEqual([2, 5, 4, 6, 6, 4, 3]);
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

  it("a stored Konu reads as its Ünite's master in the first step; the second step shows the Konu", () => {
    const fen = course(FEN);
    expect(mainValueOf(fen, "lgs-fen-bilimleri-u0-t1")).toBe(masterId(0));
    expect(mainValueOf(fen, "lgs-fen-bilimleri-u4-t3")).toBe(masterId(4));
    expect(mainValueOf(fen, "lgs-fen-bilimleri-u7-t0")).toBe(masterId(6));
    expect(mainValueOf(fen, masterId(3))).toBe(masterId(3));
    expect(groupOfTopic(fen, "lgs-fen-bilimleri-u8-t0")?.masterId).toBe(masterId(6));
  });

  it("second step: 'Konu (opsiyonel)' with Genel (ünitenin tamamı) + the unit's Konu, for every unit", () => {
    const fen = course(FEN);
    const onMaster = renderToStaticMarkup(<TopicGroupSelect course={fen} topicId={masterId(0)} onChange={() => {}} />);
    expect(onMaster).toContain("Konu (opsiyonel)");
    expect(onMaster).not.toContain("Alt konu");
    expect(onMaster).toContain("Genel (ünitenin tamamı)");
    expect(onMaster).toContain("Mevsimlerin Oluşumu");
    expect(onMaster).toContain("İklim ve Hava Hareketleri");
    expect(onMaster).not.toContain("Katı Basıncı"); // another Ünite's Konu

    const onUnit7 = renderToStaticMarkup(<TopicGroupSelect course={fen} topicId={masterId(6)} onChange={() => {}} />);
    expect(onUnit7).toContain("Elektrik Yüklü Cisimler");
    expect(onUnit7).not.toContain("Sürtünme ile Elektriklenme"); // Alt konu stays read-only context

    const onKonu = renderToStaticMarkup(<TopicGroupSelect course={fen} topicId="lgs-fen-bilimleri-u2-t1" onChange={() => {}} />);
    expect(onKonu).toMatch(/<option value="lgs-fen-bilimleri-u2-t1" selected="">Sıvı Basıncı<\/option>/);

    for (let n = 0; n < 7; n++) {
      expect(renderToStaticMarkup(<TopicGroupSelect course={fen} topicId={masterId(n)} onChange={() => {}} />), String(n)).toContain("Konu (opsiyonel)");
    }
  });
});

describe("LGS Fen Bilimleri: Kaynak Takibi and Çıkmış Sorular", () => {
  it("rows: every Ünite's block starts with its master; the Konu rows keep their ids and order", () => {
    const fen = course(FEN);
    const rows = flattenSelectionRows(fen);
    const native = flattenSelectionRows(withoutLgsMasters(fen));
    expect(rows).toHaveLength(native.length + 7);
    expect(rows.filter((r) => !isLgsMasterId(r.id)).map((r) => r.id)).toEqual(native.map((r) => r.id));
    // Ünite 1: master + 2 Konu in one block; the unit cell sits on the master row
    expect(rows[0]).toMatchObject({ id: masterId(0), unitRowSpan: 3 });
    expect(rows[1]).toMatchObject({ id: "lgs-fen-bilimleri-u0-t0", label: "Mevsimlerin Oluşumu", unitRowSpan: null, readOnlyNames: [] });
    expect(rows[2]).toMatchObject({ id: "lgs-fen-bilimleri-u0-t1", unitRowSpan: null });
    // Ünite 7: master + 3 Konu
    const at = rows.findIndex((r) => r.id === masterId(6));
    expect(rows[at]).toMatchObject({ unitRowSpan: 4 });
    expect(rows[at + 1]).toMatchObject({ id: "lgs-fen-bilimleri-u6-t0", unitRowSpan: null });
  });

  it("a parent row per Ünite, totalling the master and every raw topic its Konu fold", () => {
    const fen = course(FEN);
    const layout = groupParentLayout(fen, flattenSelectionRows(fen));
    expect([...layout.parentBefore.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6].map(masterId));
    const unit1 = layout.parentBefore.get(masterId(0))!;
    expect(unit1).toMatchObject({ unitLabel: "1. Ünite: Mevsimler ve İklim", unitRowSpan: 4, aggregatedStats: false });
    expect(unit1.memberTopicIds).toEqual([masterId(0), "lgs-fen-bilimleri-u0-t0", "lgs-fen-bilimleri-u0-t1"]);
    const unit7 = layout.parentBefore.get(masterId(6))!;
    expect(unit7.memberTopicIds).toContain("lgs-fen-bilimleri-u6-t1"); // a raw Alt konu folded into the first Konu
    expect(unit7.memberTopicIds).not.toContain("lgs-fen-bilimleri-u0-t0"); // another Ünite
    for (const parent of layout.parentBefore.values()) expect(new Set(parent.memberTopicIds).size).toBe(parent.memberTopicIds.length);
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

describe("LGS Fen Bilimleri: the Ünite is a header row above its Konu in the tables", () => {
  it("withGroupHeadings: a header per Ünite (7), the Ünite cell spans header + rows; no header for any other LGS course", () => {
    const items = withGroupHeadings(flattenSelectionRows(course(FEN)));
    const headings = items.filter((i) => i.kind === "heading");
    expect(headings.map((h) => h.label)).toEqual(fenUnitLabels());
    // Ünite 1: header + master + 2 Konu = 4 rows under one Ünite cell
    expect(items[0]).toMatchObject({ kind: "heading", label: "1. Ünite: Mevsimler ve İklim", unitRowSpan: 4 });
    expect(items[1]).toMatchObject({ kind: "row", unitRowSpan: null });
    expect(items.filter((i) => i.unitRowSpan !== null)).toHaveLength(7);
    for (const id of FLAT_COURSES) {
      expect(withGroupHeadings(flattenSelectionRows(course(id))).some((i) => i.kind === "heading"), id).toBe(false);
    }
  });

  it("the student's and the coach's exam topic table put the header row above each Fen Ünite's Konu; Matematik is untouched", () => {
    const headerCount = (html: string) => (html.match(/bg-muted\/60 text-xs font-semibold whitespace-normal/g) ?? []).length;
    const fen = renderToStaticMarkup(<ExamTopicTable course={course(FEN)} exams={[]} mistakesByExam={{}} onOpenExam={() => {}} />);
    expect(headerCount(fen)).toBe(7);
    expect(fen).toContain("Mevsimlerin Oluşumu");
    expect(headerCount(renderToStaticMarkup(<ExamTopicTable course={course("lgs-matematik")} exams={[]} mistakesByExam={{}} onOpenExam={() => {}} />))).toBe(0);
  });

  it("Çıkmış Sorular: a header row per Fen Ünite (spanning the unit's Konu) and no extra rows elsewhere", () => {
    const headerRows = (html: string) => (html.match(/text-xs font-semibold whitespace-normal" colSpan="8"/g) ?? []).length;
    const fen = renderToStaticMarkup(<PastQuestionsTable course={course(FEN)} />);
    expect(headerRows(fen)).toBe(7);
    // Ünite 1 (2 Konu): its vertical cell spans the header row + 2 Konu rows
    expect(fen).toContain('rowSpan="3"');
    expect(fen).toContain("1. Ünite: Mevsimler ve İklim");
    for (const id of FLAT_COURSES) expect(headerRows(renderToStaticMarkup(<PastQuestionsTable course={course(id)} />)), id).toBe(0);
  });
});
