import { createClient } from "@/lib/supabase/server";
import { ParentAssignmentTable } from "./parent-assignment-table";

// Moved out of the main admin dashboard (app/admin/page.tsx) into its own
// route, per the coach's request -- same data/queries/component as
// before (ParentAssignmentTable itself is untouched, only relocated and
// its relative imports updated), just no longer sharing the dashboard's
// single long scroll with every other admin section.
export default async function ParentConnectionsPage() {
  const supabase = await createClient();

  const [{ data: parents }, { data: students }, { data: parentLinks }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "parent").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name"),
    supabase.from("parent_students").select("parent_id, student_id"),
  ]);

  const linksByParent: Record<string, string[]> = {};
  for (const link of parentLinks ?? []) {
    (linksByParent[link.parent_id] ??= []).push(link.student_id);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Öğrenci Veli Eşleştirmeleri</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bir veli hesabını bir veya daha fazla öğrenciyle eşleştir.
        </p>
      </header>

      <ParentAssignmentTable parents={parents ?? []} students={students ?? []} linksByParent={linksByParent} />
    </div>
  );
}
