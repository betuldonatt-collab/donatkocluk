"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Lock, Pencil, Plus, SquareArrowOutUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import { subjectBackgroundClass, taskStatusBorderClass } from "@/lib/subject-colors";
import { weekDates } from "@/lib/date";
import { getStudentTasksForWeek, type StudentFixedTask } from "../../../actions";
import { FixedTaskDialog, type FixedTaskDialogState } from "./fixed-task-dialog";
import type { DetailTask } from "../types";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const TASK_TYPE_LABELS: Record<string, string> = {
  question_bank: "Soru Çözümü",
  video: "Video İzleme",
  topic_study: "Konu Anlatımı",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  extra_custom: "Ekstra Çalışma",
  reading: "Kitap Okuma",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekDays(referenceIso: string) {
  return weekDates(referenceIso).map((date, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `${DAY_LABELS[i]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function statusLabel(task: DetailTask) {
  const isDone = task.status === "done" || task.completed;
  if (isDone) return "Yapıldı";
  if (task.status === "not_done") return "Yapılmadı";
  return "Bekliyor";
}

function taskLabel(task: DetailTask) {
  // Same reasoning as task-card-body.tsx's courseLabel -- the book's own
  // name (task.title) is what identifies a reading task, not the generic
  // "Kitap Okuma" pseudo-course name.
  if (task.course_id === "kitap-okuma") return task.title;
  const course = findCourseById(task.course_id);
  if (!course) return task.title;
  const prefix = task.course_id?.startsWith("tyt-") ? "TYT " : task.course_id?.startsWith("ayt-") ? "AYT " : "";
  const topic = findTopicById(task.course_id, task.topic_id);
  return topic ? `${prefix}${course.name} — ${topic.name}` : `${prefix}${course.name}`;
}

// Read-only weekly glance -- the coach edits the schedule on the
// dedicated /schedule workspace (full-width Kanban board); this tab is
// just a quick summary embedded in the rest of the student detail page.
// "Sabit Görevler" (Fixed Tasks) is the one part of this tab that's NOT
// read-only, though -- it's the manager for the student's recurring
// weekly skeleton (school hours, sports, ...), see migration 0081. It
// only lives here, never on the weekly planner itself (ScheduleBoard
// injects it read-only, doesn't let the coach edit it there -- see that
// component's own comment).
export function ProgramTab({
  studentId,
  initialWeekDays,
  initialTasks,
  initialFixedTasks,
}: {
  studentId: string;
  initialWeekDays: { date: string; label: string }[];
  initialTasks: DetailTask[];
  initialFixedTasks: StudentFixedTask[];
}) {
  const today = todayISO();
  const [weekDays, setWeekDays] = useState(initialWeekDays);
  const [tasks, setTasks] = useState(initialTasks);
  const [loading, setLoading] = useState(false);
  const [fixedTasks, setFixedTasks] = useState(initialFixedTasks);
  const [fixedTaskDialog, setFixedTaskDialog] = useState<FixedTaskDialogState | null>(null);

  const isCurrentWeek = weekDays.some((d) => d.date === today);

  async function loadWeek(newWeekDays: { date: string; label: string }[]) {
    setLoading(true);
    try {
      const rows = await getStudentTasksForWeek(studentId, newWeekDays[0].date, newWeekDays[6].date);
      setTasks(rows as DetailTask[]);
      setWeekDays(newWeekDays);
    } finally {
      setLoading(false);
    }
  }

  function handleFixedTaskCreated(task: StudentFixedTask) {
    setFixedTasks((prev) => [...prev, task].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)));
  }

  function handleFixedTaskSaved(task: StudentFixedTask) {
    setFixedTasks((prev) =>
      prev
        .map((t) => (t.id === task.id ? task : t))
        .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)),
    );
  }

  function handleFixedTaskDeleted(taskId: string) {
    setFixedTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-foreground text-sm font-semibold">Sabit Görevler</h3>
        <p className="text-muted-foreground text-xs">
          Öğrencinin her hafta aynı kalan sabit programı (okul, spor gibi) -- haftalık planlayıcıda otomatik olarak,
          salt okunur şekilde gösterilir.
        </p>
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {DAY_LABELS.map((dayLabel, dayOfWeek) => {
              const dayFixedTasks = fixedTasks.filter((t) => t.day_of_week === dayOfWeek);
              return (
                <div key={dayLabel} className="border-border bg-card/40 flex min-h-[100px] flex-col gap-2 rounded-lg border p-2">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="text-foreground truncate text-xs leading-tight font-semibold">{dayLabel}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-5 shrink-0"
                      onClick={() => setFixedTaskDialog({ mode: "create", dayOfWeek })}
                      aria-label={`${dayLabel} için sabit görev ekle`}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    {dayFixedTasks.length === 0 ? (
                      <p className="text-muted-foreground py-3 text-center text-[10px]">—</p>
                    ) : (
                      dayFixedTasks.map((t) => (
                        <div key={t.id} className="border-border bg-muted/30 group relative rounded-md border p-1.5 text-[11px]">
                          <p className="text-foreground truncate pr-9 font-medium break-words">{t.title}</p>
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Clock className="size-2.5 shrink-0" />
                            {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}
                          </p>
                          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-5"
                              onClick={() => setFixedTaskDialog({ mode: "edit", task: t })}
                              aria-label="Sabit görevi düzenle"
                            >
                              <Pencil className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, -7)))}
            aria-label="Önceki hafta"
            disabled={loading}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <input
            type="date"
            value={weekDays[0].date}
            onChange={(e) => e.target.value && loadWeek(getWeekDays(e.target.value))}
            disabled={loading}
            aria-label="Belirli bir haftaya git"
            className="border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, 7)))}
            aria-label="Sonraki hafta"
            disabled={loading}
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="text-foreground text-sm font-medium">
            {weekDays[0].label} – {weekDays[6].label}
          </span>
          {!isCurrentWeek && (
            <Button type="button" variant="ghost" size="sm" onClick={() => loadWeek(getWeekDays(today))} disabled={loading}>
              Bu Hafta
            </Button>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={`/coach/students/${studentId}/schedule`}>
            <SquareArrowOutUpRight className="size-3.5" />
            Tam Programı Aç
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayTasks = tasks.filter((t) => t.task_date === day.date);
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                className={cn(
                  "flex min-h-[160px] flex-col gap-2 rounded-lg border p-2",
                  isToday ? "border-primary/40 bg-primary/5" : "border-border bg-card/40",
                )}
              >
                <h3 className={cn("truncate text-xs leading-tight font-semibold", isToday ? "text-primary" : "text-foreground")}>
                  {day.label}
                </h3>
                <div className="flex flex-1 flex-col gap-1.5">
                  {dayTasks.length === 0 ? (
                    <p className="text-muted-foreground py-4 text-center text-[10px]">—</p>
                  ) : (
                    dayTasks.map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "border-border rounded-md border p-1.5 text-[11px]",
                          subjectBackgroundClass(task.course_id, task.task_type),
                          taskStatusBorderClass(task.status, task.completed),
                        )}
                      >
                        <div className="flex items-start gap-1">
                          <p className="text-foreground min-w-0 flex-1 font-medium break-words">{taskLabel(task)}</p>
                          {task.is_coach_assigned && <Lock className="text-muted-foreground mt-0.5 size-2.5 shrink-0" />}
                        </div>
                        <p className="text-muted-foreground break-words">
                          {TASK_TYPE_LABELS[task.task_type] ?? task.task_type} · {statusLabel(task)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {fixedTaskDialog && (
        <FixedTaskDialog
          state={fixedTaskDialog}
          studentId={studentId}
          onClose={() => setFixedTaskDialog(null)}
          onCreated={handleFixedTaskCreated}
          onSaved={handleFixedTaskSaved}
          onDeleted={handleFixedTaskDeleted}
        />
      )}
    </div>
  );
}
