import type { SupabaseClient } from "@supabase/supabase-js";

// profiles.is_maarif9 (migration 0096): the student is a 9th grader on the
// Maarif curriculum. Read on its own, and tolerant of the column not
// existing yet (a deploy that lands before the migration is applied) --
// any error just means "not a 9th grader", which is exactly how every
// existing student behaves, so no page can break over this flag.
export async function fetchIsMaarif9(supabase: SupabaseClient, studentId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("is_maarif9").eq("id", studentId).maybeSingle();
  if (error) return false;
  return (data as { is_maarif9?: boolean } | null)?.is_maarif9 === true;
}
