import { requireViewContext } from "@/lib/impersonation";
import { computeMaarif11SubjectStats, MAARIF11_SUBJECTS } from "@/lib/maarif-11-data";
import { Maarif11Dashboard } from "./maarif-11-dashboard";

// 11. Sınıf Türkiye Yüzyılı Maarif Modeli -- foundational infrastructure
// only (routing/types/UI skeleton); the real curriculum content is pasted
// into MAARIF11_SUBJECTS (lib/maarif-11-data.ts) separately. Deliberately
// NOT gated to a specific cohort yet, unlike the LGS vocab quiz's own
// `getStudentExamType() !== "LGS"` redirect: there is no "11th grade Maarif"
// profile flag anywhere in the schema (only is_maarif9/is_maarif10, see
// migrations 0096/0099) -- adding one is a real, separate decision (new
// column, CHECK constraint, tampering-guard trigger, admin assignment UI)
// that wasn't part of this request. Every student can reach this page for
// now; add the grade-11 gate once that cohort flag actually exists.
export default async function Maarif11Page() {
  await requireViewContext("student");
  const subjectStats = computeMaarif11SubjectStats(MAARIF11_SUBJECTS);
  return <Maarif11Dashboard subjects={MAARIF11_SUBJECTS} subjectStats={subjectStats} />;
}
