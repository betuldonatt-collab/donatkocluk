"use client";

import { X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Course, Topic } from "@/lib/curriculum";
import type { StudentTask } from "../../_components/daily-tasks/types";

type Row = { topic: Topic; unitLabel: string; unitRowSpan: number | null };

// Same unit-rowSpan flattening as the Kaynak Takibi / Çıkmış Sorular
// tables -- every topic gets its own row, "-" (ünitesiz) topics never
// merge, real units span their full topic count.
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

// Genel Deneme embeds its publisher in the title text ("TYT Genel Deneme -
// 3D Yayınları" / "TYT Branş Denemesi - 3D Yayınları"), the same convention
// on both exam types -- mirrors buildGeneralExamTitle/buildBranchExamTitle
// in app/coach/actions.ts. Falls back to "—" when no publisher was set.
function parseExamPublisher(title: string): string {
  const match = title.match(/-\s*([^-]+)$/);
  return match?.[1]?.trim() || "—";
}

// Topics stay visible even with zero exams -- a pure reference table when
// there's nothing to show yet, same spirit as PastQuestionsTable. Each
// exam column header doubles as a button back into the same TaskModal
// used to record the analysis in the first place.
export function ExamTopicTable({
  course,
  exams,
  mistakesByExam,
  onOpenExam,
}: {
  course: Course;
  exams: StudentTask[];
  mistakesByExam: Record<string, Set<string>>;
  onOpenExam: (task: StudentTask) => void;
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
                      <span className="text-foreground max-w-32 truncate text-xs font-semibold" title={exam.title}>
                        {parseExamPublisher(exam.title)}
                      </span>
                      <span className="text-muted-foreground text-[10px] font-normal">
                        {formatExamDate(exam.task_date)}
                      </span>
                      <span className="text-muted-foreground text-[10px] font-normal tabular-nums">
                        T:{exam.total_count ?? "—"} D:{exam.correct_count ?? "—"} Y:{exam.wrong_count ?? "—"} B:
                        {exam.empty_count ?? "—"}
                      </span>
                      {exam.analysis_pending && (
                        <button
                          type="button"
                          onClick={() => onOpenExam(exam)}
                          className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 transition-colors hover:bg-amber-500/25"
                        >
                          Analiz Bekliyor
                        </button>
                      )}
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
