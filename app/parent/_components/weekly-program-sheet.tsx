"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { findCourseById } from "@/lib/curriculum";
import { cn } from "@/lib/utils";

export type ProgramTaskType = "question_bank" | "video" | "topic_study" | "branch_exam" | "general_exam" | "extra_custom";

export type ProgramTask = {
  id: string;
  title: string;
  task_type: ProgramTaskType;
  course_id: string | null;
  task_date: string;
  status: "pending" | "done" | "half_done" | "not_done";
};

const STATUS_LABELS: Record<ProgramTask["status"], string> = {
  pending: "Bekliyor",
  done: "Tamamlandı",
  half_done: "Yarım",
  not_done: "Yapılmadı",
};
// Bekliyor reads as a neutral gray -- it's not a warning, just "hasn't
// happened yet" -- while Tamamlandı/Yapılmadı are the two outcomes that
// actually need the green/red at-a-glance signal the parent cares about.
const STATUS_COLORS: Record<ProgramTask["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  done: "bg-emerald-500/15 text-emerald-700",
  half_done: "bg-amber-500/15 text-amber-700",
  not_done: "bg-rose-500/15 text-rose-700",
};

const TASK_TYPE_LABELS: Record<ProgramTaskType, string> = {
  question_bank: "Soru Çözümü",
  video: "Video İzleme",
  topic_study: "Konu Çalışması",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  extra_custom: "Ekstra Çalışma",
};

function subjectLabel(courseId: string | null) {
  const course = findCourseById(courseId);
  if (!course) return null;
  const prefix = courseId?.startsWith("tyt-") ? "TYT " : courseId?.startsWith("ayt-") ? "AYT " : "";
  return `${prefix}${course.name}`;
}

// "Course + Task Type" (e.g. "TYT Türkçe - Soru Çözümü") -- task.title
// alone used to get shown right above a course-name badge that repeated
// the same subject a second time, reading as two near-duplicate boxes for
// one task. General Deneme has no course_id, so its own title (which
// already carries the publisher, e.g. "TYT Genel Deneme - 3D Yayınları")
// is used as-is instead of being re-prefixed.
function taskDisplayName(task: ProgramTask): string {
  if (task.task_type === "general_exam") return task.title;
  const subject = subjectLabel(task.course_id);
  const typeLabel = TASK_TYPE_LABELS[task.task_type];
  return subject ? `${subject} - ${typeLabel}` : task.title;
}

function formatDayHeading(dateIso: string) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// Read-only by design -- parents may VIEW the weekly program but must not
// be able to toggle status, edit, or delete anything here.
export function WeeklyProgramSheet({ tasks }: { tasks: ProgramTask[] }) {
  const [open, setOpen] = useState(false);

  const byDate = new Map<string, ProgramTask[]>();
  for (const task of tasks) {
    const bucket = byDate.get(task.task_date) ?? [];
    bucket.push(task);
    byDate.set(task.task_date, bucket);
  }
  const sortedDates = [...byDate.keys()].sort();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          <CalendarDays className="size-4" />
          Haftalık Programı İncele
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Haftalık Program</SheetTitle>
        </SheetHeader>

        {sortedDates.length === 0 ? (
          <p className="text-muted-foreground text-sm">Bu hafta için atanmış bir görev yok.</p>
        ) : (
          <div className="space-y-5">
            {sortedDates.map((date) => (
              <div key={date}>
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  {formatDayHeading(date)}
                </p>
                <div className="space-y-2">
                  {byDate.get(date)!.map((task) => (
                    <div key={task.id} className="border-border rounded-lg border p-3">
                      <p className="text-foreground text-sm font-medium">{taskDisplayName(task)}</p>
                      <span
                        className={cn(
                          "mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                          STATUS_COLORS[task.status],
                        )}
                      >
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
