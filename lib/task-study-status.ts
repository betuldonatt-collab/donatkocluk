import type { SupabaseClient } from "@supabase/supabase-js";

// student_tasks.study_status (migration 0138) keeps the student's own pick for the study / video part of a Konu Çalışması / Video task,
// apart from the overall status (lib/effort-weight.ts). Every query that feeds a completion percentage reads it -- but a query that names
// a column the database does not have yet fails as a whole, so until the migration has been run each of them leaves the column out and the
// percentages fall back to reading the overall status as that pick (effectiveStudyStatus). The probe is cheap and cached per server instance.

export const STUDY_STATUS_COLUMN = "study_status";

const RECHECK_MS = 60_000;
let cached: { available: boolean; checkedAt: number } | null = null;

export async function studyStatusColumnAvailable(supabase: SupabaseClient): Promise<boolean> {
  const now = Date.now();
  // Once seen, it stays: a column is not dropped again. A miss is re-checked every minute, so running the migration takes effect without a restart.
  if (cached && (cached.available || now - cached.checkedAt < RECHECK_MS)) return cached.available;
  const { error } = await supabase.from("student_tasks").select(STUDY_STATUS_COLUMN).limit(1);
  cached = { available: !error, checkedAt: now };
  return cached.available;
}

// ", study_status" to append to a select list of student_tasks columns -- or "" while the migration is not there yet. (Typed as the two
// literals, not string, so the query builder can still read the column list at compile time.)
export async function studyStatusSelect(supabase: SupabaseClient): Promise<", study_status" | ""> {
  return (await studyStatusColumnAvailable(supabase)) ? ", study_status" : "";
}

// For tests: forget what was learned.
export function resetStudyStatusProbe(): void {
  cached = null;
}
