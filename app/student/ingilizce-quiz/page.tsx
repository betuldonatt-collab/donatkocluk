import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireViewContext } from "@/lib/impersonation";
import { getStudentExamType } from "@/lib/student-exam-type";
import { fillUnitStats } from "@/lib/lgs-vocab";
import { VocabQuizDashboard } from "./vocab-quiz-dashboard";

export default async function IngilizceQuizPage() {
  await requireViewContext("student");
  // LGS-only feature -- a YKS/Maarif student who lands here anyway (a
  // stale link, browser back/forward) is sent back to their own dashboard
  // instead of seeing an empty or broken page.
  if ((await getStudentExamType()) !== "LGS") redirect("/student");

  const supabase = await createClient();
  // Aggregated in SQL (get_lgs_vocab_unit_stats, migration 0112), not fetched
  // as raw rows and summed here -- lgs_words can exceed PostgREST's default
  // per-request row cap (1000) once every unit is populated, which silently
  // truncated a plain "select every word" query before it ever reached this
  // page.
  const { data } = await supabase.rpc("get_lgs_vocab_unit_stats");
  const rows = (data ?? []) as { unit_number: number; total: number; mastered: number }[];
  const unitStats = fillUnitStats(rows.map((r) => ({ unitNumber: r.unit_number, total: r.total, mastered: r.mastered })));

  return <VocabQuizDashboard initialUnitStats={unitStats} />;
}
