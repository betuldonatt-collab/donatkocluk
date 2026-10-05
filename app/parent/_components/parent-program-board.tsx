"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Lock, Timer, XCircle } from "lucide-react";

import { TaskDescription } from "@/components/task-description";
import { isRoutineCourseId } from "@/lib/curriculum";
import { LGS_EXAM_SUBJECTS, MAARIF7_EXAM_SUBJECTS } from "@/lib/curriculum/subject-groups";
import { completionPercent } from "@/lib/completion";
import { weightedDayCounts } from "@/lib/effort-weight";
import { subjectBackgroundClass } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

// Read-only, parent-friendly week board for LGS parents (app/parent/program).
// Server component: plain data in, no client state, no edit/drag/timer controls.

export type ParentProgramTask = {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  course_id: string | null;
  task_date: string;
  status: "pending" | "done" | "half_done" | "not_done";
  order_index: number;
  is_coach_assigned: boolean;
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  subject_scores: Record<string, { correct?: number | null; wrong?: number | null; empty?: number | null }> | null;
  duration_minutes: number | null;
  tracked_duration_seconds: number | null;
  evidence_image_paths: string[];
  evidence_review_status: "none" | "pending" | "approved" | "rejected" | null;
  evidence_photo_status: Record<string, "approved" | "rejected"> | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  // The coach's optional note on a rejection (migration 0101); null when none.
  evidence_review_note: string | null;
  resource_names: string[];
  // storage path -> short-lived signed URL
  photo_urls: Record<string, string>;
};

export type ParentFixedTask = {
  id: string;
  title: string;
  description: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

const TASK_TYPE_LABELS: Record<string, string> = {
  question_bank: "Soru Çözümü",
  video: "Video İzleme",
  topic_study: "Konu Çalışması",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  extra_custom: "Ekstra Çalışma",
  reading: "Kitap Okuma",
};

const STATUS_LABELS: Record<ParentProgramTask["status"], string> = {
  pending: "Bekliyor",
  done: "Tamamlandı",
  half_done: "Yarım",
  not_done: "Yapılmadı",
};

const STATUS_COLORS: Record<ParentProgramTask["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  done: "bg-emerald-500/15 text-emerald-700",
  half_done: "bg-amber-500/15 text-amber-700",
  not_done: "bg-rose-500/15 text-rose-700",
};

// A task's parent-facing status. Coach review wins over the raw status: a
// held task is "waiting for the coach", a rejected one says so explicitly (it
// must stay visible to the parent), an approved one reads as its real status.
function displayStatus(task: ParentProgramTask): { label: string; className: string; icon: "clock" | "x" | "check" | null } {
  if (task.rejected_at || task.evidence_review_status === "rejected") {
    return { label: "Koç tarafından reddedildi", className: "bg-rose-500/15 text-rose-700", icon: "x" };
  }
  if (task.evidence_review_status === "pending") {
    return { label: "Koç onayı bekleniyor", className: "bg-amber-500/15 text-amber-700", icon: "clock" };
  }
  return {
    label: STATUS_LABELS[task.status],
    className: STATUS_COLORS[task.status],
    icon: task.status === "done" ? "check" : null,
  };
}

function formatTime(t: string) {
  return t.slice(0, 5);
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function shortDayName(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { weekday: "short", timeZone: "UTC" });
}

function dayNumber(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDate();
}

function shortMonth(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { month: "short", timeZone: "UTC" });
}

function dayOfWeekOf(iso: string) {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function StatsLine({ task }: { task: ParentProgramTask }) {
  // LGS (and 7th-grade) Genel Deneme: per-subject Doğru / Yanlış / Boş. The two exams have the same six subjects
  // under their own keys (lgs_* / m7_*).
  if (task.task_type === "general_exam" && task.subject_scores) {
    const rows = [...LGS_EXAM_SUBJECTS, ...MAARIF7_EXAM_SUBJECTS].filter((s) => task.subject_scores?.[s.key]);
    if (rows.length > 0) {
      return (
        <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
          {rows.map((s) => {
            const sc = task.subject_scores![s.key];
            return (
              <p key={s.key} className="text-muted-foreground tabular-nums">
                <span className="text-foreground font-medium">{s.label}</span> · D:{sc.correct ?? "—"} Y:{sc.wrong ?? "—"} B:{sc.empty ?? "—"}
              </p>
            );
          })}
        </div>
      );
    }
  }
  if (task.total_count === null && task.correct_count === null && task.wrong_count === null && task.empty_count === null) return null;
  return (
    <p className="text-muted-foreground text-xs tabular-nums">
      {task.total_count !== null && <>Toplam {task.total_count} · </>}
      D:{task.correct_count ?? "—"} Y:{task.wrong_count ?? "—"} B:{task.empty_count ?? "—"}
    </p>
  );
}

function TaskCard({ task }: { task: ParentProgramTask }) {
  const status = displayStatus(task);
  const typeLabel = TASK_TYPE_LABELS[task.task_type] ?? task.task_type;
  const photos = task.evidence_image_paths.filter((p) => task.photo_urls[p]);

  return (
    <div className={cn("border-border rounded-lg border p-2.5", subjectBackgroundClass(task.course_id, task.task_type))}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-foreground min-w-0 flex-1 text-sm font-medium break-words">{task.title}</p>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>
          {status.icon === "clock" && <Clock className="size-3" />}
          {status.icon === "x" && <XCircle className="size-3" />}
          {status.icon === "check" && <CheckCircle2 className="size-3" />}
          {status.label}
        </span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs">{typeLabel}</p>

      <TaskDescription text={task.description} lines={3} className="mt-1" />
      {task.resource_names.length > 0 && <p className="text-muted-foreground mt-1 text-xs break-words">{task.resource_names.join(" + ")}</p>}

      <div className="mt-2 space-y-1">
        <StatsLine task={task} />
        {!!task.tracked_duration_seconds && task.tracked_duration_seconds > 0 && (
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums">
            <Timer className="size-3" />
            Süre Tut: {formatDuration(task.tracked_duration_seconds)}
          </p>
        )}
        {(task.rejected_at || task.evidence_review_status === "rejected") && (task.evidence_review_note ?? (task.rejected_at ? task.rejection_reason : null)) && (
          <p className="text-xs text-rose-700">Koçun notu: {task.evidence_review_note ?? task.rejection_reason}</p>
        )}
      </div>

      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((path) => {
            const verdict = task.evidence_photo_status?.[path];
            return (
              <a
                key={path}
                href={task.photo_urls[path]}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "block size-14 overflow-hidden rounded-md border-2",
                  verdict === "approved" ? "border-emerald-500" : verdict === "rejected" ? "border-rose-500" : "border-border",
                )}
                title={verdict === "approved" ? "Onaylandı" : verdict === "rejected" ? "Reddedildi" : "Kanıt fotoğrafı"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={task.photo_urls[path]} alt="Kanıt fotoğrafı" loading="lazy" className="size-full object-cover" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ParentProgramBoard({
  days,
  today,
  tasks,
  fixedTasks,
}: {
  days: string[];
  today: string;
  tasks: ParentProgramTask[];
  fixedTasks: ParentFixedTask[];
}) {
  // Day tabs: today when it is inside the shown week, otherwise the first day.
  const [selected, setSelected] = useState(() => (days.includes(today) ? today : days[0]));
  const date = days.includes(selected) ? selected : days[0];

  const dayTasks = tasks.filter((t) => t.task_date === date);
  const routines = dayTasks.filter((t) => isRoutineCourseId(t.course_id));
  const regular = dayTasks.filter((t) => !isRoutineCourseId(t.course_id));
  const fixed = fixedTasks.filter((f) => f.day_of_week === dayOfWeekOf(date));
  const pct = completionPercent(weightedDayCounts(dayTasks, date));

  return (
    <div className="space-y-4">
      {/* Günlük Sekmeler: every tab carries the day name AND the date, so a
          parent picks a day at a glance instead of scrolling a long list. */}
      <div role="tablist" aria-label="Haftanın günleri" className="bg-secondary grid grid-cols-7 gap-1 rounded-xl p-1">
        {days.map((d) => {
          const active = d === date;
          const count = tasks.filter((t) => t.task_date === d).length;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(d)}
              className={cn(
                "flex min-w-0 flex-col items-center rounded-lg px-1 py-1.5 text-center transition-colors",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-[11px] font-medium">{shortDayName(d)}</span>
              <span className="text-base leading-tight font-semibold tabular-nums">{dayNumber(d)}</span>
              <span className={cn("text-[10px] leading-tight", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{shortMonth(d)}</span>
              <span
                aria-hidden
                className={cn("mt-0.5 size-1 rounded-full", d === today ? (active ? "bg-primary-foreground" : "bg-primary") : count > 0 ? (active ? "bg-primary-foreground/50" : "bg-muted-foreground/40") : "bg-transparent")}
              />
            </button>
          );
        })}
      </div>

      <section role="tabpanel" className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={cn("text-base font-semibold capitalize", date === today ? "text-primary" : "text-foreground")}>
            {dayLabel(date)}
            {date === today && <span className="text-primary/70 ml-2 text-xs font-normal normal-case">Bugün</span>}
          </h2>
          <span className="text-muted-foreground text-sm tabular-nums">
            {pct === null ? "—" : `%${pct}`}
            {dayTasks.length > 0 && (
              <span className="ml-1.5 text-xs">
                {dayTasks.filter((t) => t.status === "done").length}/{dayTasks.length}
              </span>
            )}
          </span>
        </header>

        {fixed.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">Sabit Görevler</p>
            <div className="space-y-1.5">
              {fixed.map((f) => (
                <div key={f.id} className="border-border/70 bg-muted/50 text-muted-foreground rounded-md border border-dashed px-2.5 py-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Lock className="size-3" />
                      {f.title}
                    </span>
                    <span className="tabular-nums">
                      {formatTime(f.start_time)}–{formatTime(f.end_time)}
                    </span>
                  </div>
                  <TaskDescription text={f.description} lines="all" className="mt-1 pl-[18px] text-[11px]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {routines.length > 0 && (
          <div>
            <p className="text-primary mb-1 text-[10px] font-semibold tracking-wide uppercase">Rutinler</p>
            <div className="space-y-1.5">
              {routines.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        )}

        {regular.length > 0 && (
          <div>
            {(routines.length > 0 || fixed.length > 0) && (
              <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">Görevler</p>
            )}
            <div className="space-y-1.5">
              {regular.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        )}

        {dayTasks.length === 0 && fixed.length === 0 && (
          <p className="text-muted-foreground border-border rounded-lg border border-dashed p-4 text-center text-sm">Bu gün için program yok.</p>
        )}
      </section>
    </div>
  );
}
