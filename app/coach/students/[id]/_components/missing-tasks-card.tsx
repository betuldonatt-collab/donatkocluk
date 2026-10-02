import Link from "next/link";
import { CircleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findCourseById } from "@/lib/curriculum";
import { MISSING_TASKS_WINDOW_DAYS, type MissingTask, type MissingTaskReason } from "@/lib/missing-tasks";
import type { DetailTask } from "../types";

const REASON_LABEL: Record<MissingTaskReason, string> = {
  no_photo: "Kanıt fotoğrafı yok",
  photo_rejected: "Fotoğraf reddedildi",
  not_done: "Yapılmadı",
  incomplete: "Tamamlanmadı",
};

const REASON_STYLE: Record<MissingTaskReason, string> = {
  no_photo: "bg-rose-500/10 text-rose-700",
  photo_rejected: "bg-rose-500/10 text-rose-700",
  not_done: "bg-amber-500/10 text-amber-700",
  incomplete: "bg-amber-500/10 text-amber-700",
};

const VISIBLE_ROWS = 6;

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}

function Row({ item }: { item: MissingTask<DetailTask> }) {
  const course = findCourseById(item.task.course_id);
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.task.title}</p>
        <p className="text-muted-foreground text-xs">
          {formatDay(item.task.task_date)}
          {course ? ` · ${course.name}` : ""}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${REASON_STYLE[item.reason]}`}>
        {REASON_LABEL[item.reason]}
      </span>
    </li>
  );
}

// "Tamamlanmayan Görevler" on the student's detail page: past-due tasks with
// no completion and (for LGS) no photo, so the coach notices a missed task
// without opening the weekly board. Kitap Okuma never appears (see
// lib/missing-tasks.ts). Renders nothing when there are none -- an exception,
// not a permanent section, like the pending-review cards beside it.
export function MissingTasksCard({ items, studentId }: { items: MissingTask<DetailTask>[]; studentId: string }) {
  if (items.length === 0) return null;
  const visible = items.slice(0, VISIBLE_ROWS);
  const rest = items.slice(VISIBLE_ROWS);

  return (
    <Card className="border-rose-500/40">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert className="size-4 text-rose-600" />
          Tamamlanmayan Görevler ({items.length})
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          Son {MISSING_TASKS_WINDOW_DAYS} günde süresi geçen, tamamlanmayan görevler. Kitap Okuma dahil değildir.{" "}
          <Link href={`/coach/students/${studentId}?tab=program`} className="text-foreground underline underline-offset-2">
            Programda aç
          </Link>
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {visible.map((item) => (
            <Row key={item.task.id} item={item} />
          ))}
        </ul>
        {rest.length > 0 && (
          <details className="group mt-1">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer py-2 text-xs font-medium">
              <span className="group-open:hidden">Kalan {rest.length} görevi göster</span>
              <span className="hidden group-open:inline">Gizle</span>
            </summary>
            <ul className="divide-y">
              {rest.map((item) => (
                <Row key={item.task.id} item={item} />
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
