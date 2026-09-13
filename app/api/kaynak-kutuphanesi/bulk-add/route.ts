import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { dbError } from "@/lib/errors";
import { nonEmptyText, parseInput } from "@/lib/validation";

// First Route Handler in this codebase -- every other mutation is a Server
// Action. This one exists specifically so a bulk-insert failure comes back
// as a plain HTTP response with an explicit status code and JSON body,
// inspectable directly in the browser's Network tab -- no Vercel/Sentry
// access required to see the real error. Everything below mirrors the
// validation and RLS-scoping addResources (./actions.ts) already did;
// this is a transport change, not a logic change.

// course_id is a curriculum slug (e.g. "tyt-matematik"), not a uuid --
// see the matching comment in ../actions.ts.
const courseIdSchema = nonEmptyText(100, "Ders");
const namesSchema = z.array(z.string().trim().min(1).max(200)).max(500);

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (e) {
      console.error("[api/kaynak-kutuphanesi/bulk-add] invalid JSON body:", e);
      return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const { courseId, names } = (body ?? {}) as { courseId?: unknown; names?: unknown };
    if (typeof courseId !== "string" || !Array.isArray(names)) {
      return NextResponse.json({ ok: false, error: "Eksik veya hatalı alan." }, { status: 400 });
    }

    const cleaned = names.map((n) => String(n).trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    await assertNotImpersonating();
    const courseIdV = parseInput(courseIdSchema, courseId);
    const namesV = parseInput(namesSchema, cleaned);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Oturum bulunamadı." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("student_resources")
      .insert(namesV.map((name) => ({ student_id: user.id, course_id: courseIdV, name })))
      .select("id, name, course_id");

    if (error) {
      console.error("[api/kaynak-kutuphanesi/bulk-add] insert failed:", {
        courseId: courseIdV,
        attemptedCount: namesV.length,
        error,
      });
      const safeError = dbError(error);
      return NextResponse.json({ ok: false, error: safeError.message }, { status: 500 });
    }

    revalidatePath("/student/kaynak-kutuphanesi");
    revalidatePath("/student/kaynak-takibi");
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    // Catches assertNotImpersonating()'s throw, parseInput()'s validation
    // throws, and anything genuinely unexpected -- this route never lets
    // an exception escape as Vercel's own generic error page. Every path
    // out of this handler is a JSON body with an explicit status.
    console.error("[api/kaynak-kutuphanesi/bulk-add] unexpected error:", e);
    Sentry.captureException(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu." },
      { status: 500 },
    );
  }
}
