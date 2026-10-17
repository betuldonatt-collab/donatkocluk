import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  NO_FILTER,
  applyMove,
  buildPhotoPool,
  cleanFolderName,
  courseOfTask,
  courseOptions,
  filterPhotos,
  folderCounts,
  groupPhotos,
  isPoolPathFor,
  pathsToMove,
  takeGroups,
  type PoolTask,
} from "./photo-pool";

const S = "22222222-2222-4222-8222-222222222222";

function task(over: Partial<PoolTask> & { id: string }): PoolTask {
  return {
    task_date: "2026-10-01",
    task_type: "question_solving",
    title: "Soru çöz",
    course_id: "tyt-matematik",
    evidence_image_paths: [],
    evidence_photo_status: {},
    ...over,
  };
}

describe("courseOfTask: the course comes from the task", () => {
  it("a course task is filed under its course", () => {
    expect(courseOfTask({ task_type: "question_solving", course_id: "tyt-matematik" }).key).toBe("tyt-matematik");
    expect(courseOfTask({ task_type: "question_solving", course_id: "tyt-matematik" }).label.length).toBeGreaterThan(0);
  });
  it("a Genel Deneme has no course and is its own group", () => {
    expect(courseOfTask({ task_type: "general_exam", course_id: null })).toEqual({ key: "genel-deneme", label: "Genel Deneme", kind: "general" });
  });
  it("a task without a course is 'Diğer'", () => {
    expect(courseOfTask({ task_type: "free", course_id: null })).toEqual({ key: "diger", label: "Diğer", kind: "other" });
  });
  it("an unknown course id still has a key and a label", () => {
    expect(courseOfTask({ task_type: "x", course_id: "no-such-course" })).toEqual({ key: "no-such-course", label: "no-such-course", kind: "course" });
  });
  it("a Rutin task is grouped by its type, as 'Rutin - Paragraf' / 'Rutin - Problem'", () => {
    expect(courseOfTask({ task_type: "question_bank", course_id: "paragraf" })).toEqual({ key: "paragraf", label: "Rutin - Paragraf", kind: "routine" });
    expect(courseOfTask({ task_type: "question_bank", course_id: "problem" })).toEqual({ key: "problem", label: "Rutin - Problem", kind: "routine" });
    expect(courseOfTask({ task_type: "question_bank", course_id: "yeni-nesil-mat-dozu" }).label).toBe("Rutin - Yeni Nesil Mat Dozu");
  });
  it("a Standard task is grouped by its course, not as a Rutin", () => {
    expect(courseOfTask({ task_type: "question_bank", course_id: "tyt-matematik" }).kind).toBe("course");
  });
});

describe("buildPhotoPool", () => {
  const tasks = [
    task({ id: "t1", task_date: "2026-10-01", evidence_image_paths: [`${S}/t1/a.jpg`, `${S}/t1/b.jpg`], evidence_photo_status: { [`${S}/t1/b.jpg`]: "rejected" } }),
    task({ id: "t2", task_date: "2026-10-05", task_type: "general_exam", course_id: null, title: "Deneme", evidence_image_paths: [`${S}/t2/c.jpg`] }),
    task({ id: "t3", evidence_image_paths: null }),
  ];

  it("lists every photo of every task, newest task first, with its task's facts", () => {
    const pool = buildPhotoPool(tasks, new Map());
    expect(pool.map((p) => p.path)).toEqual([`${S}/t2/c.jpg`, `${S}/t1/a.jpg`, `${S}/t1/b.jpg`]);
    expect(pool[0]).toMatchObject({ taskId: "t2", taskTitle: "Deneme", courseKey: "genel-deneme", folderId: null, verdict: null });
    expect(pool[2].verdict).toBe("rejected");
  });

  it("puts each photo in the folder the mapping names; a photo not in the mapping has none", () => {
    const pool = buildPhotoPool(tasks, new Map([[`${S}/t1/a.jpg`, "f1"]]));
    expect(pool.find((p) => p.path === `${S}/t1/a.jpg`)?.folderId).toBe("f1");
    expect(pool.find((p) => p.path === `${S}/t1/b.jpg`)?.folderId).toBeNull();
  });

  it("ignores a mapping whose photo is gone (it is simply never listed) and a path listed twice appears once", () => {
    const dup = [task({ id: "a", evidence_image_paths: [`${S}/a/x.jpg`] }), task({ id: "b", evidence_image_paths: [`${S}/a/x.jpg`] })];
    expect(buildPhotoPool(dup, new Map([[`${S}/gone/y.jpg`, "f1"]]))).toHaveLength(1);
  });
});

describe("sections (visual auto-grouping)", () => {
  const S2 = S;
  const pool = buildPhotoPool(
    [
      task({ id: "m", task_date: "2026-10-03", course_id: "tyt-matematik", evidence_image_paths: [`${S2}/m/1.jpg`, `${S2}/m/2.jpg`] }),
      task({ id: "pa", task_date: "2026-10-09", task_type: "question_bank", course_id: "paragraf", evidence_image_paths: [`${S2}/pa/1.jpg`] }),
      task({ id: "pr", task_date: "2026-10-08", task_type: "question_bank", course_id: "problem", evidence_image_paths: [`${S2}/pr/1.jpg`] }),
      task({ id: "g", task_date: "2026-10-05", task_type: "general_exam", course_id: null, evidence_image_paths: [`${S2}/g/1.jpg`] }),
      task({ id: "f", task_date: "2026-10-02", course_id: "tyt-fizik", evidence_image_paths: [`${S2}/f/1.jpg`] }),
      task({ id: "o", task_date: "2026-10-01", task_type: "extra_custom", course_id: null, evidence_image_paths: [`${S2}/o/1.jpg`] }),
    ],
    new Map(),
  );

  it("sections: courses A-Z, then Genel Deneme, then the Rutin groups A-Z, then Diğer", () => {
    const groups = groupPhotos(pool);
    expect(groups.map((g) => g.kind)).toEqual(["course", "course", "general", "routine", "routine", "other"]);
    expect(groups.filter((g) => g.kind === "routine").map((g) => g.label)).toEqual(["Rutin - Paragraf", "Rutin - Problem"]);
    const courseLabels = groups.filter((g) => g.kind === "course").map((g) => g.label);
    expect(courseLabels).toEqual([...courseLabels].sort((x, y) => x.localeCompare(y, "tr")));
  });
  it("each section holds only its own photos, newest task first", () => {
    const groups = groupPhotos(pool);
    const math = groups.find((g) => g.key === "tyt-matematik");
    expect(math?.photos.map((p) => p.path)).toEqual([`${S2}/m/1.jpg`, `${S2}/m/2.jpg`]);
    expect(groups.find((g) => g.key === "paragraf")?.photos).toHaveLength(1);
    expect(groups.reduce((n, g) => n + g.photos.length, 0)).toBe(pool.length);
  });
  it("Rutin photos never land in a course section", () => {
    const groups = groupPhotos(pool);
    expect(groups.filter((g) => g.kind === "routine").map((g) => g.key).sort()).toEqual(["paragraf", "problem"]);
    expect(groups.filter((g) => g.kind === "course").some((g) => g.key === "paragraf" || g.key === "problem")).toBe(false);
  });
  it("takeGroups keeps the first N photos in section order and drops the rest", () => {
    const groups = groupPhotos(pool);
    const first3 = takeGroups(groups, 3);
    expect(first3.reduce((n, g) => n + g.photos.length, 0)).toBe(3);
    expect(first3.map((g) => g.key)).toEqual(groups.slice(0, first3.length).map((g) => g.key));
    expect(takeGroups(groups, 0)).toEqual([]);
    expect(takeGroups(groups, 999)).toEqual(groups);
  });
  it("a photo carries the coach's edited copy when there is one, and none otherwise", () => {
    const withEdit = buildPhotoPool([task({ id: "e", evidence_image_paths: [`${S2}/e/1.jpg`, `${S2}/e/2.jpg`] })], new Map(), new Map([[`${S2}/e/1.jpg`, "coach/student/x.jpg"]]));
    expect(withEdit.find((p) => p.path === `${S2}/e/1.jpg`)?.annotatedPath).toBe("coach/student/x.jpg");
    expect(withEdit.find((p) => p.path === `${S2}/e/2.jpg`)?.annotatedPath).toBeNull();
  });
});

describe("filtering", () => {
  const pool = buildPhotoPool(
    [
      task({ id: "t1", task_date: "2026-10-01", course_id: "tyt-matematik", evidence_image_paths: [`${S}/t1/a.jpg`] }),
      task({ id: "t2", task_date: "2026-10-10", course_id: "tyt-fizik", evidence_image_paths: [`${S}/t2/b.jpg`, `${S}/t2/c.jpg`] }),
    ],
    new Map([[`${S}/t2/b.jpg`, "f1"]]),
  );

  it("no filter keeps everything", () => {
    expect(filterPhotos(pool, NO_FILTER)).toHaveLength(3);
  });
  it("by folder: a folder, 'none' (no folder)", () => {
    expect(filterPhotos(pool, { ...NO_FILTER, folder: "f1" }).map((p) => p.path)).toEqual([`${S}/t2/b.jpg`]);
    expect(filterPhotos(pool, { ...NO_FILTER, folder: "none" })).toHaveLength(2);
  });
  it("by course", () => {
    expect(filterPhotos(pool, { ...NO_FILTER, course: "tyt-fizik" })).toHaveLength(2);
  });
  it("by date range, both ends inclusive and each end optional", () => {
    expect(filterPhotos(pool, { ...NO_FILTER, from: "2026-10-10" })).toHaveLength(2);
    expect(filterPhotos(pool, { ...NO_FILTER, to: "2026-10-01" })).toHaveLength(1);
    expect(filterPhotos(pool, { ...NO_FILTER, from: "2026-10-01", to: "2026-10-10" })).toHaveLength(3);
    expect(filterPhotos(pool, { ...NO_FILTER, from: "2026-10-02", to: "2026-10-09" })).toHaveLength(0);
  });
  it("filters combine", () => {
    expect(filterPhotos(pool, { folder: "none", course: "tyt-fizik", from: "", to: "" }).map((p) => p.path)).toEqual([`${S}/t2/c.jpg`]);
  });
  it("offers only courses that have photos, with counts", () => {
    expect(courseOptions(pool).map((c) => [c.key, c.count]).sort()).toEqual([["tyt-fizik", 2], ["tyt-matematik", 1]]);
  });
  it("counts per sidebar entry", () => {
    const c = folderCounts(pool);
    expect(c.all).toBe(3);
    expect(c.none).toBe(2);
    expect(c.byFolder.get("f1")).toBe(1);
  });
});

describe("moving", () => {
  const photos = buildPhotoPool([task({ id: "t", evidence_image_paths: [`${S}/t/a.jpg`, `${S}/t/b.jpg`, `${S}/t/c.jpg`] })], new Map());

  it("dragging a selected photo takes the whole selection, an unselected one goes alone", () => {
    const sel = new Set([`${S}/t/a.jpg`, `${S}/t/b.jpg`]);
    expect(pathsToMove(`${S}/t/a.jpg`, sel).sort()).toEqual([`${S}/t/a.jpg`, `${S}/t/b.jpg`]);
    expect(pathsToMove(`${S}/t/c.jpg`, sel)).toEqual([`${S}/t/c.jpg`]);
    expect(pathsToMove(`${S}/t/c.jpg`, new Set())).toEqual([`${S}/t/c.jpg`]);
  });
  it("applyMove files the paths into the folder and out again, leaving the rest alone", () => {
    const moved = applyMove(photos, new Set([`${S}/t/a.jpg`]), "f1");
    expect(moved.map((p) => p.folderId)).toEqual(["f1", null, null]);
    const back = applyMove(moved, new Set([`${S}/t/a.jpg`]), null);
    expect(back.map((p) => p.folderId)).toEqual([null, null, null]);
    expect(photos.every((p) => p.folderId === null)).toBe(true); // the original is not mutated
  });
});

describe("path and name guards", () => {
  it("only a path inside the student's own folder is accepted", () => {
    expect(isPoolPathFor(`${S}/t/a.jpg`, S)).toBe(true);
    expect(isPoolPathFor(`${S}/../other/a.jpg`, S)).toBe(false);
    expect(isPoolPathFor(`someone-else/t/a.jpg`, S)).toBe(false);
    expect(isPoolPathFor(`${S}/`, S)).toBe(false);
  });
  it("a folder name is trimmed and collapsed; empty or over-long is refused", () => {
    expect(cleanFolderName("  Soru   Bankası ")).toBe("Soru Bankası");
    expect(cleanFolderName("   ")).toBeNull();
    expect(cleanFolderName("x".repeat(61))).toBeNull();
    expect(cleanFolderName("x".repeat(60))).toBe("x".repeat(60));
  });
});

describe("migration 0139 and the page wiring", () => {
  const sql = readFileSync("supabase/migrations/0139_student_photo_folders.sql", "utf8");
  it("creates both tables with row level security, grants and coach + admin policies", () => {
    expect(sql).toMatch(/create table if not exists public\.student_photo_folders/);
    expect(sql).toMatch(/create table if not exists public\.student_photo_folder_items/);
    expect(sql).toMatch(/alter table public\.student_photo_folders enable row level security/);
    expect(sql).toMatch(/alter table public\.student_photo_folder_items enable row level security/);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.student_photo_folders to authenticated/);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.student_photo_folder_items to authenticated/);
    expect(sql).toMatch(/photo_folders_coach_all/);
    expect(sql).toMatch(/photo_folder_items_admin_all/);
  });
  it("a photo is in at most one folder per coach, and deleting a folder only removes its mapping rows", () => {
    expect(sql).toMatch(/primary key \(coach_id, student_id, photo_path\)/);
    expect(sql).toMatch(/on delete cascade/);
    expect(sql).toMatch(/foreign key \(folder_id, coach_id, student_id\)/);
  });
  it("is idempotent and reloads the schema cache", () => {
    expect(sql).not.toMatch(/create table (?!if not exists)/);
    expect(sql).toMatch(/notify pgrst, 'reload schema'/);
  });
  it("the student page has the Fotoğraf Havuzu button, after the notes card", () => {
    const page = readFileSync("app/coach/students/[id]/page.tsx", "utf8");
    const notes = page.indexOf("<StudentTimelineCard");
    const button = page.indexOf("Fotoğraf Havuzu");
    expect(notes).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(notes);
    expect(page).toMatch(/href=\{`\/coach\/students\/\$\{id\}\/photos`\}/);
  });
});
