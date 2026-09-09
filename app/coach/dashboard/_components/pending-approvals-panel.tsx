"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { findCourseById } from "@/lib/curriculum";
import { cn } from "@/lib/utils";
import { approveStudentTask, rejectStudentTask, type ApprovalActionResult, type PendingStudentTask } from "../../actions";

const TASK_TYPE_LABELS: Record<string, string> = {
  question_bank: "Soru Çözümü",
  branch_exam: "Branş Denemesi",
  general_exam: "Genel Deneme",
  topic_study: "Konu Çalışması",
};

type PendingTask = PendingStudentTask & { studentId: string; studentName: string | null };
type StudentGroup = { studentId: string; studentName: string | null; tasks: PendingTask[] };

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// null when the task carries no logged numbers at all yet (e.g. a
// topic_study/video entry the student hasn't marked done) -- rendered as
// "Sonuç henüz girilmedi" instead of an empty stats line.
function formatTaskStats(task: PendingTask): string | null {
  const parts: string[] = [];
  if (task.total_count != null) parts.push(`Toplam ${task.total_count}`);
  if (task.correct_count != null) parts.push(`D: ${task.correct_count}`);
  if (task.wrong_count != null) parts.push(`Y: ${task.wrong_count}`);
  if (task.empty_count != null) parts.push(`B: ${task.empty_count}`);
  if (task.duration_minutes != null) parts.push(`${task.duration_minutes} dk`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Same order the flat list arrived in (task_date descending, from
// getPendingStudentTasks) is preserved within each group -- just
// re-bucketed by student, first-seen order.
function groupByStudent(tasks: PendingTask[]): StudentGroup[] {
  const order: string[] = [];
  const byStudent = new Map<string, StudentGroup>();
  for (const task of tasks) {
    let group = byStudent.get(task.studentId);
    if (!group) {
      group = { studentId: task.studentId, studentName: task.studentName, tasks: [] };
      byStudent.set(task.studentId, group);
      order.push(task.studentId);
    }
    group.tasks.push(task);
  }
  return order.map((id) => byStudent.get(id)!);
}

// Student self-created tasks (createRichCustomTask) start
// is_approved_by_coach: false and stay out of Kaynak Takibi/Gelişim
// Haritası/Karne until a coach reviews them here. A matching notification
// entry (syncPendingApprovalNotifications) mirrors this same list into
// Bildirimler and the sidebar's unread badge.
//
// The dashboard card itself is a same-sized 7th tile in alert-panel.tsx's
// grid (same Card/CardHeader chrome as the plain-link AlertCards there --
// icon + title + count), kept deliberately compact -- a quick summary and
// nothing more. Full review (grouped by student, every logged detail, the
// actual Onayla/Reddet actions) lives in the ApprovalsDialog below, opened
// either by clicking the card or its own "Detaylı İncele" button, so the
// coach always has the full picture before acting rather than approving
// off a truncated one-line summary.
export function PendingApprovalsPanel({ tasks: initialTasks }: { tasks: PendingTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [open, setOpen] = useState(false);
  const groups = groupByStudent(tasks);

  // Optimistic remove/restore pair -- ApprovalsDialog owns the actual
  // approve/reject calls, this just keeps the one shared list in sync so
  // the dashboard card's own count and the dialog always agree.
  function removeTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  // Puts a task back if its optimistic removal turned out to be wrong
  // (the server call actually failed) -- re-sorted by task_date
  // descending to land back where getPendingStudentTasks would have
  // placed it, not just appended at the end.
  function restoreTask(task: PendingTask) {
    setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task].sort((a, b) => b.task_date.localeCompare(a.task_date))));
  }

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        className="hover:bg-accent/20 cursor-pointer transition-colors"
      >
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ClipboardCheck className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Onay Bekleyen Ekstra Çalışmalar ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-xs">Yok</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {groups.length} öğrenciden {tasks.length} bekleyen kayıt.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                }}
              >
                Detaylı İncele
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <ApprovalsDialog open={open} onOpenChange={setOpen} groups={groups} onRemove={removeTask} onRestore={restoreTask} />
    </>
  );
}

function ApprovalsDialog({
  open,
  onOpenChange,
  groups,
  onRemove,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: StudentGroup[];
  onRemove: (taskId: string) => void;
  onRestore: (task: PendingTask) => void;
}) {
  const [isPending, startTransition] = useTransition();
  // Tracks which single row is mid-action and which action it is, so the
  // Onayla/Reddet pair on every OTHER row stays clickable while one row
  // is saving -- not a single dialog-wide "something is loading" flag.
  const [actingId, setActingId] = useState<string | null>(null);
  const [actingType, setActingType] = useState<"approve" | "reject" | null>(null);
  // Accordion state: which students' task lists are expanded. Starts
  // fully collapsed -- with dozens of students each carrying several
  // pending tasks, mounting every row for every student at once is the
  // exact DOM bloat this dialog exists to avoid; a collapsed group's
  // tasks aren't rendered at all until the coach opens it, not just
  // visually clipped behind a scroll container.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(studentId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  // Shared by both actions below: optimistically remove the row, run the
  // server call, and reconcile based on what actually happened --
  // success confirms the removal, ALREADY_PROCESSED means the task was
  // genuinely resolved elsewhere (student deleted it, another session
  // approved/rejected it first) so the removal stays and the coach gets
  // a calm explanation instead of a scary error, and any other failure
  // (network, a real server error) rolls the row back so the UI never
  // sits out of sync with what the backend actually has.
  function runAction(
    task: PendingTask,
    type: "approve" | "reject",
    action: (id: string) => Promise<ApprovalActionResult<unknown>>,
  ) {
    setActingId(task.id);
    setActingType(type);
    onRemove(task.id);
    startTransition(async () => {
      try {
        const result = await action(task.id);
        if (!result.success) {
          if (result.code === "ALREADY_PROCESSED") {
            toast.error("Bu görev öğrenci tarafından zaten silinmiş veya güncellenmiş.");
          }
          return;
        }
      } catch (e) {
        onRestore(task);
        toast.error(e instanceof Error ? e.message : type === "approve" ? "Onaylanamadı, tekrar dene." : "Reddedilemedi, tekrar dene.");
      } finally {
        setActingId(null);
        setActingType(null);
      }
    });
  }

  const handleApprove = (task: PendingTask) => runAction(task, "approve", approveStudentTask);
  const handleReject = (task: PendingTask) => runAction(task, "reject", rejectStudentTask);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onay Bekleyen Ekstra Çalışmalar</DialogTitle>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Onay bekleyen kayıt kalmadı.</p>
        ) : (
          <div className="divide-border divide-y rounded-lg border">
            {groups.map((group) => {
              const isOpen = expanded.has(group.studentId);
              return (
                <div key={group.studentId}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(group.studentId)}
                    aria-expanded={isOpen}
                    className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors"
                  >
                    <span className="text-foreground text-sm font-semibold">
                      {group.studentName ?? "İsimsiz Öğrenci"} ({group.tasks.length})
                    </span>
                    <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                  </button>

                  {isOpen && (
                    <div className="space-y-2 px-3 pb-3">
                      <Link
                        href={`/coach/students/${group.studentId}`}
                        className="text-primary inline-block text-xs hover:underline"
                      >
                        Öğrenci profiline git
                      </Link>
                      {group.tasks.map((task) => {
                        const course = findCourseById(task.course_id);
                        const stats = formatTaskStats(task);
                        const isActing = isPending && actingId === task.id;
                        return (
                          <div
                            key={task.id}
                            className="border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="text-foreground text-sm font-medium">{task.title}</p>
                              <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                                <span>{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</span>
                                <span>{course ? course.name : "—"}</span>
                                <span>{formatDate(task.task_date)}</span>
                              </div>
                              <p className="text-muted-foreground text-xs">
                                {stats ?? <span className="italic">Sonuç henüz girilmedi</span>}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button type="button" size="sm" disabled={isActing} onClick={() => handleApprove(task)}>
                                {isActing && actingType === "approve" ? "Onaylanıyor..." : "Onayla"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/40 gap-1"
                                disabled={isActing}
                                onClick={() => handleReject(task)}
                              >
                                <X className="size-3.5" />
                                {isActing && actingType === "reject" ? "Reddediliyor..." : "Reddet"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
