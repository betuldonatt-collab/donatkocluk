"use server";

// Its own small "use server" file (same reasoning as app/coach/events/
// actions.ts): a client component importing one action out of the huge shared
// app/student/actions.ts is the shape that has bitten this app in production.
// Never throws -- always resolves to a plain { success, error? } object.

import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";

export type DismissFocusReviewResult = { success: true } | { success: false; error: string };

export async function dismissFocusReview(reviewId: string): Promise<DismissFocusReviewResult> {
  try {
    await assertNotImpersonating();
    const reviewIdV = parseInput(uuidSchema, reviewId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dismiss_focus_review", { p_review_id: reviewIdV });
    if (error) return { success: false, error: dbError(error).message };
    // false = not the caller's row, or still pending -- nothing was hidden.
    if (!data) return { success: false, error: "Bu kayıt gizlenemedi." };
    return { success: true };
  } catch (e) {
    console.error("[dismissFocusReview]", e);
    Sentry.captureException(e);
    return { success: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}
