import { redirect } from "next/navigation";

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
// reference view, not a checklist). Gated to Maarif-grade students only
// (9th/10th/11th) -- same redirect pattern as app/student/ingilizce-quiz/
// page.tsx's own LGS-only gate, so a 12th-grade/mezun student can't reach
// it even by guessing the URL, not just by the sidebar link being hidden.
export default async function Tyt9And10Page() {
  const view = await requireViewContext("student");
  const supabase = await createClient();
  const grade = await fetchMaarifGrade(supabase, view.effectiveUserId);
  if (grade === null) redirect("/student");
  // Auto-detects the viewing student's own grade for the default tab --
  // 10th grade if that's their flag, 9th grade otherwise (covers 9th
  // graders and 11th graders, who share this page but have no tab of
  // their own). The tab itself is a free, one-click switch either way,
  // exactly like the AYT track tabs.
  return <Tyt9And10Dashboard defaultGrade={grade === 10 ? 10 : 9} />;
}
