import { requireViewContext } from "@/lib/impersonation";
import { fetchParentAnnouncements } from "@/lib/announcements";
import { getActiveStudentId, getLinkedStudents } from "@/lib/parent-context";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnnouncementCenter } from "./_components/announcement-center";
import { ParentSidebar } from "./_components/parent-sidebar";
import { StudentSwitcher } from "./_components/student-switcher";

export default async function ParentLayout({ children }: LayoutProps<"/parent">) {
  await requireViewContext("parent");
  const [students, activeStudentId] = await Promise.all([getLinkedStudents(), getActiveStudentId()]);
  const announcements = await fetchParentAnnouncements(activeStudentId);

  return (
    <div className="flex flex-1 flex-col">
      <DashboardShell sidebar={<ParentSidebar />}>
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
