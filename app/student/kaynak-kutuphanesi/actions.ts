"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { dbError } from "@/lib/errors";
import { nonEmptyText, parseInput } from "@/lib/validation";

// course_id is a curriculum slug (e.g. "tyt-matematik", "paragraf"), not a
// database-generated id -- student_resources.course_id is a plain `text`
// column with no uuid constraint. Validating it against uuidSchema would
// reject every real course id unconditionally, since none of them are
// actually UUIDs.
const courseIdSchema = nonEmptyText(100, "Ders");

type ResourceRow = { id: string; name: string; course_id: string };
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Both actions below return a plain result object instead of throwing.
// parseInput() and dbError() already produce clean, user-safe Error
// messages by design (see their own comments in lib/validation.ts /
// lib/errors.ts) -- the risk this removes is a genuinely unexpected
// exception (anything neither of those two produced) crossing the Server
// Action boundary as a thrown value instead of a plain, guaranteed-
// serializable object. A caught-and-returned result is the simplest,
// most battle-tested shape an RSC/Action boundary can carry; a thrown
// Error is a more complex path (digest generation, dev-vs-prod message
// stripping) that's more surface area for something to go wrong on.
export async function addResource(courseId: string, name: string): Promise<ActionResult<ResourceRow>> {
  try {
    await assertNotImpersonating();
    const courseIdV = parseInput(courseIdSchema, courseId);
    const nameV = parseInput(nonEmptyText(200, "Kaynak adı"), name);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Oturum bulunamadı." };

    const { data, error } = await supabase
      .from("student_resources")
      .insert({ student_id: user.id, course_id: courseIdV, name: nameV })
      .select("id, name, course_id")
      .single();

    if (error) throw dbError(error);

    revalidatePath("/student/kaynak-kutuphanesi");
    revalidatePath("/student/kaynak-takibi");
    return { ok: true, data: data as ResourceRow };
  } catch (e) {
    console.error("[addResource] failed:", e);
    Sentry.captureException(e);
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu." };
  }
}

// Bulk add ("Tümünü Ekle") moved to a Route Handler --
// app/api/kaynak-kutuphanesi/bulk-add/route.ts -- specifically so a
// failure comes back as a plain HTTP response inspectable in the
// browser's Network tab, independent of Server Action dispatch. See that
// file for the actual insert logic (same validation and RLS scoping as
// addResource above).
