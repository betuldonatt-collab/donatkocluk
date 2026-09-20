import Link from "next/link";
import { BookOpen, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatPercentile } from "@/lib/profile-terms";
import { createClient } from "@/lib/supabase/server";
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

  const [{ data: profiles }, { data: taskRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, city, parent_name, parent_phone, remaining_sessions, target_university, target_department, target_high_school, target_percentile, exam_type")
      .in("id", studentIds),
    supabase.from("student_tasks").select("student_id, status").in("student_id", studentIds),
  ]);

  const totalsByStudent = new Map<string, { total: number; done: number }>();
  for (const t of taskRows ?? []) {
    const bucket = totalsByStudent.get(t.student_id) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if (t.status === "done") bucket.done += 1;
    totalsByStudent.set(t.student_id, bucket);
  }

  return (profiles ?? []).map((p) => {
    const bucket = totalsByStudent.get(p.id);
    return {
      ...p,
      completionPct: bucket && bucket.total > 0 ? Math.round((bucket.done / bucket.total) * 100) : null,
    };
  });
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
                          title={`Genel tamamlama: %${row.completionPct}`}
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
