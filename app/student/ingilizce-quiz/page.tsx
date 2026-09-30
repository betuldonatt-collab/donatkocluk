import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireViewContext } from "@/lib/impersonation";
import { getStudentExamType } from "@/lib/student-exam-type";
import { computeUnitStats } from "@/lib/lgs-vocab";
import { VocabQuizDashboard } from "./vocab-quiz-dashboard";

export default async function IngilizceQuizPage() {
  const view = await requireViewContext("student");
  // LGS-only feature -- a YKS/Maarif student who lands here anyway (a
  // stale link, browser back/forward) is sent back to their own dashboard
  // instead of seeing an empty or broken page.
  if ((await getStudentExamType()) !== "LGS") redirect("/student");

  const supabase = await createClient();
  const [{ data: words }, { data: masteredRows }] = await Promise.all([
    supabase.from("lgs_words").select("id, unit_number"),
    supabase
      .from("student_word_progress")
      .select("word_id")
      .eq("student_id", view.effectiveUserId)
      .eq("is_mastered", true),
  ]);

  const unitStats = computeUnitStats(words ?? [], new Set((masteredRows ?? []).map((r) => r.word_id)));

  return <VocabQuizDashboard initialUnitStats={unitStats} />;
}
