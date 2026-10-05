import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MaarifTableBody } from "@/components/maarif-table-body";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { findCourseById } from "./curriculum";
import { flattenSelectionRows } from "./curriculum/rows";
import type { MaarifGrade } from "./maarif-grade";
import {
  allPipelineSteps,
  collapsePipelineMapForRows,
  perTopicStepsFor,
  pipelineConfigFor,
  validatePipelineStep,
  type PipelineMap,
} from "./topic-pipeline";

const fen = findCourseById("maarif7-fen-bilimleri")!;
const rows = flattenSelectionRows(fen);

function render(
  grade: MaarifGrade,
  map: PipelineMap = {},
  progress: Record<string, { solved: boolean; reviewed: boolean }> = {},
  course = fen,
) {
  const rows = flattenSelectionRows(course);
  const config = pipelineConfigFor("YKS", grade);
  return renderToStaticMarkup(
    <MaarifGradeProvider value={grade}>
      <table>
        <tbody>
          <MaarifTableBody
            courseName={course.name}
            rows={rows}
            resources={[{ id: "r1", name: "Kaynak A" }]}
            progress={progress}
            topicStats={{}}
            pipeline={{ config, map, onToggle: () => {} }}
            collapsedMap={collapsePipelineMapForRows(rows, map, config, perTopicStepsFor(grade))}
            onToggleProgress={() => {}}
          />
        </tbody>
      </table>
    </MaarifGradeProvider>,
  );
}

const count = (html: string, label: string) => (html.match(new RegExp(`aria-label="[^"]*${label}"`, "g")) ?? []).length;

describe("7th grade Kaynak Takibi: the split layout", () => {
  it("ticks Okul İlerlemesi AND Konu Çalışması on every individual topic line (26), headings get none", () => {
    const html = render(7);
    expect(count(html, "Okul İlerlemesi")).toBe(26);
    expect(count(html, "Konu Çalışması")).toBe(26);
  });

  it("puts the resource ticks only at unit level: one Soru Çözümü + one Kaynak Taraması per unit (7), not per topic", () => {
    const html = render(7);
    expect(count(html, "Soru Çözümü")).toBe(7);
    expect(count(html, "Kaynak Taraması Yapıldı")).toBe(7);
    // Named by the unit, so the student sees which unit a tick belongs to.
    expect(html).toContain('aria-label="7. Sınıf Fen Bilimleri - 1. Ünite - Uzay Çağı - Kaynak A - Soru Çözümü"');
  });

  it("has no Çıkmış Sorular tick at all for the 7th grade", () => {
    expect(count(render(7), "Çıkmış Sorular")).toBe(0);
    expect(allPipelineSteps(pipelineConfigFor("YKS", 7)).map((s) => s.key)).toEqual(["okul_ilerlemesi", "konu_calismasi"]);
  });

  it("shows a ticked topic as ticked, and a resource ticked on the unit's first topic as ticked for the whole unit", () => {
    const html = render(7, { "maarif7-fen-bilimleri-u0-t1": { konu_calismasi: true } }, { "maarif7-fen-bilimleri-u0-t0::r1": { solved: true, reviewed: false } });
    const konu = html.match(/aria-checked="true"[^>]*aria-label="[^"]*Konu Çalışması"|aria-label="[^"]*Konu Çalışması"[^>]*aria-checked="true"/g) ?? [];
    expect(konu).toHaveLength(1);
    const solved = html.match(/aria-checked="true"[^>]*aria-label="[^"]*1\. Ünite - Uzay Çağı - Kaynak A - Soru Çözümü"|aria-label="[^"]*1\. Ünite - Uzay Çağı - Kaynak A - Soru Çözümü"[^>]*aria-checked="true"/g) ?? [];
    expect(solved).toHaveLength(1);
  });
});

describe("7th grade İngilizce (one topic per theme) in the split layout", () => {
  it("has one topic tick of each kind and one resource tick per theme: 8 of each", () => {
    const html = render(7, {}, {}, findCourseById("maarif7-ingilizce")!);
    expect(count(html, "Okul İlerlemesi")).toBe(8);
    expect(count(html, "Konu Çalışması")).toBe(8);
    expect(count(html, "Soru Çözümü")).toBe(8);
    expect(count(html, "Çıkmış Sorular")).toBe(0);
  });
});

describe("the other grades keep their layout", () => {
  it("9th grade (same rows): Konu Çalışması and the resource ticks stay once per group (16), only Okul İlerlemesi per topic", () => {
    const html = render(9);
    expect(count(html, "Okul İlerlemesi")).toBe(26);
    expect(count(html, "Konu Çalışması")).toBe(rows.length); // 16 groups
    expect(count(html, "Soru Çözümü")).toBe(rows.length);
    expect(count(html, "Çıkmış Sorular")).toBe(rows.length);
  });
});

describe("7th grade tracking logic", () => {
  it("a group counts as done for Konu Çalışması only when EVERY topic of it is ticked", () => {
    const sindirim = rows.find((r) => r.label === "Sindirim Sistemi")!;
    expect(sindirim.memberTopicIds).toHaveLength(2);
    const config = pipelineConfigFor("YKS", 7);
    const half: PipelineMap = { [sindirim.memberTopicIds[0]]: { konu_calismasi: true } };
    const full: PipelineMap = { ...half, [sindirim.memberTopicIds[1]]: { konu_calismasi: true } };
    const done = (map: PipelineMap) => collapsePipelineMapForRows(rows, map, config, perTopicStepsFor(7))[sindirim.id].konu_calismasi;
    expect(done(half)).toBe(false);
    expect(done(full)).toBe(true);
  });

  it("the server accepts Konu Çalışması on a 7th-grade topic and refuses Çıkmış Sorular", () => {
    const topicId = "maarif7-fen-bilimleri-u0-t0";
    const step = (s: string) => ({ courseId: "maarif7-fen-bilimleri", topicId, step: s as never, value: true });
    expect(() => validatePipelineStep("YKS", step("konu_calismasi"), 7)).not.toThrow();
    expect(() => validatePipelineStep("YKS", step("okul_ilerlemesi"), 7)).not.toThrow();
    expect(() => validatePipelineStep("YKS", step("cikmis_sorular"), 7)).toThrow("Bu adım bu öğrenci için geçerli değil.");
    // Other grades still have it.
    expect(allPipelineSteps(pipelineConfigFor("YKS", 9)).map((s) => s.key)).toContain("cikmis_sorular");
  });
});
