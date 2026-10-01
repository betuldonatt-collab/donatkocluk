import { redirect } from "next/navigation";

import { requireViewContext } from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import { computeMaarif11SubjectStats, MAARIF11_SUBJECTS } from "@/lib/maarif-11-data";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { Maarif11Dashboard } from "./maarif-11-dashboard";

// 11. Sınıf Türkiye Yüzyılı Maarif Modeli -- the real curriculum content is
// still pasted into MAARIF11_SUBJECTS (lib/maarif-11-data.ts) separately.
// Gated to an actual 11th-grade student (profiles.is_maarif11, migration
// 0114) -- same redirect pattern as app/student/ingilizce-quiz/page.tsx's
// own LGS-only gate, so a 9th/10th grader (or any other student) can't
// reach it even by guessing the URL, not just by the sidebar link being
// hidden for them.
export default async function Maarif11Page() {
  const view = await requireViewContext("student");
  const supabase = await createClient();
  const grade = await fetchMaarifGrade(supabase, view.effectiveUserId);
  if (grade !== 11) redirect("/student");
  const subjectStats = computeMaarif11SubjectStats(MAARIF11_SUBJECTS);
  return <Maarif11Dashboard subjects={MAARIF11_SUBJECTS} subjectStats={subjectStats} />;
}
