"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ClipboardX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { findCourseById } from "@/lib/curriculum";
import { TrialResultsSection } from "@/app/coach/students/[id]/_components/kanban/trial-results-section";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import type { MissingExamAlert } from "../types";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// Same " - <Publisher>" title-suffix convention as CoachExamTopicTable's
// own parseExamPublisher (buildGeneralExamTitle/buildBranchExamTitle in
// app/coach/actions.ts) -- duplicated per call site, not imported.
function parseExamPublisher(title: string): string | null {
  const match = title.match(/-\s*([^-]+)$/);
  return match?.[1]?.trim() || null;
}

function formatExamStats(item: MissingExamAlert): string {
  const parts: string[] = [];
  if (item.totalCount != null) parts.push(`Toplam ${item.totalCount}`);
  if (item.correctCount != null) parts.push(`D: ${item.correctCount}`);
  if (item.wrongCount != null) parts.push(`Y: ${item.wrongCount}`);
  if (item.emptyCount != null) parts.push(`B: ${item.emptyCount}`);
  return parts.length > 0 ? parts.join(" · ") : "Sonuç henüz girilmedi";
}

// Same track-recovery convention as classifyTrack (app/coach/students/[id]/
// page.tsx) and parseGeneralExamTrack (coach-exam-analysis-section.tsx) --
// duplicated locally since this panel only needs it for display grouping,
// not the full course-catalog machinery those files carry.
function classifyTrack(item: MissingExamAlert): "tyt" | "ayt" | "lgs" {
  if (item.taskType === "general_exam") {
    if (/^LGS\b/i.test(item.title)) return "lgs";
    return /^AYT\b/i.test(item.title) ? "ayt" : "tyt";
  }
  if (item.courseId?.startsWith("ayt-")) return "ayt";
  if (item.courseId?.startsWith("lgs-")) return "lgs";
  return "tyt";
}

// Reconstructs a DetailTask-shaped object from this alert's flat fields so
// TrialResultsSection (built for the schedule board's TaskDrawer) can be
// reused here as-is -- every field it doesn't actually read gets a
// reasonable inert default.
function toDetailTask(item: MissingExamAlert): DetailTask {
  return {
    id: item.taskId,
    task_date: item.taskDate,
    task_type: item.taskType,
    title: item.title,
    description: null,
    course_id: item.courseId,
    topic_id: null,
    resource_ids: [],
    status: "done",
    completed: true,
    is_coach_assigned: false,
    is_approved_by_coach: true,
    total_count: item.totalCount,
    correct_count: item.correctCount,
    wrong_count: item.wrongCount,
    empty_count: item.emptyCount,
    duration_minutes: null,
    video_links: [],
    order_index: 0,
    is_locked: false,
    subject_scores: item.subjectScores,
    analysis_pending: true,
  };
}

type SubjectGroup = { label: string | null; items: MissingExamAlert[] };
type TypeGroup = { label: string; subjects: SubjectGroup[]; count: number };
type StudentGroup = { studentId: string; studentName: string | null; typeGroups: TypeGroup[]; count: number };

// Student > TYT/AYT & Branş/Genel > Ders (branch exams only) > items.
// General exams have no single course, so their subject level is skipped
// (label: null) -- the detail rows nest directly under the type header
// instead of under an empty subject header, keeping the indentation step
// meaningful at every level instead of introducing a blank one.
function groupAlerts(alerts: MissingExamAlert[]): StudentGroup[] {
  const order: string[] = [];
  const byStudent = new Map<
    string,
    { studentName: string | null; typeOrder: string[]; byType: Map<string, { subjectOrder: string[]; bySubject: Map<string, SubjectGroup> }> }
  >();

  for (const item of alerts) {
    const track = classifyTrack(item);
    const trackLabel = track === "lgs" ? "LGS" : track === "ayt" ? "AYT" : "TYT";
    const typeLabel = `${trackLabel} ${item.taskType === "general_exam" ? "Genel Deneme" : "Branş Denemesi"}`;
    const subjectLabel = item.taskType === "branch_exam" ? (findCourseById(item.courseId)?.name ?? "Diğer") : null;
    const subjectKey = subjectLabel ?? "__genel__";

    let student = byStudent.get(item.student.id);
    if (!student) {
      student = { studentName: item.student.full_name, typeOrder: [], byType: new Map() };
      byStudent.set(item.student.id, student);
      order.push(item.student.id);
    }
    let type = student.byType.get(typeLabel);
    if (!type) {
      type = { subjectOrder: [], bySubject: new Map() };
      student.byType.set(typeLabel, type);
      student.typeOrder.push(typeLabel);
    }
    let subject = type.bySubject.get(subjectKey);
    if (!subject) {
      subject = { label: subjectLabel, items: [] };
      type.bySubject.set(subjectKey, subject);
      type.subjectOrder.push(subjectKey);
    }
    subject.items.push(item);
  }

  return order.map((studentId) => {
    const s = byStudent.get(studentId)!;
    const typeGroups = s.typeOrder.map((label) => {
      const t = s.byType.get(label)!;
      const subjects = t.subjectOrder.map((key) => t.bySubject.get(key)!);
      return { label, subjects, count: subjects.reduce((n, sub) => n + sub.items.length, 0) };
    });
    return { studentId, studentName: s.studentName, typeGroups, count: typeGroups.reduce((n, t) => n + t.count, 0) };
  });
}

// The dashboard card itself stays a same-sized tile in alert-panel.tsx's
// grid (icon + title + count, same chrome as the plain-link AlertCards
// there) -- clicking it no longer jumps to the student's weekly plan, it
// opens the full hierarchical breakdown below instead, and "Analizi
// öğrenci yerine yap" is how the coach actually resolves an entry (rather
// than just being shown where it lives).
export function MissingExamAnalysisPanel({ alerts: initialAlerts }: { alerts: MissingExamAlert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [open, setOpen] = useState(false);
  const groups = groupAlerts(alerts);

  function handleResolved(taskId: string) {
    setAlerts((prev) => prev.filter((a) => a.taskId !== taskId));
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
          <ClipboardX className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Eksik Deneme Sonucu ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-xs">Yok</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {groups.length} öğrencide {alerts.length} analiz bekleyen deneme.
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

      <MissingExamDialog open={open} onOpenChange={setOpen} groups={groups} onResolved={handleResolved} />
    </>
  );
}

function MissingExamDialog({
  open,
  onOpenChange,
  groups,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: StudentGroup[];
  onResolved: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState<MissingExamAlert | null>(null);

  function toggleExpanded(studentId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function handleClose(next: boolean) {
    if (!next) setActiveItem(null);
    onOpenChange(next);
  }

  function handleSaved() {
    if (!activeItem) return;
    onResolved(activeItem.taskId);
    setActiveItem(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {activeItem ? (
          <>
            <DialogHeader>
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="text-muted-foreground hover:text-foreground mb-1 inline-flex w-fit items-center gap-1 text-xs"
              >
                <ArrowLeft className="size-3.5" />
                Listeye dön
              </button>
              <DialogTitle>
                {activeItem.student.full_name ?? "İsimsiz Öğrenci"} — {activeItem.title}
              </DialogTitle>
            </DialogHeader>
            <TrialResultsSection studentId={activeItem.student.id} task={toDetailTask(activeItem)} onSaved={handleSaved} />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Eksik Deneme Sonucu</DialogTitle>
            </DialogHeader>

            {groups.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Analiz bekleyen deneme kalmadı.</p>
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
                          {group.studentName ?? "İsimsiz Öğrenci"} ({group.count})
                        </span>
                        <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                      </button>

                      {isOpen && (
                        <div className="space-y-3 px-3 pb-3">
                          {group.typeGroups.map((type) => (
                            <div key={type.label} className="border-border border-l-2 pl-3">
                              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                {type.label} ({type.count})
                              </p>
                              <div className="mt-1.5 space-y-2.5">
                                {type.subjects.map((subject) => (
                                  <div key={subject.label ?? "genel"} className={subject.label ? "border-border border-l-2 pl-3" : ""}>
                                    {subject.label && <p className="text-foreground text-xs font-medium">{subject.label}</p>}
                                    <div className="mt-1.5 space-y-2">
                                      {subject.items.map((item) => {
                                        const publisher = parseExamPublisher(item.title);
                                        return (
                                          <div
                                            key={item.taskId}
                                            className="border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                                          >
                                            <div className="min-w-0 space-y-1">
                                              <p className="text-foreground text-sm font-medium">
                                                {formatDate(item.taskDate)}
                                                {publisher && <span className="text-muted-foreground font-normal"> · {publisher}</span>}
                                              </p>
                                              <p className="text-muted-foreground text-xs tabular-nums">{formatExamStats(item)}</p>
                                            </div>
                                            <Button type="button" size="sm" onClick={() => setActiveItem(item)}>
                                              Analizi öğrenci yerine yap
                                            </Button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
