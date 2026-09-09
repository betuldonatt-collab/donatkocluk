import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { computeNet } from "@/lib/scoring";
import { PARAGRAF_ENTRIES_PAGE_SIZE } from "./constants";
import { ParagrafProblemClient, type HistoryEntry } from "./paragraf-problem-client";

export default async function ParagrafProblemPage() {
  const view = await getViewContext("student");
  const supabase = await createClient();

  const { data: rows } = view
    ? await supabase
        .from("paragraf_problem_entries")
        .select("*")
        .eq("student_id", view.effectiveUserId)
        .order("entry_date", { ascending: false })
        .range(0, PARAGRAF_ENTRIES_PAGE_SIZE - 1)
    : { data: [] };

  const history: HistoryEntry[] = (rows ?? []).map((r) => ({
    id: r.id,
    date: r.entry_date,
    paragraf: {
      dogru: r.paragraf_dogru,
      yanlis: r.paragraf_yanlis,
      bos: r.paragraf_bos,
      sure: r.paragraf_sure,
      net: computeNet(r.paragraf_dogru, r.paragraf_yanlis),
    },
    problem: {
      dogru: r.problem_dogru,
      yanlis: r.problem_yanlis,
      bos: r.problem_bos,
      sure: r.problem_sure,
      net: computeNet(r.problem_dogru, r.problem_yanlis),
    },
  }));

  return <ParagrafProblemClient initialHistory={history} initialHasMore={history.length === PARAGRAF_ENTRIES_PAGE_SIZE} />;
}
