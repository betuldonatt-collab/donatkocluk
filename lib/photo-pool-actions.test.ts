import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = { table: string; op: string; payload?: unknown; filters: [string, unknown][]; options?: unknown };
let ops: Op[] = [];
let roster: string[] = [];
let folderExists = true;
// the course the (existing) folder belongs to (null = a folder from before folders had courses), and the student's tasks with photos
let folderCourse: string | null = "tyt-matematik";
let taskRows: { task_type: string; course_id: string | null; evidence_image_paths: string[] }[] = [];
let failOn: { table: string; op: string; code?: string; message?: string } | null = null;
let signed: { path: string; signedUrl: string }[] | null = null;
let signedPaths: string[][] = [];

vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {} }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "coach1" } } }) },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          signedPaths.push(paths);
          return { data: signed ?? paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })), error: null };
        },
      }),
    },
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.insert = (payload: unknown) => ((op.op = "insert"), (op.payload = payload), b);
      b.update = (payload: unknown) => ((op.op = "update"), (op.payload = payload), b);
      b.upsert = (payload: unknown, options: unknown) => ((op.op = "upsert"), (op.payload = payload), (op.options = options), b);
      b.delete = () => ((op.op = "delete"), b);
      b.overlaps = (col: string, value: unknown) => (op.filters.push([`overlaps:${col}`, value]), b);
      for (const m of ["eq", "in"]) b[m] = (col: string, value: unknown) => (op.filters.push([`${m}:${col}`, value]), b);
      const finish = () => {
        ops.push(op);
        if (failOn && failOn.table === table && failOn.op === op.op) return { data: null, error: { code: failOn.code ?? "XX000", message: failOn.message ?? "boom" } };
        if (table === "coach_students") {
          const sid = op.filters.find(([k]) => k === "eq:student_id")?.[1] as string;
          return { data: roster.includes(sid) ? { student_id: sid } : null, error: null };
        }
        if (table === "student_photo_folders" && (op.op === "insert" || op.op === "update")) {
          const name = (op.payload as { name: string }).name;
          return { data: { id: "f-new", name, course_key: (op.payload as { course_key?: string }).course_key ?? null }, error: null };
        }
        if (table === "student_photo_folders" && op.op === "select") return { data: folderExists ? { id: "f1", course_key: folderCourse } : null, error: null };
        if (table === "student_tasks") return { data: taskRows, error: null };
        return { data: null, error: null };
      };
      b.single = async () => finish();
      b.maybeSingle = async () => finish();
      b.then = (resolve: (v: unknown) => unknown) => resolve(finish());
      return b;
    },
  }),
}));

import { createPhotoFolder, deletePhotoFolder, getPhotoUrls, movePhotosToFolder, renamePhotoFolder } from "@/app/coach/students/[id]/photos/actions";

const STUDENT = "22222222-2222-4222-8222-222222222222";
const OTHER = "44444444-4444-4444-8444-444444444444";
const FOLDER = "55555555-5555-4555-8555-555555555555";
const photo = (n: string) => `${STUDENT}/66666666-6666-4666-8666-666666666666/${n}.jpg`;
const writes = () => ops.filter((o) => o.op !== "select");

beforeEach(() => {
  ops = [];
  roster = [STUDENT];
  folderExists = true;
  folderCourse = "tyt-matematik";
  taskRows = [{ task_type: "question_bank", course_id: "tyt-matematik", evidence_image_paths: [photo("a"), photo("b")] }];
  failOn = null;
  signed = null;
  signedPaths = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createPhotoFolder", () => {
  it("creates a folder owned by the coach for the student, with the cleaned name", async () => {
    const r = await createPhotoFolder(STUDENT, "  Soru   Bankası ", "tyt-matematik");
    expect(r).toEqual({ ok: true, folder: { id: "f-new", name: "Soru Bankası", courseKey: "tyt-matematik" } });
    expect(writes()[0]).toMatchObject({
      table: "student_photo_folders",
      op: "insert",
      payload: { coach_id: "coach1", student_id: STUDENT, name: "Soru Bankası", course_key: "tyt-matematik" },
    });
  });
  it("refuses an empty / over-long name and a student who is not on the roster, writing nothing", async () => {
    expect(await createPhotoFolder(STUDENT, "   ", "tyt-matematik")).toMatchObject({ ok: false });
    expect(await createPhotoFolder(STUDENT, "x".repeat(61), "tyt-matematik")).toMatchObject({ ok: false });
    expect(await createPhotoFolder(OTHER, "Deneme", "tyt-matematik")).toEqual({ ok: false, error: "Bu öğrenci sana atanmamış." });
    expect(await createPhotoFolder("not-a-uuid", "Deneme", "tyt-matematik")).toMatchObject({ ok: false });
    // a folder is created under a course: none, or a malformed key, is refused
    expect(await createPhotoFolder(STUDENT, "Deneme", "")).toMatchObject({ ok: false });
    expect(await createPhotoFolder(STUDENT, "Deneme", "../x")).toMatchObject({ ok: false });
    expect(writes()).toEqual([]);
  });
  it("a duplicate name gets a clear message", async () => {
    failOn = { table: "student_photo_folders", op: "insert", code: "23505" };
    expect(await createPhotoFolder(STUDENT, "Deneme", "tyt-matematik")).toEqual({ ok: false, error: "Bu isimde bir klasör zaten var." });
  });
  it("before migration 0139 it says so instead of failing opaquely", async () => {
    failOn = { table: "student_photo_folders", op: "insert", code: "PGRST205" };
    const r = await createPhotoFolder(STUDENT, "Deneme", "tyt-matematik");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("0139");
  });
  it("any other database error is masked, never thrown", async () => {
    failOn = { table: "student_photo_folders", op: "insert", message: "secret detail" };
    const r = await createPhotoFolder(STUDENT, "Deneme", "tyt-matematik");
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).not.toContain("secret detail");
  });
});

describe("renamePhotoFolder / deletePhotoFolder", () => {
  it("rename is scoped to the coach's own folder of this student", async () => {
    const r = await renamePhotoFolder(STUDENT, FOLDER, "Yeni Ad");
    expect(r).toEqual({ ok: true, folder: { id: "f-new", name: "Yeni Ad" } });
    const filters = writes()[0].filters;
    expect(filters).toContainEqual(["eq:id", FOLDER]);
    expect(filters).toContainEqual(["eq:coach_id", "coach1"]);
    expect(filters).toContainEqual(["eq:student_id", STUDENT]);
  });
  it("delete removes only the folder row (its mapping rows go by cascade; photos untouched)", async () => {
    expect(await deletePhotoFolder(STUDENT, FOLDER)).toEqual({ ok: true });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ table: "student_photo_folders", op: "delete" });
    expect(writes()[0].filters).toContainEqual(["eq:coach_id", "coach1"]);
  });
  it("a student off the roster changes nothing", async () => {
    expect(await deletePhotoFolder(OTHER, FOLDER)).toMatchObject({ ok: false });
    expect(await renamePhotoFolder(OTHER, FOLDER, "X")).toMatchObject({ ok: false });
    expect(writes()).toEqual([]);
  });
});

describe("movePhotosToFolder", () => {
  it("files the photos into the folder with one upsert keyed on (coach, student, photo)", async () => {
    const r = await movePhotosToFolder(STUDENT, [photo("a"), photo("b"), photo("a")], FOLDER);
    expect(r).toEqual({ ok: true });
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ table: "student_photo_folder_items", op: "upsert", options: { onConflict: "coach_id,student_id,photo_path" } });
    const rows = w[0].payload as { coach_id: string; student_id: string; photo_path: string; folder_id: string }[];
    expect(rows.map((x) => x.photo_path)).toEqual([photo("a"), photo("b")]); // the duplicate is dropped
    expect(rows.every((x) => x.coach_id === "coach1" && x.student_id === STUDENT && x.folder_id === FOLDER)).toBe(true);
  });
  it("null takes the photos out of every folder (deletes their mapping rows)", async () => {
    expect(await movePhotosToFolder(STUDENT, [photo("a")], null)).toEqual({ ok: true });
    expect(writes()[0]).toMatchObject({ table: "student_photo_folder_items", op: "delete" });
    expect(writes()[0].filters).toContainEqual(["in:photo_path", [photo("a")]]);
  });
  it("refuses a folder that is not the coach's", async () => {
    folderExists = false;
    expect(await movePhotosToFolder(STUDENT, [photo("a")], FOLDER)).toEqual({ ok: false, error: "Klasör bulunamadı." });
    expect(writes()).toEqual([]);
  });
  it("refuses a path outside the student's own folder, an empty list and a student off the roster", async () => {
    expect(await movePhotosToFolder(STUDENT, [`${OTHER}/x/a.jpg`], FOLDER)).toMatchObject({ ok: false });
    expect(await movePhotosToFolder(STUDENT, [`${STUDENT}/../${OTHER}/a.jpg`], FOLDER)).toMatchObject({ ok: false });
    expect(await movePhotosToFolder(STUDENT, [], FOLDER)).toMatchObject({ ok: false });
    expect(await movePhotosToFolder(OTHER, [`${OTHER}/x/a.jpg`], FOLDER)).toEqual({ ok: false, error: "Bu öğrenci sana atanmamış." });
    expect(writes()).toEqual([]);
  });
  it("a failed write comes back as an error result, not a throw", async () => {
    failOn = { table: "student_photo_folder_items", op: "upsert" };
    expect(await movePhotosToFolder(STUDENT, [photo("a")], FOLDER)).toMatchObject({ ok: false });
  });
});

describe("getPhotoUrls", () => {
  it("signs the student's own photos and returns a path -> url map", async () => {
    const r = await getPhotoUrls(STUDENT, [photo("a"), photo("b")]);
    expect(r).toEqual({ ok: true, urls: { [photo("a")]: `https://signed/${photo("a")}`, [photo("b")]: `https://signed/${photo("b")}` } });
  });
  it("an empty list signs nothing", async () => {
    expect(await getPhotoUrls(STUDENT, [])).toEqual({ ok: true, urls: {} });
    expect(signedPaths).toEqual([]);
  });
  it("refuses a path that is not inside the student's folder", async () => {
    expect(await getPhotoUrls(STUDENT, [`${OTHER}/x/a.jpg`])).toMatchObject({ ok: false });
    expect(signedPaths).toEqual([]);
  });
  it("a path that could not be signed is just absent", async () => {
    signed = [{ path: photo("a"), signedUrl: "" }];
    expect(await getPhotoUrls(STUDENT, [photo("a")])).toEqual({ ok: true, urls: {} });
  });
});

describe("folders belong to a course", () => {
  it("a missing course column (migration 0141 not run) says so instead of failing opaquely", async () => {
    failOn = { table: "student_photo_folders", op: "insert", code: "42703" };
    const r = await createPhotoFolder(STUDENT, "Deneme", "tyt-matematik");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("0141");
  });

  it("the same folder name can exist in two courses (the unique rule is per course; a repeat in ONE course is the duplicate error)", async () => {
    expect((await createPhotoFolder(STUDENT, "Soru Bankası", "tyt-matematik")).ok).toBe(true);
    expect((await createPhotoFolder(STUDENT, "Soru Bankası", "lgs-fen")).ok).toBe(true);
    failOn = { table: "student_photo_folders", op: "insert", code: "23505" };
    expect(await createPhotoFolder(STUDENT, "Soru Bankası", "lgs-fen")).toEqual({ ok: false, error: "Bu isimde bir klasör zaten var." });
  });

  it("a course folder takes that course's photos", async () => {
    expect(await movePhotosToFolder(STUDENT, [photo("a"), photo("b")], FOLDER)).toEqual({ ok: true });
    expect(writes().some((w) => w.table === "student_photo_folder_items" && w.op === "upsert")).toBe(true);
    // the photos are looked up among the student's own tasks
    const lookup = ops.find((o) => o.table === "student_tasks");
    expect(lookup?.filters).toContainEqual(["eq:student_id", STUDENT]);
  });

  it("a course folder refuses a photo of another course, writing nothing", async () => {
    taskRows = [{ task_type: "question_bank", course_id: "lgs-fen", evidence_image_paths: [photo("a")] }];
    const r = await movePhotosToFolder(STUDENT, [photo("a")], FOLDER);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("başka bir derse");
    expect(writes()).toEqual([]);
  });

  it("a Genel Deneme photo belongs to 'genel-deneme', a task without a course to 'diger', a routine to its own key", async () => {
    folderCourse = "genel-deneme";
    taskRows = [{ task_type: "general_exam", course_id: null, evidence_image_paths: [photo("a")] }];
    expect((await movePhotosToFolder(STUDENT, [photo("a")], FOLDER)).ok).toBe(true);
    folderCourse = "paragraf";
    taskRows = [{ task_type: "question_bank", course_id: "paragraf", evidence_image_paths: [photo("a")] }];
    expect((await movePhotosToFolder(STUDENT, [photo("a")], FOLDER)).ok).toBe(true);
  });

  it("a photo that is in none of the student's tasks cannot be filed in a course folder", async () => {
    taskRows = [];
    expect(await movePhotosToFolder(STUDENT, [photo("a")], FOLDER)).toEqual({ ok: false, error: "Fotoğraf bulunamadı." });
    expect(writes()).toEqual([]);
  });

  it("a folder without a course (from before 0141) takes any photo, with no lookup", async () => {
    folderCourse = null;
    taskRows = [];
    expect(await movePhotosToFolder(STUDENT, [photo("a")], FOLDER)).toEqual({ ok: true });
    expect(ops.some((o) => o.table === "student_tasks")).toBe(false);
  });

  it("taking photos out of every folder needs no course check", async () => {
    taskRows = [];
    expect(await movePhotosToFolder(STUDENT, [photo("a")], null)).toEqual({ ok: true });
    expect(ops.some((o) => o.table === "student_tasks")).toBe(false);
  });
});
