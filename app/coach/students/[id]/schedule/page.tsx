import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import type { ScheduleDensity } from "@/lib/schedule-density";
import type { StudentEvent } from "../../../actions";
import type { CourseResourceData } from "../_components/kaynak-takibi-tab";
import type { DetailTask } from "../types";
import { ScheduleBoard } from "./schedule-board";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// A rolling 7-day window starting EXACTLY at referenceIso -- NOT
// Monday-aligned, mirroring schedule-board.tsx's own client-side nav so
// the very first render already matches whatever the board would compute
// itself (e.g. after a Prev/Next click). A dashboard deep-link's task date
// becomes the window's first day, front and center, rather than
// potentially buried mid-week the way the old Mon-Sun grid could leave it.
function getWeekDays(referenceIso: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${referenceIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    return { date, label: `${DAY_LABELS[dow]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

async function fetchScheduleData(studentId: string, weekDays: { date: string; label: string }[]) {
  const supabase = await createClient();

  const [{ data: profile }, { data: weekTaskRows }, { data: resourceRows }, { data: progressRows }, { data: taskResourceRows }, { data: eventRows }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("id", studentId).maybeSingle(),
      supabase
        .from("student_tasks")
        .select("*")
        .eq("student_id", studentId)
        .gte("task_date", weekDays[0].date)
        .lte("task_date", weekDays[6].date)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_resources")
        .select("id, name, course_id, is_active, kind, total_stock, remaining_stock")
        .eq("student_id", studentId)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_resource_progress")
        .select("course_id, topic_id, resource_id, solved, reviewed")
        .eq("student_id", studentId),
      supabase
        .from("task_resources")
        .select("task_id, resource_id, order_index, student_tasks!inner(student_id)")
        .eq("student_tasks.student_id", studentId)
        .order("order_index", { ascending: true }),
      supabase
        .from("student_events")
        .select("*")
        .eq("student_id", studentId)
        .gte("event_date", weekDays[0].date)
        .lte("event_date", weekDays[6].date)
        .order("order_index", { ascending: true }),
    ]);

  // Only resources/branchExamResources/progress are used on this page
  // (the ResourceCombobox in the task drawer) -- topicStats is never read
  // here, so an empty stub satisfies the shared CourseResourceData type
  // without computing it.
  const emptyTopicStats = { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } };
  const courseResourceData: CourseResourceData = {};
  function courseEntry(courseId: string) {
    return (courseResourceData[courseId] ??= { resources: [], branchExamResources: [], progress: {}, topicStats: emptyTopicStats });
  }
  for (const row of resourceRows ?? []) {
    const entry = courseEntry(row.course_id);
    if (row.kind === "branch_exam") {
      entry.branchExamResources.push({
        id: row.id,
        name: row.name,
        total_stock: row.total_stock ?? 0,
        remaining_stock: row.remaining_stock ?? 0,
        is_active: row.is_active,
      });
    } else {
      entry.resources.push({ id: row.id, name: row.name, is_active: row.is_active });
    }
  }
  for (const row of progressRows ?? []) {
    const entry = courseEntry(row.course_id);
    entry.progress[`${row.topic_id}::${row.resource_id}`] = { solved: row.solved, reviewed: row.reviewed };
  }

  const resourceIdsByTask = new Map<string, string[]>();
  for (const row of taskResourceRows ?? []) {
    const list = resourceIdsByTask.get(row.task_id) ?? [];
    list.push(row.resource_id);
    resourceIdsByTask.set(row.task_id, list);
  }

  return {
    profile: profile as { id: string; full_name: string | null } | null,
    weekTasks: (weekTaskRows ?? []).map((t) => ({ ...t, resource_ids: resourceIdsByTask.get(t.id) ?? [] })) as DetailTask[],
    courseResourceData,
    weekEvents: (eventRows ?? []) as StudentEvent[],
  };
}

export default async function SchedulePage(props: PageProps<"/coach/students/[id]/schedule">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const highlightTaskId = typeof searchParams.highlight === "string" ? searchParams.highlight : null;

  // A dashboard alert (e.g. "Eksik Deneme Sonucu") links here with the
  // specific task's id -- land on THAT task's own week, not always
  // today's, so the drawer auto-open below actually has something to
  // open.
  let referenceDate = todayISO();
  if (highlightTaskId) {
    const supabase = await createClient();
    const { data: targetTask } = await supabase.from("student_tasks").select("task_date").eq("id", highlightTaskId).maybeSingle();
    if (targetTask) referenceDate = targetTask.task_date;
  }

  const weekDays = getWeekDays(referenceDate);
  const [data, initialDensity] = await Promise.all([fetchScheduleData(id, weekDays), fetchCoachScheduleDensity()]);
  const studentName = data.profile?.full_name ?? "Öğrenci";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={`/coach/students/${id}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        {studentName}
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Haftalık Program</h1>
        <p className="text-muted-foreground text-sm">
          {studentName} için görev ata, kartları düzenle, kopyala veya sürükleyerek günler arasında taşı.
        </p>
      </header>

      <ScheduleBoard
        studentId={id}
        initialWeekDays={weekDays}
        initialTasks={data.weekTasks}
        initialEvents={data.weekEvents}
        courseResourceData={data.courseResourceData}
        highlightTaskId={highlightTaskId}
        initialDensity={initialDensity}
      />
    </div>
  );
}

// The COACH's own card-density preference -- effectiveUserId, not the `id`
// route param (that's the student being viewed). Falls back to "medium"
// (the same default profiles.schedule_density itself has) if the view
// context can't be resolved for any reason, rather than failing the page.
async function fetchCoachScheduleDensity(): Promise<ScheduleDensity> {
  const view = await getViewContext("coach");
  if (!view) return "medium";
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("schedule_density").eq("id", view.effectiveUserId).maybeSingle();
  return (data?.schedule_density as ScheduleDensity | undefined) ?? "medium";
}
