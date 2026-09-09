"use client";

import { Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Course, Topic } from "@/lib/curriculum";
import type { DetailTask } from "../types";

type Row = { topic: Topic; unitLabel: string; unitRowSpan: number | null };

// Same unit-rowSpan flattening as the student panel's own ExamTopicTable.
function flattenRows(course: Course): Row[] {
  const rows: Row[] = [];
  for (const group of course.units) {
    if (group.unit === "-") {
      for (const topic of group.topics) {
        rows.push({ topic, unitLabel: "-", unitRowSpan: 1 });
      }
    } else {
      group.topics.forEach((topic, i) => {
        rows.push({ topic, unitLabel: group.unit, unitRowSpan: i === 0 ? group.topics.length : null });
      });
    }
  }
  return rows;
}

function formatExamDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

// Same publisher-suffix convention as the student panel's own
// parseExamPublisher -- both exam types append " - <Publisher>" to their
// title (buildGeneralExamTitle / buildBranchExamTitle in app/coach/actions.ts).
function parseExamPublisher(title: string): string {
  const match = title.match(/-\s*([^-]+)$/);
  return match?.[1]?.trim() || "—";
}

// Coach-panel duplicate of the student's ExamTopicTable (app/student/
// deneme-analizleri/_components/exam-topic-table.tsx) per this app's
// per-panel UI-duplication convention -- same sticky column and card
// header design, but opens the coach's own TaskDrawer (via onOpenExam)
// instead of the student's TaskModal, and adds a delete button per exam.
export function CoachExamTopicTable({
  course,
  exams,
  mistakesByExam,
  onOpenExam,
  onDelete,
}: {
  course: Course;
  exams: DetailTask[];
  mistakesByExam: Record<string, Set<string>>;
  onOpenExam: (task: DetailTask) => void;
  onDelete: (taskId: string) => void;
}) {
  const rows = flattenRows(course);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{course.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-background sticky left-0 z-20 w-12 align-bottom">Ünite</TableHead>
                <TableHead className="bg-background sticky left-12 z-20 border-r align-bottom">Konu</TableHead>
                {exams.map((exam) => (
                  <TableHead key={exam.id} className="border-l p-0 text-center">
                    <div className="flex w-full flex-col items-center gap-1 px-2 py-2 text-center">
                      <div className="flex w-full items-center justify-between gap-1">
                        <span className="w-3.5 shrink-0" />
                        <span className="text-foreground max-w-24 truncate text-xs font-semibold" title={exam.title}>
                          {parseExamPublisher(exam.title)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-3.5 shrink-0"
                          onClick={() => onDelete(exam.id)}
                          aria-label="Denemeyi sil"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                      <span className="text-muted-foreground text-[10px] font-normal">
                        {formatExamDate(exam.task_date)}
                      </span>
                      <span className="text-muted-foreground text-[10px] font-normal tabular-nums">
                        T:{exam.total_count ?? "—"} D:{exam.correct_count ?? "—"} Y:{exam.wrong_count ?? "—"} B:
                        {exam.empty_count ?? "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenExam(exam)}
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-colors",
                          exam.analysis_pending
                            ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {exam.analysis_pending ? "Analiz Bekliyor" : "Sonuçları Düzenle"}
                      </button>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.topic.id}>
                  {row.unitRowSpan !== null && (
                    <TableCell
                      rowSpan={row.unitRowSpan}
                      className={cn(
                        "bg-card sticky left-0 z-10 border-r p-0 text-center align-middle",
                        row.unitRowSpan === 1 && "text-muted-foreground",
                      )}
                    >
                      {row.unitLabel === "-" ? (
                        "-"
                      ) : (
                        <div className="flex h-full items-center justify-center py-2">
                          <span className="[writing-mode:vertical-rl] rotate-180 font-medium">
                            {row.unitLabel}
                          </span>
                        </div>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="bg-card sticky left-12 z-10 border-r font-medium whitespace-normal">
                    {row.topic.name}
                  </TableCell>
                  {exams.map((exam) => {
                    const missed = mistakesByExam[exam.id]?.has(row.topic.id) ?? false;
                    return (
                      <TableCell key={exam.id} className="border-l text-center">
                        {missed && <X className="mx-auto size-4 text-rose-500" />}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {exams.length === 0 && (
          <p className="text-muted-foreground mt-3 text-sm">
            Bu ders için henüz çözülmüş bir branş veya genel deneme yok.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
