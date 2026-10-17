"use server";

// Fotoğraf Havuzu actions. Deliberately its OWN small "use server" file (like app/coach/events/actions.ts): a client component importing
// actions out of the giant shared app/coach/actions.ts hits Next.js's production-only "unused server action" bug ("Minified React error #441").
//
// Every action NEVER throws: a thrown Error is redacted to an opaque digest in production, so each resolves to { ok: true, ... } or
// { ok: false, error } and the gallery checks `.ok`.

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { EVIDENCE_BUCKET } from "@/lib/task-evidence";
import { cleanFolderName, isPoolPathFor, type PoolFolder } from "@/lib/photo-pool";

export type PhotoActionFailure = { ok: false; error: string };
export type FolderResult = { ok: true; folder: PoolFolder } | PhotoActionFailure;
export type OkResult = { ok: true } | PhotoActionFailure;
export type UrlsResult = { ok: true; urls: Record<string, string> } | PhotoActionFailure;

const DUPLICATE_MESSAGE = "Bu isimde bir klasör zaten var.";
const MISSING_TABLES_MESSAGE = "Klasör özelliği henüz etkin değil (0139 numaralı veritabanı güncellemesi çalıştırılmalı).";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type DbError = { code?: string; message?: string };

function fail(error: unknown): PhotoActionFailure {
  const e = error as DbError | undefined;
  if (e?.code === "23505") return { ok: false, error: DUPLICATE_MESSAGE };
  // 42P01 = relation does not exist, PGRST205 = not in the schema cache: migration 0139 has not been run yet.
  if (e?.code === "42P01" || e?.code === "PGRST205") return { ok: false, error: MISSING_TABLES_MESSAGE };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: dbError(error).message };
}

async function requireCoach(supabase: SupabaseClient, studentId: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  const { data: link, error } = await supabase.from("coach_students").select("student_id").eq("coach_id", user.id).eq("student_id", studentId).maybeSingle();
  if (error) throw dbError(error);
  if (!link) throw new Error("Bu öğrenci sana atanmamış.");
  return user.id;
}

const nameSchema = z.string().transform((raw, ctx) => {
  const name = cleanFolderName(raw);
  if (name === null) ctx.addIssue({ code: "custom", message: "Klasör adı 1 ile 60 karakter arasında olmalı." });
  return name ?? "";
});

export async function createPhotoFolder(studentId: string, name: string): Promise<FolderResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, name: nameSchema }), { studentId, name });
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    const { data, error } = await supabase
      .from("student_photo_folders")
      .insert({ coach_id: coachId, student_id: input.studentId, name: input.name })
      .select("id, name")
      .single();
    if (error) return fail(error);
    return { ok: true, folder: { id: data.id as string, name: data.name as string } };
  } catch (error) {
    return fail(error);
  }
}

export async function renamePhotoFolder(studentId: string, folderId: string, name: string): Promise<FolderResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, folderId: uuidSchema, name: nameSchema }), { studentId, folderId, name });
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    const { data, error } = await supabase
      .from("student_photo_folders")
      .update({ name: input.name })
      .eq("id", input.folderId)
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId)
      .select("id, name")
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return { ok: false, error: "Klasör bulunamadı." };
    return { ok: true, folder: { id: data.id as string, name: data.name as string } };
  } catch (error) {
    return fail(error);
  }
}

// Deleting a folder removes its mapping rows only (on delete cascade): its photos simply return to "Klasörsüz".
export async function deletePhotoFolder(studentId: string, folderId: string): Promise<OkResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(z.object({ studentId: uuidSchema, folderId: uuidSchema }), { studentId, folderId });
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);
    const { error } = await supabase
      .from("student_photo_folders")
      .delete()
      .eq("id", input.folderId)
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId);
    if (error) return fail(error);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const MOVE_MAX = 500;
const CHUNK = 200;

// Puts the photos into the folder (folderId) or takes them out of every folder (null). A photo is in at most one folder of a coach, so
// moving it replaces its previous place.
export async function movePhotosToFolder(studentId: string, paths: string[], folderId: string | null): Promise<OkResult> {
  try {
    await assertNotImpersonating();
    const input = parseInput(
      z.object({ studentId: uuidSchema, paths: z.array(z.string().min(1).max(300)).min(1, "Taşınacak fotoğraf seçilmedi.").max(MOVE_MAX, `Tek seferde en fazla ${MOVE_MAX} fotoğraf taşınabilir.`), folderId: uuidSchema.nullable() }),
      { studentId, paths, folderId },
    );
    if (input.paths.some((p) => !isPoolPathFor(p, input.studentId))) throw new Error("Geçersiz fotoğraf.");
    const paths_ = [...new Set(input.paths)];
    const supabase = await createClient();
    const coachId = await requireCoach(supabase, input.studentId);

    if (input.folderId === null) {
      for (let i = 0; i < paths_.length; i += CHUNK) {
        const { error } = await supabase
          .from("student_photo_folder_items")
          .delete()
          .eq("coach_id", coachId)
          .eq("student_id", input.studentId)
          .in("photo_path", paths_.slice(i, i + CHUNK));
        if (error) return fail(error);
      }
      return { ok: true };
    }

    const { data: folder, error: folderError } = await supabase
      .from("student_photo_folders")
      .select("id")
      .eq("id", input.folderId)
      .eq("coach_id", coachId)
      .eq("student_id", input.studentId)
      .maybeSingle();
    if (folderError) return fail(folderError);
    if (!folder) return { ok: false, error: "Klasör bulunamadı." };

    const now = new Date().toISOString();
    const { error } = await supabase.from("student_photo_folder_items").upsert(
      paths_.map((photo_path) => ({ coach_id: coachId, student_id: input.studentId, photo_path, folder_id: input.folderId, moved_at: now })),
      { onConflict: "coach_id,student_id,photo_path" },
    );
    if (error) return fail(error);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

const URL_MAX = 60;

// Short-lived signed links for the photos on screen (the bucket is private; the coach storage policy also requires the student to be on the
// coach's roster). A path that cannot be signed is simply absent from the result.
export async function getPhotoUrls(studentId: string, paths: string[]): Promise<UrlsResult> {
  try {
    const input = parseInput(z.object({ studentId: uuidSchema, paths: z.array(z.string().min(1).max(300)).max(URL_MAX) }), { studentId, paths });
    if (input.paths.some((p) => !isPoolPathFor(p, input.studentId))) throw new Error("Geçersiz fotoğraf.");
    if (input.paths.length === 0) return { ok: true, urls: {} };
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(input.paths, 3600);
    if (error) return { ok: false, error: GENERIC_DB_ERROR };
    const urls: Record<string, string> = {};
    for (const row of data ?? []) if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
    return { ok: true, urls };
  } catch (error) {
    return fail(error);
  }
}
