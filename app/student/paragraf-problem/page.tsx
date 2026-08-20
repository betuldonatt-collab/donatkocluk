import { createClient } from "@/lib/supabase/server";
import { computeNet } from "@/lib/scoring";
import { ParagrafProblemClient, type HistoryEntry } from "./paragraf-problem-client";

export default async function ParagrafProblemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = user
    ? await supabase
        .from("paragraf_problem_entries")
        .select("*")
        .eq("student_id", user.id)
        .order("entry_date", { ascending: true })
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

  return <ParagrafProblemClient initialHistory={history} />;
}
