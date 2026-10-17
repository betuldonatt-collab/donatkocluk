import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = { table: string; op: string; payload?: unknown; options?: unknown; filters: [string, unknown][] };
let ops: Op[] = [];
let uploads: { bucket: string; path: string; bytes: number; contentType?: string }[] = [];
let removed: { bucket: string; paths: string[] }[] = [];
let signedFor: { bucket: string; paths: string[] }[] = [];
let roster: string[] = [];
let existing: { annotated_path: string } | null = null;
let failOn: { table?: string; op?: string; storage?: "upload"; code?: string } | null = null;

vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {} }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: COACH } } }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, opts: { contentType?: string }) => {
          if (failOn?.storage === "upload") return { error: { message: "no space" } };
          uploads.push({ bucket, path, bytes: bytes.length, contentType: opts.contentType });
          return { error: null };
        },
        remove: async (paths: string[]) => (removed.push({ bucket, paths }), { error: null }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }),
        createSignedUrls: async (paths: string[]) => {
          signedFor.push({ bucket, paths });
          return { data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })), error: null };
        },
      }),
    },
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.upsert = (payload: unknown, options: unknown) => ((op.op = "upsert"), (op.payload = payload), (op.options = options), b);
      b.delete = () => ((op.op = "delete"), b);
      b.eq = (col: string, value: unknown) => (op.filters.push([col, value]), b);
      const finish = () => {
        ops.push(op);
        if (failOn?.table === table && failOn.op === op.op) return { data: null, error: { code: failOn.code ?? "XX000", message: "boom" } };
        if (table === "coach_students") {
          const sid = op.filters.find(([k]) => k === "student_id")?.[1] as string;
          return { data: roster.includes(sid) ? { student_id: sid } : null, error: null };
        }
        if (table === "coach_photo_annotations" && op.op === "select") return { data: existing, error: null };
        return { data: null, error: null };
      };
      b.maybeSingle = async () => finish();
      b.then = (resolve: (v: unknown) => unknown) => resolve(finish());
      return b;
    },
  }),
}));

import { getAnnotationUrls, removePhotoAnnotation, saveAnnotatedPhoto } from "@/app/coach/students/[id]/photos/actions";

const COACH = "11111111-1111-4111-8111-111111111111";
const STUDENT = "22222222-2222-4222-8222-222222222222";
const OTHER = "44444444-4444-4444-8444-444444444444";
const PHOTO = `${STUDENT}/66666666-6666-4666-8666-666666666666/a.jpg`;
const writes = () => ops.filter((o) => o.op !== "select");

function form(over: { studentId?: string; photoPath?: string; file?: File | null } = {}) {
  const f = new FormData();
  f.set("studentId", over.studentId ?? STUDENT);
  f.set("photoPath", over.photoPath ?? PHOTO);
  const file = over.file === undefined ? new File([new Uint8Array(1000)], "e.jpg", { type: "image/jpeg" }) : over.file;
  if (file) f.set("file", file);
  return f;
}

beforeEach(() => {
  ops = [];
  uploads = [];
  removed = [];
  signedFor = [];
  roster = [STUDENT];
  existing = null;
  failOn = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveAnnotatedPhoto", () => {
  it("stores the edit in the coach_annotations bucket under the coach's own folder and records it -- the original bucket is never written", async () => {
    const r = await saveAnnotatedPhoto(form());
    expect(r.ok).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("coach_annotations");
    expect(uploads[0].path.startsWith(`${COACH}/${STUDENT}/`)).toBe(true);
    expect(uploads[0].contentType).toBe("image/jpeg");
    expect(uploads.some((u) => u.bucket === "task_evidence")).toBe(false);
    expect(removed.some((x) => x.bucket === "task_evidence")).toBe(false);
    const upsert = writes().find((o) => o.op === "upsert");
    expect(upsert).toMatchObject({ table: "coach_photo_annotations", options: { onConflict: "coach_id,student_id,photo_path" } });
    expect(upsert?.payload).toMatchObject({ coach_id: COACH, student_id: STUDENT, photo_path: PHOTO, annotated_path: uploads[0].path });
    if (r.ok) expect(r.url).toContain(uploads[0].path);
  });

  it("an edit that replaces an earlier one removes the old edited file (and only that)", async () => {
    existing = { annotated_path: `${COACH}/${STUDENT}/old.jpg` };
    expect((await saveAnnotatedPhoto(form())).ok).toBe(true);
    expect(removed).toEqual([{ bucket: "coach_annotations", paths: [`${COACH}/${STUDENT}/old.jpg`] }]);
  });

  it("refuses a non-JPEG, an oversized file, no file, a path outside the student's folder, and a student off the roster -- writing nothing", async () => {
    const png = new File([new Uint8Array(10)], "e.png", { type: "image/png" });
    const huge = new File([new Uint8Array(1024 * 1024)], "e.jpg", { type: "image/jpeg" });
    expect((await saveAnnotatedPhoto(form({ file: png }))).ok).toBe(false);
    expect((await saveAnnotatedPhoto(form({ file: huge }))).ok).toBe(false);
    expect((await saveAnnotatedPhoto(form({ file: null }))).ok).toBe(false);
    expect((await saveAnnotatedPhoto(form({ photoPath: `${OTHER}/x/a.jpg` }))).ok).toBe(false);
    expect(await saveAnnotatedPhoto(form({ studentId: OTHER, photoPath: `${OTHER}/x/a.jpg` }))).toEqual({ ok: false, error: "Bu öğrenci sana atanmamış." });
    expect(uploads).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("when recording fails the freshly uploaded file is removed (no orphan)", async () => {
    failOn = { table: "coach_photo_annotations", op: "upsert" };
    expect((await saveAnnotatedPhoto(form())).ok).toBe(false);
    expect(removed).toEqual([{ bucket: "coach_annotations", paths: [uploads[0].path] }]);
  });

  it("before migration 0140 it says so instead of failing opaquely, and never throws", async () => {
    failOn = { table: "coach_photo_annotations", op: "select", code: "PGRST205" };
    const r = await saveAnnotatedPhoto(form());
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("0140");
    expect(uploads).toEqual([]);
  });
});

describe("removePhotoAnnotation (Orijinale dön)", () => {
  it("deletes the row and the edited file; the student's original is not touched", async () => {
    existing = { annotated_path: `${COACH}/${STUDENT}/old.jpg` };
    expect(await removePhotoAnnotation(STUDENT, PHOTO)).toEqual({ ok: true });
    expect(writes()[0]).toMatchObject({ table: "coach_photo_annotations", op: "delete" });
    expect(removed).toEqual([{ bucket: "coach_annotations", paths: [`${COACH}/${STUDENT}/old.jpg`] }]);
  });
  it("nothing to remove is fine; a student off the roster is refused", async () => {
    expect(await removePhotoAnnotation(STUDENT, PHOTO)).toEqual({ ok: true });
    expect(removed).toEqual([]);
    expect((await removePhotoAnnotation(OTHER, `${OTHER}/x/a.jpg`)).ok).toBe(false);
  });
});

describe("getAnnotationUrls", () => {
  it("signs only the coach's own copies of this student, from the private bucket", async () => {
    const own = `${COACH}/${STUDENT}/a.jpg`;
    const r = await getAnnotationUrls(STUDENT, [own]);
    expect(r).toEqual({ ok: true, urls: { [own]: `https://signed/${own}` } });
    expect(signedFor).toEqual([{ bucket: "coach_annotations", paths: [own] }]);
  });
  it("refuses another coach's or another student's path", async () => {
    expect((await getAnnotationUrls(STUDENT, [`${OTHER}/${STUDENT}/a.jpg`])).ok).toBe(false);
    expect((await getAnnotationUrls(STUDENT, [`${COACH}/${OTHER}/a.jpg`])).ok).toBe(false);
    expect(signedFor).toEqual([]);
  });
});
