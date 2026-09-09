import { requireViewContext } from "@/lib/impersonation";
import { DashboardShell } from "@/components/dashboard-shell";
import { AdminSidebar } from "./_components/admin-sidebar";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireViewContext("admin");

  return (
    <div className="flex flex-1 flex-col">
      <DashboardShell sidebar={<AdminSidebar />}>
        {children}
      </DashboardShell>
    </div>
  );
}
