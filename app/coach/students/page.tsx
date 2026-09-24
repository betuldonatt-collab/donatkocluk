import Link from "next/link";
import { BookOpen, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { completionPercent } from "@/lib/completion";
import { weightedCompletionCounts, type WeightableTask } from "@/lib/effort-weight";
import { mondayOf } from "@/lib/date";
import { formatPercentile } from "@/lib/profile-terms";
import { createClient } from "@/lib/supabase/server";
import { sessionBalance, type SessionBalanceRow } from "@/lib/session-balance";
import { getViewContext } from "@/lib/impersonation";

type StudentRow = {
  id: string;
  full_name: string | null;
  city: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  remaining_sessions: number;
  target_university: string | null;
  target_department: string | null;
  target_high_school: string | null;
  target_percentile: number | null;
  exam_type: "YKS" | "LGS";
  completionPct: number | null;
};

async function fetchRoster(coachId: string): Promise<StudentRow[]> {
  const supabase = await createClient();
  const { data: links } = await supabase.from("coach_students").select("student_id").eq("coach_id", coachId);
  const studentIds = (links ?? []).map((l) => l.student_id);
  if (studentIds.length === 0) return [];

  // This week's lock per student: where each one's completion starts counting.
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: profiles }, { data: taskRows }, { data: lockRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, city, parent_name, parent_phone, remaining_sessions, target_university, target_department, target_high_school, target_percentile, exam_type")
      .in("id", studentIds),
    supabase.from("student_tasks").select("student_id, status, task_date, task_type, course_id, title, total_count, duration_minutes").in("student_id", studentIds),
    supabase.from("week_locks").select("student_id, locked_at").in("student_id", studentIds).eq("week_start_date", mondayOf(today)),
    supabase.from("coaching_sessions").select("student_id, is_paid, outcome").in("student_id", studentIds),
  ]);
  const sessionsByStudent = new Map<string, SessionBalanceRow[]>();
  for (const s of sessionRows ?? []) {
    const list = sessionsByStudent.get(s.student_id) ?? [];
    list.push({ is_paid: s.is_paid, outcome: s.outcome });
    sessionsByStudent.set(s.student_id, list);
  }

  // Only tasks from the lock day (Monday if not locked) up to today count (lib/completion.ts).
  const lockedAtByStudent = new Map((lockRows ?? []).map((r) => [r.student_id, r.locked_at as string]));
  const tasksByStudent = new Map<string, WeightableTask[]>();
  for (const t of taskRows ?? []) {
    const list = tasksByStudent.get(t.student_id) ?? [];
    list.push({
      task_date: t.task_date,
      status: t.status,
      task_type: t.task_type,
      course_id: t.course_id,
      title: t.title,
      total_count: t.total_count,
      duration_minutes: t.duration_minutes,
    });
    tasksByStudent.set(t.student_id, list);
  }

  return (profiles ?? []).map((p) => ({
    ...p,
    // Derived balance (paid - completed), not the stale profiles column.
    remaining_sessions: sessionBalance(sessionsByStudent.get(p.id) ?? []).remaining,
    completionPct: completionPercent(weightedCompletionCounts(tasksByStudent.get(p.id) ?? [], today, lockedAtByStudent.get(p.id))),
  }));
}

function formatTarget(row: StudentRow) {
  // LGS students: "Lise — %percentile" instead of university — department.
  if (row.exam_type === "LGS") {
    const percentile = row.target_percentile !== null ? formatPercentile(row.target_percentile) : null;
    if (row.target_high_school && percentile) return `${row.target_high_school} — ${percentile}`;
    return row.target_high_school || percentile || "—";
  }
  if (row.target_university && row.target_department) return `${row.target_university} — ${row.target_department}`;
  return row.target_university || row.target_department || "—";
}

function completionDotClass(pct: number | null): string | null {
  if (pct === null) return null;
  if (pct >= 85) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

export default async function CoachStudentsPage() {
  const view = await getViewContext("coach");
  const roster = view ? await fetchRoster(view.effectiveUserId) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Öğrencilerim</h1>
        <p className="text-muted-foreground text-sm">Detaylarını görmek için bir öğrenciye tıkla.</p>
      </header>

      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Henüz sana atanmış bir öğrenci yok."
          description="Yeni bir öğrenci atandığında burada listelenecek. Atamalar yönetici tarafından yapılır."
        />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>Şehir/İlçe</TableHead>
                <TableHead>Program Tamamlama</TableHead>
                <TableHead>Veli Ad Soyad</TableHead>
                <TableHead>Veli Tel No</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="size-3.5" />
                    Kalan Görüşme
                  </span>
                </TableHead>
                <TableHead>Öğrenci Hedefi</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((row) => (
                <TableRow key={row.id} className="hover:bg-accent/40">
                  <TableCell className="font-medium">
                    <Link href={`/coach/students/${row.id}`} className="flex items-center gap-2">
                      {completionDotClass(row.completionPct) && (
                        <span
                          className={cn("size-2 shrink-0 rounded-full", completionDotClass(row.completionPct))}
                          title={`Bugüne kadarki tamamlama: %${row.completionPct}`}
                        />
                      )}
                      {row.full_name ?? "İsimsiz Öğrenci"}
                    </Link>
                  </TableCell>
                  <TableCell>{row.city || "—"}</TableCell>
                  <TableCell>
                    {row.completionPct === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="tabular-nums">%{row.completionPct}</span>
                    )}
                  </TableCell>
                  <TableCell>{row.parent_name || "—"}</TableCell>
                  <TableCell>{row.parent_phone || "—"}</TableCell>
                  <TableCell className="tabular-nums">{row.remaining_sessions}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{formatTarget(row)}</TableCell>
                  <TableCell>
                    <Link href={`/coach/students/${row.id}`} className="text-primary text-sm font-medium hover:underline">
                      Detay
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
