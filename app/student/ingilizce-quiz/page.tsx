import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireViewContext } from "@/lib/impersonation";
import { getStudentExamType } from "@/lib/student-exam-type";
import { buildUnitStats } from "@/lib/lgs-vocab";
import { fetchAllPages } from "@/lib/paged-select";
import { VocabQuizDashboard } from "./vocab-quiz-dashboard";

export default async function IngilizceQuizPage() {
  const view = await requireViewContext("student");
  // LGS-only feature -- a YKS/Maarif student who lands here anyway (a
  // stale link, browser back/forward) is sent back to their own dashboard
  // instead of seeing an empty or broken page.
  if ((await getStudentExamType()) !== "LGS") redirect("/student");

  const supabase = await createClient();
  // Aggregated in SQL (get_lgs_vocab_unit_stats, migrations 0112 / 0130), not fetched
  // as raw rows and summed here -- lgs_words can exceed PostgREST's default
  // per-request row cap (1000) once every unit is populated, which silently
  // truncated a plain "select every word" query before it ever reached this
  // page.
  const { data } = await supabase.rpc("get_lgs_vocab_unit_stats");
  const rows = (data ?? []) as { unit_number: number; total: number; mastered?: number | null; level1?: number | null; level2?: number | null }[];

  // The three tiers are counted from the student's own progress rows (correct_count), not taken from the RPC's extra columns --
  // every word the student has answered correctly at least once, with the unit it belongs to. Paged: a student can have more
  // rows than one request returns.
  type ProgressRow = { correct_count: number; lgs_words: { unit_number: number } | { unit_number: number }[] | null };
  const progress = await fetchAllPages<ProgressRow>((from, to, withCount) =>
    supabase
      .from("student_word_progress")
      .select("correct_count, lgs_words!inner(unit_number)", withCount ? { count: "exact" } : undefined)
      .eq("student_id", view.effectiveUserId)
      .gt("correct_count", 0)
      .order("word_id", { ascending: true })
      .range(from, to),
  );
  const progressRows = progress.error
    ? null
    : progress.data.flatMap((p) => {
        const word = Array.isArray(p.lgs_words) ? p.lgs_words[0] : p.lgs_words;
        return word ? [{ unit_number: word.unit_number, correct_count: p.correct_count }] : [];
      });
  const unitStats = buildUnitStats(rows, progressRows);

  return <VocabQuizDashboard initialUnitStats={unitStats} />;
}
