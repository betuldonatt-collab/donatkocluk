"use server";

// Its own small "use server" file (see app/coach/events/actions.ts for why a client component should not import its action out of the
// giant shared app/coach/actions.ts). Never throws: a client-invoked action's thrown error reaches the browser as an opaque React
// error in production, so every outcome is a plain { ok } object.

import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { loadKarneSummary } from "@/lib/karne-summary-data";
import type { KarneSummary } from "@/lib/karne-summary";
import { parsePeriod } from "@/lib/karne-periods";
import { uuidSchema } from "@/lib/validation";

// frozen = the numbers are the snapshot an approval stored (what the student and the parent see); sinifSube / examType feed the same header
// line the student's and the parent's Karne show (lib/karne-view.ts).
export type KarneSummaryResult =
  | { ok: true; summary: KarneSummary; frozen: boolean; sinifSube: string | null; examType: string | null }
  | { ok: false; error: string };

// The live Karne numbers of one of the coach's students for a period (the report card preview of the Karneler tab). Reading only:
// what comes back is whatever the coach's own row-level access lets them read (an admin previewing the panel reads everything).
export async function getKarneSummary(studentId: string, from: string, to: string): Promise<KarneSummaryResult> {
  try {
    const id = uuidSchema.safeParse(studentId);
    if (!id.success) return { ok: false, error: "Geçersiz öğrenci." };
    const today = new Date().toISOString().slice(0, 10);
    const period = parsePeriod(from, to, today);
    if (!period) return { ok: false, error: "Geçerli bir tarih aralığı seç (başlangıç bitişten önce olmalı, en fazla 1 yıl)." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Oturum bulunamadı." };

    const [{ data: link }, { data: me }] = await Promise.all([
      supabase.from("coach_students").select("student_id").eq("coach_id", user.id).eq("student_id", id.data).maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    ]);
    if (!link && me?.role !== "admin") return { ok: false, error: "Bu öğrenci sana atanmamış." };

    const [loaded, { data: profile }] = await Promise.all([
      loadKarneSummary(supabase, id.data, period.from, period.to, { today }),
      supabase.from("profiles").select("sinif_sube, exam_type").eq("id", id.data).maybeSingle(),
    ]);
    return {
      ok: true,
      summary: loaded.summary,
      frozen: loaded.frozen,
      sinifSube: (profile as { sinif_sube?: string | null } | null)?.sinif_sube ?? null,
      examType: (profile as { exam_type?: string | null } | null)?.exam_type ?? null,
    };
  } catch (e) {
    console.error("[karne summary]", e);
    Sentry.captureException(e);
    return { ok: false, error: "Karne hesaplanamadı, tekrar dene." };
  }
}
