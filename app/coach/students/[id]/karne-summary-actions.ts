"use server";

// Its own small "use server" file (see app/coach/events/actions.ts for why a client component should not import its action out of the
// giant shared app/coach/actions.ts). Never throws: a client-invoked action's thrown error reaches the browser as an opaque React
// error in production, so every outcome is a plain { ok } object.

import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { fetchKarneSummary } from "@/lib/karne-summary-data";
import type { KarneSummary } from "@/lib/karne-summary";
import { parsePeriod } from "@/lib/karne-periods";
import { uuidSchema } from "@/lib/validation";

export type KarneSummaryResult = { ok: true; summary: KarneSummary } | { ok: false; error: string };

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

    const summary = await fetchKarneSummary(supabase, id.data, period.from, period.to, { today });
    return { ok: true, summary };
  } catch (e) {
    console.error("[karne summary]", e);
    Sentry.captureException(e);
    return { ok: false, error: "Karne hesaplanamadı, tekrar dene." };
  }
}
