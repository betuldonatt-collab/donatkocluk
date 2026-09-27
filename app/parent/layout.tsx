import { createClient } from "@/lib/supabase/server";
import { logPerf, startPerf } from "@/lib/perf-log";
import { requireViewContext } from "@/lib/impersonation";
import { fetchParentAnnouncements } from "@/lib/announcements";
import { getActiveStudentId, getLinkedStudents } from "@/lib/parent-context";
import { isLgsParentView } from "@/lib/parent-lgs";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnnouncementCenter } from "./_components/announcement-center";
import { ParentSidebar } from "./_components/parent-sidebar";
import { StudentSwitcher } from "./_components/student-switcher";

export default async function ParentLayout({ children }: LayoutProps<"/parent">) {
  const perfStart = startPerf();
  const view = await requireViewContext("parent");
  const [students, activeStudentId, { data: profile }] = await Promise.all([
    getLinkedStudents(),
    getActiveStudentId(),
    createClient().then((supabase) => supabase.from("profiles").select("full_name").eq("id", view.effectiveUserId).maybeSingle()),
  ]);
  const fullName = profile?.full_name ?? null;
  // The "Haftalık Program" sidebar link exists only for a parent of an LGS student;
  // the cohort comes with the linked-students query that already ran (cached), so
  // no extra round trip.
  const showProgram = isLgsParentView(students.find((s) => s.id === activeStudentId)?.exam_type);
  const announcements = await fetchParentAnnouncements(activeStudentId);
  logPerf("parent layout data", perfStart);

  return (
    <div className="flex flex-1 flex-col">
      <DashboardShell sidebar={<ParentSidebar fullName={fullName} showProgram={showProgram} />}>
        <div className="flex flex-1 flex-col">
          {students.length > 1 && activeStudentId && (
            <StudentSwitcher students={students} activeStudentId={activeStudentId} />
          )}
          <div className="flex-1">{children}</div>
        </div>
      </DashboardShell>
      <AnnouncementCenter announcements={announcements} />
    </div>
  );
}
