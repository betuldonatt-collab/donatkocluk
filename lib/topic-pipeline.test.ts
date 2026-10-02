import { describe, expect, it } from "vitest";
import { AYT_COURSES_BY_TRACK, LGS_COURSES, TYT_COURSES } from "./curriculum";
import { flattenSelectionRows } from "./curriculum/rows";
import { MAARIF_TYT_MERGED_COURSES } from "./curriculum/maarif-tyt";
import { MAARIF9_KAYNAK_COURSES } from "./curriculum/maarif9";
import {
  PIPELINE_CONFIG,
  allPipelineSteps,
  collapsePipelineMapForRows,
  groupPipelineRows,
  pipelineSelectColumns,
  pipelineStepSchema,
  summarizePipeline,
  validatePipelineStep,
  type PipelineMap,
  type PipelineStepInput,
} from "./topic-pipeline";

const lgsCourse = LGS_COURSES[0];
const lgsTopics = lgsCourse.units.flatMap((u) => u.topics);
const yksCourse = TYT_COURSES[0];
const yksTopics = yksCourse.units.flatMap((u) => u.topics);

describe("PIPELINE_CONFIG", () => {
  it("LGS: Okul İlerlemesi + Konu Tekrarı first, MEB Kaynağı + Çıkmış Sorular last", () => {
    expect(PIPELINE_CONFIG.LGS.start.map((s) => s.key)).toEqual(["okul_ilerlemesi", "konu_tekrari"]);
    expect(PIPELINE_CONFIG.LGS.end.map((s) => s.key)).toEqual(["meb_kaynagi", "cikmis_sorular"]);
    expect(PIPELINE_CONFIG.LGS.table).toBe("lgs_topic_pipeline_status");
  });

  it("YKS: Konu Çalışması first, Çıkmış Sorular last", () => {
    expect(PIPELINE_CONFIG.YKS.start.map((s) => s.label)).toEqual(["Konu Çalışması"]);
    expect(PIPELINE_CONFIG.YKS.end.map((s) => s.label)).toEqual(["Çıkmış Sorular"]);
    expect(PIPELINE_CONFIG.YKS.table).toBe("yks_topic_pipeline_status");
  });

  it("selects exactly the cohort's own columns", () => {
    expect(pipelineSelectColumns(PIPELINE_CONFIG.YKS)).toBe("course_id, topic_id, konu_calismasi, cikmis_sorular");
    expect(pipelineSelectColumns(PIPELINE_CONFIG.LGS)).toBe(
      "course_id, topic_id, okul_ilerlemesi, konu_tekrari, meb_kaynagi, cikmis_sorular",
    );
  });
});

describe("summarizePipeline", () => {
  // lgsCourse (Matematik) collapses to one selectable node per Konu (see
  // lib/curriculum/lgs-selection.ts) -- summarizePipeline counts THOSE, not
  // raw Alt Konu topics, since a Kaynak Takibi row now IS one Konu. It
  // expects an already-collapsed map (keyed by each node's own id), which
  // is what collapsePipelineMapForRows produces -- see the "end to end"
  // test below for the raw-map path a real table actually takes.
  const lgsNodes = flattenSelectionRows(lgsCourse);

  it("LGS: counts Konu-level nodes, not raw Alt Konu topics", () => {
    const map: PipelineMap = {
      [lgsNodes[0].id]: { okul_ilerlemesi: true, konu_tekrari: true, meb_kaynagi: true, cikmis_sorular: true },
      [lgsNodes[1].id]: { okul_ilerlemesi: true },
    };
    const s = summarizePipeline(lgsCourse, map, PIPELINE_CONFIG.LGS);
    expect(s.totalTopics).toBe(lgsNodes.length); // 12 Konu, not 42 Alt Konu
    expect(s.perStep).toEqual({ okul_ilerlemesi: 2, konu_tekrari: 1, meb_kaynagi: 1, cikmis_sorular: 1 });
    expect(s.completed).toBe(1);
  });

  it("YKS: a topic is complete once both of its two steps are checked (every node is a real topic here, unchanged)", () => {
    const map: PipelineMap = {
      [yksTopics[0].id]: { konu_calismasi: true, cikmis_sorular: true },
      [yksTopics[1].id]: { konu_calismasi: true, cikmis_sorular: false },
    };
    const s = summarizePipeline(yksCourse, map, PIPELINE_CONFIG.YKS);
    expect(s.totalTopics).toBe(yksTopics.length);
    expect(s.perStep).toEqual({ konu_calismasi: 2, cikmis_sorular: 1 });
    expect(s.completed).toBe(1);
  });

  it("is all zero for a student with no rows", () => {
    const s = summarizePipeline(lgsCourse, {}, PIPELINE_CONFIG.LGS);
    expect(s.completed).toBe(0);
    expect(Object.values(s.perStep).every((n) => n === 0)).toBe(true);
  });
});

describe("collapsePipelineMapForRows", () => {
  it("folds a raw per-Alt-Konu map onto its Konu row (OR across members), end to end with summarizePipeline", () => {
    const rows = flattenSelectionRows(lgsCourse);
    const carpanlarVeKatlar = rows.find((r) => r.label === "1.1 Çarpanlar ve Katlar")!;
    // A step checked on "EKOK" (a non-representative member, never a node
    // id of its own) before this change must still show up on the row.
    const ekok = carpanlarVeKatlar.memberTopicIds.find((id) => id !== carpanlarVeKatlar.id)!;
    const rawMap: PipelineMap = { [ekok]: { okul_ilerlemesi: true } };

    const collapsed = collapsePipelineMapForRows(rows, rawMap, PIPELINE_CONFIG.LGS);
    expect(collapsed[carpanlarVeKatlar.id]).toMatchObject({ okul_ilerlemesi: true, konu_tekrari: false });

    const s = summarizePipeline(lgsCourse, collapsed, PIPELINE_CONFIG.LGS);
    expect(s.totalTopics).toBe(rows.length);
    expect(s.perStep.okul_ilerlemesi).toBe(1);
  });

  it("is a no-op remap for rows that are already one real topic each (non-LGS)", () => {
    const rows = flattenSelectionRows(yksCourse);
    const rawMap: PipelineMap = { [yksTopics[0].id]: { konu_calismasi: true } };
    const collapsed = collapsePipelineMapForRows(rows, rawMap, PIPELINE_CONFIG.YKS);
    expect(collapsed[yksTopics[0].id]).toMatchObject({ konu_calismasi: true });
  });
});

describe("groupPipelineRows", () => {
  it("nests rows by course then topic and keeps only the cohort's steps", () => {
    const grouped = groupPipelineRows(
      [{ course_id: "a", topic_id: "t1", konu_calismasi: true, cikmis_sorular: false, okul_ilerlemesi: true }],
      PIPELINE_CONFIG.YKS,
    );
    expect(grouped.a.t1).toEqual({ konu_calismasi: true, cikmis_sorular: false });
  });
});

describe("validatePipelineStep", () => {
  const lgsOk: PipelineStepInput = { courseId: lgsCourse.id, topicId: lgsTopics[0].id, step: "meb_kaynagi", value: true };
  const yksOk: PipelineStepInput = { courseId: yksCourse.id, topicId: yksTopics[0].id, step: "konu_calismasi", value: true };

  it("accepts a legal LGS and a legal YKS toggle", () => {
    expect(() => validatePipelineStep("LGS", lgsOk)).not.toThrow();
    expect(() => validatePipelineStep("YKS", yksOk)).not.toThrow();
  });

  it("accepts AYT courses for YKS", () => {
    const ayt = AYT_COURSES_BY_TRACK.sayisal[0];
    expect(() =>
      validatePipelineStep("YKS", {
        courseId: ayt.id,
        topicId: ayt.units[0].topics[0].id,
        step: "cikmis_sorular",
        value: false,
      }),
    ).not.toThrow();
  });

  it("rejects a step from the other cohort's pipeline", () => {
    expect(() => validatePipelineStep("YKS", { ...yksOk, step: "okul_ilerlemesi" })).toThrow();
    expect(() => validatePipelineStep("LGS", { ...lgsOk, step: "konu_calismasi" })).toThrow();
  });

  it("rejects a course from the other cohort", () => {
    expect(() => validatePipelineStep("LGS", { ...yksOk, step: "cikmis_sorular" })).toThrow();
    expect(() => validatePipelineStep("YKS", { ...lgsOk, step: "cikmis_sorular" })).toThrow();
  });

  it("rejects a topic that belongs to another course", () => {
    expect(() => validatePipelineStep("LGS", { ...lgsOk, topicId: LGS_COURSES[1].units[0].topics[0].id })).toThrow();
  });

  it("accepts the merged 'Maarif TYT' course only for an 11th grader, never a 9th/10th grader", () => {
    const merged = MAARIF_TYT_MERGED_COURSES[0];
    const input = { courseId: merged.id, topicId: merged.units[0].topics[0].id, step: "konu_calismasi" as const, value: true };
    expect(() => validatePipelineStep("YKS", input, 11)).not.toThrow();
    expect(() => validatePipelineStep("YKS", input, 9)).toThrow("Geçersiz ders.");
    expect(() => validatePipelineStep("YKS", input, 10)).toThrow("Geçersiz ders.");
    expect(() => validatePipelineStep("YKS", input, null)).toThrow("Geçersiz ders.");
  });

  it("an 11th grader does not get direct access to a 9th grade course outside the Maarif TYT merge", () => {
    const m9 = MAARIF9_KAYNAK_COURSES[0];
    const input = { courseId: m9.id, topicId: m9.units[0].topics[0].id, step: "konu_calismasi" as const, value: true };
    expect(() => validatePipelineStep("YKS", input, 11)).toThrow("Geçersiz ders.");
  });
});

describe("pipelineStepSchema", () => {
  it("rejects an unknown step (no arbitrary column names reach the upsert)", () => {
    expect(pipelineStepSchema.safeParse({ courseId: "x", topicId: "y", step: "student_id", value: true }).success).toBe(false);
  });

  it("covers every step of both cohorts", () => {
    for (const cohort of [PIPELINE_CONFIG.LGS, PIPELINE_CONFIG.YKS]) {
      for (const step of allPipelineSteps(cohort)) {
        expect(pipelineStepSchema.safeParse({ courseId: "x", topicId: "y", step: step.key, value: true }).success).toBe(true);
      }
    }
  });
});
