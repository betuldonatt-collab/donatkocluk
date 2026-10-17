import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANNOTATION_MAX_BYTES,
  BRUSH_SIZES,
  HIGHLIGHTER_WIDTH_FACTOR,
  MIN_POINT_DISTANCE,
  addPoint,
  annotationPath,
  isAnnotationPathFor,
  newStroke,
  rotatePoint,
  rotateStrokes,
  strokeWidthPx,
  toNormalized,
  type Point,
  type Stroke,
} from "./photo-annotate";

const close = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
};

describe("rotating strokes with the photo", () => {
  it("a clockwise turn maps (x, y) to (1 - y, x): the top-left corner goes to the top-right", () => {
    close(rotatePoint([0, 0], 90), [1, 0]);
    close(rotatePoint([1, 0], 90), [1, 1]);
    close(rotatePoint([0.25, 0.75], 90), [0.25, 0.25]);
  });
  it("a counter-clockwise turn undoes a clockwise one", () => {
    const p: Point = [0.3, 0.8];
    close(rotatePoint(rotatePoint(p, 90), -90), p);
    close(rotatePoint(rotatePoint(p, -90), 90), p);
  });
  it("four clockwise turns bring every point back", () => {
    let p: Point = [0.12, 0.64];
    for (let i = 0; i < 4; i++) p = rotatePoint(p, 90);
    close(p, [0.12, 0.64]);
  });
  it("rotateStrokes turns every point of every stroke and keeps colour, tool and size", () => {
    const strokes: Stroke[] = [{ tool: "highlighter", color: "#facc15", size: 0.008, points: [[0, 0], [0.5, 0.5]] }];
    const [turned] = rotateStrokes(strokes, 90);
    expect(turned).toMatchObject({ tool: "highlighter", color: "#facc15", size: 0.008 });
    close(turned.points[0], [1, 0]);
    close(turned.points[1], [0.5, 0.5]);
    expect(strokes[0].points[0]).toEqual([0, 0]); // the input is not mutated
  });
});

describe("pointer to image coordinates", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  it("maps a position inside the box to 0..1", () => {
    expect(toNormalized(200, 100, rect)).toEqual([0.5, 0.5]);
    expect(toNormalized(100, 50, rect)).toEqual([0, 0]);
  });
  it("clamps a position outside the box", () => {
    expect(toNormalized(0, 1000, rect)).toEqual([0, 1]);
    expect(toNormalized(999, -5, rect)).toEqual([1, 0]);
  });
  it("an empty box gives the origin instead of NaN", () => {
    expect(toNormalized(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0]);
  });
});

describe("strokes", () => {
  it("a new stroke starts at the touched point with the chosen brush", () => {
    const s = newStroke("pen", "#e11d48", "thick", [0.1, 0.2]);
    expect(s).toEqual({ tool: "pen", color: "#e11d48", size: BRUSH_SIZES[2].size, points: [[0.1, 0.2]] });
  });
  it("a point practically where the last one is is not added (a long scribble stays light)", () => {
    const s = newStroke("pen", "#000", "thin", [0.5, 0.5]);
    expect(addPoint(s, [0.5 + MIN_POINT_DISTANCE / 4, 0.5])).toBe(s);
    expect(addPoint(s, [0.6, 0.5]).points).toHaveLength(2);
  });
  it("thickness scales with the shorter side, and the highlighter is much wider", () => {
    const pen = newStroke("pen", "#000", "medium", [0, 0]);
    const marker = newStroke("highlighter", "#000", "medium", [0, 0]);
    const penPx = strokeWidthPx(pen, 1000, 500);
    expect(penPx).toBeCloseTo(0.008 * 500);
    expect(strokeWidthPx(marker, 1000, 500)).toBeCloseTo(penPx * HIGHLIGHTER_WIDTH_FACTOR);
    // the same stroke on a turned photo (sides swapped) is just as thick
    expect(strokeWidthPx(pen, 500, 1000)).toBeCloseTo(penPx);
  });
});

describe("the coach's private copy: storage paths", () => {
  const COACH = "11111111-1111-4111-8111-111111111111";
  const STUDENT = "22222222-2222-4222-8222-222222222222";
  const OTHER = "33333333-3333-4333-8333-333333333333";
  it("lives under the coach's own folder, then the student's", () => {
    expect(annotationPath(COACH, STUDENT, "abc")).toBe(`${COACH}/${STUDENT}/abc.jpg`);
  });
  it("only that coach's own copies of that student are accepted", () => {
    const own = annotationPath(COACH, STUDENT, "abc");
    expect(isAnnotationPathFor(own, COACH, STUDENT)).toBe(true);
    expect(isAnnotationPathFor(own, OTHER, STUDENT)).toBe(false); // another coach's
    expect(isAnnotationPathFor(own, COACH, OTHER)).toBe(false); // another student's
    expect(isAnnotationPathFor(`${COACH}/${STUDENT}/../${OTHER}/x.jpg`, COACH, STUDENT)).toBe(false);
    expect(isAnnotationPathFor(`${COACH}/${STUDENT}/`, COACH, STUDENT)).toBe(false);
  });
  it("the edited copy stays under the Server Action body limit", () => {
    expect(ANNOTATION_MAX_BYTES).toBeLessThan(1024 * 1024);
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("migration 0140: the edits are private to the coach", () => {
  const sql = readFileSync("supabase/migrations/0140_coach_photo_annotations.sql", "utf8");

  it("adds a separate private bucket and a table; the student's evidence bucket and column are not touched", () => {
    expect(sql).toMatch(/'coach_annotations', 'coach_annotations', false/);
    expect(sql).toMatch(/create table if not exists public\.coach_photo_annotations/);
    expect(sql).toMatch(/primary key \(coach_id, student_id, photo_path\)/);
    expect(sql).not.toMatch(/alter table public\.student_tasks/i);
    expect(sql).not.toMatch(/on storage\.objects[^;]*task_evidence/i);
  });
  it("every policy is the coach's own (roster-checked) or the admin's: none for students or parents", () => {
    const policies = sql.match(/create policy "[^"]+" on [\w.]+ for \w+ to authenticated[\s\S]*?;/g) ?? [];
    expect(policies.length).toBe(6); // table: coach + admin; storage: insert, select, delete, admin
    for (const policy of policies) {
      const coachOnly = /auth\.uid\(\)/.test(policy) && /coach_students|coach_id = |foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)/.test(policy);
      const adminOnly = /is_admin\(\)/.test(policy);
      expect(coachOnly || adminOnly, policy).toBe(true);
      expect(policy).not.toMatch(/student_id = \(select auth\.uid\(\)\)/); // a student reading their own row
      expect(policy).not.toMatch(/parent/i);
    }
  });
  it("is idempotent and reloads the schema cache", () => {
    expect(sql).not.toMatch(/create table (?!if not exists)/);
    expect(sql).toMatch(/notify pgrst, 'reload schema'/);
  });
});

describe("the student and parent panels never touch the coach's copies", () => {
  it("nothing under app/student or app/parent mentions the annotation table or bucket", () => {
    for (const dir of ["app/student", "app/parent"]) {
      for (const file of sourceFiles(dir)) {
        const text = readFileSync(file, "utf8");
        expect(text, file).not.toMatch(/coach_photo_annotations|coach_annotations|photo-annotate/);
      }
    }
  });
  it("the student's evidence flow still reads only the original bucket", () => {
    const actions = readFileSync("app/student/actions.ts", "utf8");
    expect(actions).toMatch(/EVIDENCE_BUCKET/);
    expect(actions).not.toMatch(/ANNOTATION_BUCKET/);
  });
});
