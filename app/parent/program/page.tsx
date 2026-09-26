import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";
import { isLgsParentView } from "@/lib/parent-lgs";
import { mondayOf, weekDates } from "@/lib/date";
import { EVIDENCE_BUCKET, isEvidencePathFor } from "@/lib/task-evidence";
import { ParentProgramBoard, type ParentFixedTask, type ParentProgramTask } from "../_components/parent-program-board";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rangeLabel(start: string, end: string) {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}

// LGS parents only: a read-only, parent-friendly view of the student's whole
// week -- Sabit Görevler, Rutinler and the coach-assigned tasks with their
// results, evidence photos and timer durations. Any other cohort (and an
// unlinked parent) is sent back to the normal dashboard before anything is
// fetched.
export default async function ParentProgramPage({ searchParams }: PageProps<"/parent/program">) {
  const params = await searchParams;
  const weekParam = typeof params.week === "string" && DATE_RE.test(params.week) ? params.week : null;

  const studentId = await getActiveStudentId();
  if (!studentId) redirect("/parent");

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, exam_type").eq("id", studentId).maybeSingle();
  if (!profile || !isLgsParentView(profile.exam_type)) redirect("/parent");

  const today = todayISO();
  const start = mondayOf(weekParam ?? today);
  const days = weekDates(start);
  const end = days[6];

  const [{ data: taskRows }, { data: fixedRows }] = await Promise.all([
    supabase
      .from("student_tasks")
      .select(
        "id, title, description, task_type, course_id, task_date, status, order_index, is_coach_assigned, total_count, correct_count, wrong_count, empty_count, subject_scores, duration_minutes, tracked_duration_seconds, evidence_image_paths, evidence_review_status, evidence_photo_status, rejected_at, rejection_reason",
      )
      .eq("student_id", studentId)
      .gte("task_date", start)
      .lte("task_date", end)
      .order("task_date", { ascending: true })
      .order("order_index", { ascending: true }),
    supabase
      .from("student_fixed_tasks")
      .select("id, title, description, day_of_week, start_time, end_time")
      .eq("student_id", studentId)
      .order("start_time", { ascending: true }),
  ]);

  const taskList = (taskRows ?? []) as (Omit<ParentProgramTask, "resource_names" | "photo_urls"> & { evidence_image_paths: string[] | null })[];
  const taskIds = taskList.map((t) => t.id);

  // Resource names (which book a task was assigned from) -- one query, grouped.
  const resourceNamesByTask = new Map<string, string[]>();
  if (taskIds.length > 0) {
    const { data: resourceRows } = await supabase
      .from("task_resources")
      .select("task_id, order_index, student_resources(name)")
      .in("task_id", taskIds)
      .order("order_index", { ascending: true });
    for (const row of resourceRows ?? []) {
      const rel = (row as unknown as { student_resources: { name: string } | { name: string }[] | null }).student_resources;
      const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
      if (!name) continue;
      const list = resourceNamesByTask.get(row.task_id) ?? [];
      list.push(name);
      resourceNamesByTask.set(row.task_id, list);
    }
  }

  // Evidence photos: the bucket is private, so each path becomes a short-lived
  // signed URL (allowed to this parent by the 0100 storage policy). Only paths
  // that really belong to this student's task folder are ever signed.
  const photoUrlsByTask = new Map<string, Record<string, string>>();
  await Promise.all(
    taskList.map(async (t) => {
      const paths = (t.evidence_image_paths ?? []).filter((p) => isEvidencePathFor(p, studentId, t.id));
      if (paths.length === 0) return;
      const { data } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
      }
      photoUrlsByTask.set(t.id, map);
    }),
  );

  const tasks: ParentProgramTask[] = taskList.map((t) => ({
    ...t,
    evidence_image_paths: t.evidence_image_paths ?? [],
    resource_names: resourceNamesByTask.get(t.id) ?? [],
    photo_urls: photoUrlsByTask.get(t.id) ?? {},
  }));

  const currentMonday = mondayOf(today);
  const isCurrentWeek = start === currentMonday;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Haftalık Program</h1>
          <p className="text-muted-foreground text-sm">{profile.full_name ?? "Öğrenci"} -- salt okunur</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Önceki hafta">
            <Link href={`/parent/program?week=${addDays(start, -7)}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <span className="text-foreground min-w-0 text-center text-sm font-medium">{rangeLabel(start, end)}</span>
          <Button asChild variant="outline" size="icon" aria-label="Sonraki hafta">
            <Link href={`/parent/program?week=${addDays(start, 7)}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          {!isCurrentWeek && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/parent/program">Bu Hafta</Link>
            </Button>
          )}
        </div>
      </header>

      <ParentProgramBoard days={days} today={today} tasks={tasks} fixedTasks={(fixedRows ?? []) as ParentFixedTask[]} />
    </div>
  );
}
