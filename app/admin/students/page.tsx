import { Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssignStudentModal } from "./_components/assign-student-modal";
import { PoolLegend } from "./_components/pool-legend";
import { PaginationControls } from "../_components/pagination-controls";

const PAGE_SIZE = 25;

type AcademicTrack = "yks_sayisal" | "yks_ea" | "yks_sozel" | "yks_ydt" | "lgs_ortaokul";

const TRACK_LABELS: Record<AcademicTrack, string> = {
  yks_sayisal: "YKS-Sayısal",
  yks_ea: "YKS-EA",
  yks_sozel: "YKS-Sözel",
  yks_ydt: "YKS-YDT",
  lgs_ortaokul: "LGS/Ortaokul",
};

const POOL_STATUS_LABELS: Record<string, string> = {
  new: "Yeni Kayıt - Bekliyor",
  quota_completed: "Pasif - Yenileme Bekliyor",
  absenteeism: "Pasif - Devamsız",
};
const POOL_STATUS_COLORS: Record<string, string> = {
  new: "bg-emerald-500/15 text-emerald-700",
  quota_completed: "bg-amber-500/15 text-amber-700",
  absenteeism: "bg-rose-500/15 text-rose-700",
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function formatRelativeTime(iso: string | null) {
  if (!iso) return "Hiç görülmedi";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function Avatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- admin-only directory thumbnail, not worth next/image's config for
    return <img src={avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />;
  }
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
      {initial}
    </div>
  );
}

async function fetchDirectoryData(page: number) {
  const supabase = await createClient();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // coach_students/coach_profiles stay full, unpaginated fetches -- both
  // feed the assign-modal's per-coach active/capacity counts, which must
  // reflect every assignment platform-wide regardless of which page of
  // students is showing, not just the current page's students.
  const [{ data: students, count }, { data: coachLinks }, { data: coaches }, { data: coachProfiles }, { data: parents }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, avatar_url, pool_status, pool_status_changed_at, total_session_quota, admin_notes, academic_track, last_active_at, exam_type",
          { count: "exact" },
        )
        .eq("role", "student")
        .order("full_name")
        .range(from, to),
      supabase.from("coach_students").select("student_id, coach_id"),
      supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
      supabase.from("coach_profiles").select("coach_id, max_students"),
      supabase.from("profiles").select("id, full_name").eq("role", "parent").order("full_name"),
    ]);
  // 9th-grade flag (migration 0096), read separately and tolerant of the column
  // not existing yet -- any error just means nobody is flagged.
  const { data: maarif9Rows, error: maarif9Error } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_maarif9", true)
    .in("id", (students ?? []).map((st) => st.id));
  const maarif9Ids = new Set(maarif9Error ? [] : (maarif9Rows ?? []).map((r) => r.id));

  const coachIdByStudent = new Map((coachLinks ?? []).map((l) => [l.student_id, l.coach_id]));
  const coachNameById = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));

  const activeCountByCoach = new Map<string, number>();
  for (const l of coachLinks ?? []) {
    activeCountByCoach.set(l.coach_id, (activeCountByCoach.get(l.coach_id) ?? 0) + 1);
  }
  const maxByCoach = new Map((coachProfiles ?? []).map((cp) => [cp.coach_id, cp.max_students]));

  const availableCoaches = (coaches ?? [])
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      activeCount: activeCountByCoach.get(c.id) ?? 0,
      maxStudents: maxByCoach.get(c.id) ?? 20,
    }))
    .filter((c) => c.activeCount < c.maxStudents);

  const directory = (students ?? []).map((s) => {
    const coachId = coachIdByStudent.get(s.id) ?? null;
    return {
      ...s,
      isMaarif9: maarif9Ids.has(s.id),
      coachId,
      coachName: coachId ? (coachNameById.get(coachId) ?? "(İsimsiz)") : null,
      isOnline: s.last_active_at ? Date.now() - new Date(s.last_active_at).getTime() < ONLINE_WINDOW_MS : false,
    };
  });

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return { directory, availableCoaches, parents: parents ?? [], totalPages };
}

export default async function StudentDirectoryPage({
  searchParams,
}: PageProps<"/admin/students">) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const { directory, availableCoaches, parents, totalPages } = await fetchDirectoryData(page);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Öğrenci Rehberi ve Havuzu</h1>
        <p className="text-muted-foreground mt-1 text-sm">Sistemdeki tüm öğrenciler -- atanmış ve havuzdaki.</p>
      </header>

      <PoolLegend />

      {directory.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={Users}
          title="Henüz kayıtlı öğrenci yok."
          description="Kayıt isteği onaylandığında öğrenciler burada, havuzda görünecek."
        />
      ) : (
        <div className="border-border mt-6 overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Öğrenci</TableHead>
                <TableHead>Akademik Alan</TableHead>
                <TableHead>Koç Durumu</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {directory.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={student.full_name} avatarUrl={student.avatar_url} />
                      <div>
                        <p className="text-foreground font-medium">{student.full_name ?? "(İsimsiz)"}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                          <span className={`size-1.5 rounded-full ${student.isOnline ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                          <span className="text-muted-foreground">
                            {student.isOnline ? "Çevrimiçi" : `Son görülme: ${formatRelativeTime(student.last_active_at)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={
                          student.exam_type === "LGS"
                            ? "rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                            : "bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-[10px] font-medium"
                        }
                      >
                        {student.exam_type === "LGS" ? "LGS" : "YKS"}
                      </span>
                      {student.academic_track ? (
                        <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs">
                          {/* Fallback keeps an unexpected value from rendering an empty chip. */}
                          {TRACK_LABELS[student.academic_track as AcademicTrack] ?? student.academic_track}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {student.coachName ? (
                      <span className="text-foreground text-sm">Koç: {student.coachName}</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            POOL_STATUS_COLORS[student.pool_status] ?? POOL_STATUS_COLORS.new
                          }`}
                        >
                          {POOL_STATUS_LABELS[student.pool_status] ?? POOL_STATUS_LABELS.new}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {daysSince(student.pool_status_changed_at)} Gündür Pasif
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <AssignStudentModal
                        student={{ id: student.id, full_name: student.full_name, admin_notes: student.admin_notes, academic_track: student.academic_track, is_maarif9: student.isMaarif9 }}
                        coaches={availableCoaches}
                        parents={parents}
                        assignedCoachName={student.coachName}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls currentPage={page} totalPages={totalPages} basePath="/admin/students" />
    </div>
  );
}
