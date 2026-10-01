import { Layers } from "lucide-react";

import { requireViewContext } from "@/lib/impersonation";
import { EmptyState } from "@/components/ui/empty-state";

// Placeholder for the 9-10. Sınıf (TYT) curriculum browser -- a single page
// with a grade tab-switcher inside it (mirroring components/course-tabs.tsx's
// own TYT/AYT Tabs pattern, swapped for "9. Sınıf"/"10. Sınıf"), reading the
// already-populated lib/curriculum/maarif9.ts / maarif10.ts Kaynak Takibi
// datasets as plain informational cards -- no completion tracking, per the
// coach's own sign-off (this is a read-only reference view, not a checklist).
// Same ungated-for-now stance as app/student/11-sinif-maarif/page.tsx: every
// YKS student can reach it; no new cohort flag was requested.
export default async function Tyt9And10Page() {
  await requireViewContext("student");
  return (
    <EmptyState
      icon={Layers}
      title="9-10. Sınıf (TYT) yakında burada"
      description="Ders ve konu listesi, sınıf seçiciyle birlikte bir sonraki adımda eklenecek."
    />
  );
}
