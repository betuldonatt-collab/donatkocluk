import { requireViewContext } from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { Tyt9And10Dashboard } from "./tyt-9-10-dashboard";

// 9-10. Sınıf (TYT) curriculum browser -- a single page with a 9th/10th
// grade tab switcher (components/ui/tabs, same primitive components/
// course-tabs.tsx uses for its own TYT/AYT tabs), reading the already-
// populated lib/curriculum/maarif9.ts / maarif10.ts Kaynak Takibi datasets
// (MAARIF9_KAYNAK_COURSES / MAARIF10_KAYNAK_COURSES) as plain informational
// cards -- no progress tracking, per sign-off (this is a read-only
// reference view, not a checklist). Same ungated stance as app/student/
// 11-sinif-maarif/page.tsx: every YKS student can reach it, 9th/10th/11th
// grade alike.
export default async function Tyt9And10Page() {
  const view = await requireViewContext("student");
  const supabase = await createClient();
  // Auto-detects the viewing student's own grade for the default tab --
  // 10th grade if that's their flag, 9th grade otherwise (covers 9th
  // graders, every non-Maarif YKS student, and -- until a future
  // is_maarif11 flag exists -- 11th graders too). The tab itself is a
  // free, one-click switch either way, exactly like the AYT track tabs.
  const grade = await fetchMaarifGrade(supabase, view.effectiveUserId);
  return <Tyt9And10Dashboard defaultGrade={grade === 10 ? 10 : 9} />;
}
