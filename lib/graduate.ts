// Server-side reads of the "Mezun" flag (profiles.is_graduate / signup_requests
// .is_graduate, migration 0117). Tolerant of the migration not being applied yet: any
// error (e.g. the column does not exist) just means "not a graduate", which is exactly
// how every student behaved before the flag existed.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchIsGraduate(supabase: SupabaseClient, studentId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("is_graduate").eq("id", studentId).maybeSingle();
  if (error) return false;
  return (data as { is_graduate?: boolean } | null)?.is_graduate === true;
}

export async function fetchRequestedGraduate(supabase: SupabaseClient, requestId: string): Promise<boolean> {
  const { data, error } = await supabase.from("signup_requests").select("is_graduate").eq("id", requestId).maybeSingle();
  if (error) return false;
  return (data as { is_graduate?: boolean } | null)?.is_graduate === true;
}

// Which of these rows are flagged (admin lists).
export async function fetchGraduateIds(
  supabase: SupabaseClient,
  table: "profiles" | "signup_requests",
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.from(table).select("id, is_graduate").in("id", ids);
  if (error) return new Set();
  return new Set(((data ?? []) as { id: string; is_graduate?: boolean }[]).filter((r) => r.is_graduate === true).map((r) => r.id));
}
