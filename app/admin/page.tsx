import { createClient } from "@/lib/supabase/server";
import { CoachAssignmentTable } from "./coach-assignment-table";

export default async function AdminPage() {
  const supabase = await createClient();

  const [{ data: students }, { data: coaches }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
    supabase.from("coach_students").select("student_id, coach_id"),
  ]);

  const assignedCoachByStudent = Object.fromEntries(
    (assignments ?? []).map((a) => [a.student_id, a.coach_id]),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Admin Paneli</h1>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-foreground">Koç Atamaları</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Her öğrenciye bir koç ata. Bir öğrencinin tek bir koçu olabilir.
        </p>
        <CoachAssignmentTable
          students={students ?? []}
          coaches={coaches ?? []}
          assignedCoachByStudent={assignedCoachByStudent}
        />
      </section>
    </div>
  );
}
