"use client";

import { X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/curriculum";
import { flattenSelectionRows, isFlatRows, withGroupHeadings } from "@/lib/curriculum/rows";
import { rowRecurrence } from "@/lib/exam-detail";
import { ReadOnlySubtopics } from "@/components/read-only-subtopics";
import type { StudentTask } from "../../_components/daily-tasks/types";

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
//
// Long topic lists and many exams: the table scrolls inside its own height-bounded frame, so the exam headings (sticky top row) and
// the Ünite / Konu / Tekrar columns (sticky left) stay in view. "Tekrar" says in how many of the shown exams a topic was marked --
// the rows with a high count are the student's chronic mistakes. (It appears once there are at least two exams to compare.)
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
  // One row per checkable/selectable unit -- an LGS course rolls up its
  // Konu/Ünite level here (see lib/curriculum/lgs-selection.ts), so a
  // mistake mark shows on the group even if it was tagged against one of
  // its now-hidden members.
  // An 11th grader's merged "Maarif TYT" course with a bucket structure
  // (lib/curriculum/maarif-tyt-structure.ts) comes out of the same call as one
  // row per bucket -- marked with an X when any of the bucket's hidden topics
  // was missed; its raw topics are never listed.
  const rows = flattenSelectionRows(course);
  // A flat course (Türkçe) has no Ünite column.
  const flat = isFlatRows(rows);
  const showTekrar = exams.length >= 2;
  const markedByExam = new Map(Object.entries(mistakesByExam));
  const examIds = exams.map((e) => e.id);
  const konuLeft = flat ? "left-0" : "left-12";
  const tekrarLeft = flat ? "left-48" : "left-[15rem]";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{course.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[70dvh] overflow-auto rounded-md border" data-slot="exam-topic-frame">
          <table data-slot="table" className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow>
                {!flat && <TableHead className="bg-background sticky top-0 left-0 z-40 w-12 min-w-12 align-bottom">Ünite</TableHead>}
                <TableHead className={cn("bg-background sticky top-0 z-40 w-48 max-w-48 min-w-48 border-r align-bottom", konuLeft)}>Konu</TableHead>
                {showTekrar && (
                  <TableHead
                    className={cn("bg-background sticky top-0 z-40 w-16 min-w-16 border-r text-center align-bottom", tekrarLeft)}
                    title="Konunun, gösterilen denemelerin kaçında işaretlendiği"
                  >
                    Tekrar
                  </TableHead>
                )}
                {exams.map((exam) => (
                  <TableHead key={exam.id} className="bg-background sticky top-0 z-30 border-l p-0 text-center">
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
              {withGroupHeadings(rows).map((item) => {
                const unitLabel = item.kind === "heading" ? item.unitLabel : item.row.unitLabel;
                const unitCell = !flat && item.unitRowSpan !== null && (
                  <TableCell
                    rowSpan={item.unitRowSpan}
                    className={cn(
                      "bg-card sticky left-0 z-10 border-r p-0 text-center align-middle",
                      item.unitRowSpan === 1 && "text-muted-foreground",
                    )}
                  >
                    {unitLabel === "-" ? (
                      "-"
                    ) : (
                      <div className="flex h-full items-center justify-center py-2">
                        <span className="[writing-mode:vertical-rl] rotate-180 font-medium">{unitLabel}</span>
                      </div>
                    )}
                  </TableCell>
                );
                // An intermediate group heading (Kimya: "Kimya Hayattır"): one full-width row.
                if (item.kind === "heading") {
                  return (
                    <TableRow key={item.key}>
                      {unitCell}
                      <TableCell colSpan={1 + (showTekrar ? 1 : 0) + exams.length} className="bg-muted/60 text-xs font-semibold whitespace-normal">
                        {item.label}
                      </TableCell>
                    </TableRow>
                  );
                }
                const row = item.row;
                const repeated = showTekrar ? rowRecurrence(row, examIds, markedByExam) : 0;
                return (
                  <TableRow key={row.id}>
                    {unitCell}
                    <TableCell className={cn("bg-card sticky z-10 w-48 max-w-48 min-w-48 border-r font-medium whitespace-normal", konuLeft)}>
                      {row.label}
                      <ReadOnlySubtopics names={row.readOnlyNames} />
                    </TableCell>
                    {showTekrar && (
                      <TableCell
                        data-slot="recurrence"
                        className={cn(
                          "sticky z-10 w-16 min-w-16 border-r text-center text-xs tabular-nums",
                          tekrarLeft,
                          repeated >= 2 ? "bg-rose-50 font-semibold text-rose-700 dark:bg-rose-950" : "bg-card",
                          repeated === 0 && "text-muted-foreground",
                        )}
                        data-count={repeated}
                      >
                        {repeated === 0 ? "—" : `${repeated}/${exams.length}`}
                      </TableCell>
                    )}
                    {exams.map((exam) => {
                      const missed = row.memberTopicIds.some((id) => mistakesByExam[exam.id]?.has(id));
                      return (
                        <TableCell key={exam.id} className="border-l text-center">
                          {missed && <X className="mx-auto size-4 text-rose-500" />}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </table>
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
