import Link from "next/link";
import { CircleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { groupMissingByDate, STUDENT_PAGE_MISSING_TASKS_WINDOW_DAYS, type MissingTask } from "@/lib/missing-tasks";
import { MissingTaskDateGroups, type MissingTaskRow } from "../../../_components/missing-task-groups";
import type { DetailTask } from "../types";

// Newest days stay in view; older ones fold away so a long backlog doesn't
// push the tabs off the page.
const VISIBLE_DAYS = 3;

// "Tamamlanmayan Görevler" on the student's detail page: past-due tasks with
// no completion and (for LGS) no photo, boxed by day so the coach notices a
// missed task without opening the weekly board. Kitap Okuma never appears
// (see lib/missing-tasks.ts). Renders nothing when there are none -- an
// exception, not a permanent section, like the pending-review cards beside it.
export function MissingTasksCard({ items, studentId }: { items: MissingTask<DetailTask>[]; studentId: string }) {
  if (items.length === 0) return null;
  const rows: MissingTaskRow[] = items.map(({ task, reason }) => ({
    id: task.id,
    task_date: task.task_date,
    title: task.title,
    course_id: task.course_id,
    reason,
  }));
  const groups = groupMissingByDate(rows);
  const visible = groups.slice(0, VISIBLE_DAYS);
  const rest = groups.slice(VISIBLE_DAYS);

  return (
    <Card className="border-rose-500/40">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert className="size-4 text-rose-600" />
          Tamamlanmayan Görevler ({items.length})
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          Son {STUDENT_PAGE_MISSING_TASKS_WINDOW_DAYS} günde süresi geçen, tamamlanmayan görevler. Kitap Okuma dahil değildir.{" "}
          <Link href={`/coach/students/${studentId}?tab=program`} className="text-foreground underline underline-offset-2">
            Programda aç
          </Link>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <MissingTaskDateGroups groups={visible} />
        {rest.length > 0 && (
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium">
              <span className="group-open:hidden">Önceki {rest.length} günü göster</span>
              <span className="hidden group-open:inline">Gizle</span>
            </summary>
            <div className="mt-3">
              <MissingTaskDateGroups groups={rest} />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
