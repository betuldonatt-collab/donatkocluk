import { createClient } from "@/lib/supabase/server";
import { CoachAssignmentTable } from "./coach-assignment-table";

// Moved out of the main admin dashboard (app/admin/page.tsx) into its own
// route, same as parent-connections before it -- same data/queries/
// component as before (CoachAssignmentTable itself is untouched, only
// relocated and its relative import to ../actions updated), just no
// longer sharing the dashboard's single long scroll with every other
// admin section. Unlike parent-connections though, `students`/`coaches`/
// coach_students are ALSO read by the main dashboard's own Koç Performans
// Uyarıları and Yenileme Radarı sections -- this page fetches its own
// independent copy rather than the dashboard passing anything down, so
// the two routes stay fully decoupled; assignCoach/setStudentStatus/
// updateSessionQuota (app/admin/actions.ts) revalidate BOTH paths since
// they're genuinely visible on both.
export default async function CoachConnectionsPage() {
  const supabase = await createClient();

  const [{ data: students }, { data: coaches }, { data: assignments }, { data: coachProfiles }, { data: completedSessionCounts }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, is_active, exit_category, exit_note, total_session_quota, exam_type")
        .eq("role", "student")
        .order("full_name"),
      supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
      supabase.from("coach_students").select("student_id, coach_id"),
      supabase.from("coach_profiles").select("coach_id, max_students"),
      supabase.from("student_completed_session_counts").select("student_id, completed_count"),
    ]);

  const assignedCoachByStudent = Object.fromEntries((assignments ?? []).map((a) => [a.student_id, a.coach_id]));

  const activeCountByCoach = new Map<string, number>();
  for (const a of assignments ?? []) {
    activeCountByCoach.set(a.coach_id, (activeCountByCoach.get(a.coach_id) ?? 0) + 1);
  }
  const maxStudentsByCoach = new Map((coachProfiles ?? []).map((cp) => [cp.coach_id, cp.max_students]));
  const coachesWithCapacity = (coaches ?? []).map((c) => ({
    ...c,
    activeCount: activeCountByCoach.get(c.id) ?? 0,
    maxStudents: maxStudentsByCoach.get(c.id) ?? 20,
  }));

  const completedCountByStudent = Object.fromEntries(
    (completedSessionCounts ?? []).map((row) => [row.student_id, row.completed_count]),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Koç Öğrenci Eşleştirmeleri</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Her öğrenciye bir koç ata. Bir öğrencinin tek bir koçu olabilir.
        </p>
      </header>

      <CoachAssignmentTable
        students={students ?? []}
        coaches={coachesWithCapacity}
        assignedCoachByStudent={assignedCoachByStudent}
        completedCountByStudent={completedCountByStudent}
      />
    </div>
  );
}
