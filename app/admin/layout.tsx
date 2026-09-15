import { createClient } from "@/lib/supabase/server";
import { requireViewContext } from "@/lib/impersonation";
import { DashboardShell } from "@/components/dashboard-shell";
import { AdminSidebar } from "./_components/admin-sidebar";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const view = await requireViewContext("admin");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", view.effectiveUserId).maybeSingle();

  return (
    <div className="flex flex-1 flex-col">
      <DashboardShell sidebar={<AdminSidebar fullName={profile?.full_name ?? null} />}>
        {children}
      </DashboardShell>
    </div>
  );
}
