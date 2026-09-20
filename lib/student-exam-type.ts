import { getViewContext } from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import type { ExamType } from "@/lib/exam-type";

// The cohort of the student whose panel is being rendered -- the EFFECTIVE
// user, so it stays correct while an admin impersonates. Server-only; every
// cohort-aware student page calls this once and passes the result down as
// the `examType` prop of the (otherwise shared) client components.
export async function getStudentExamType(): Promise<ExamType> {
  const view = await getViewContext("student");
  if (!view) return "YKS";
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("exam_type").eq("id", view.effectiveUserId).maybeSingle();
  return data?.exam_type === "LGS" ? "LGS" : "YKS";
}
