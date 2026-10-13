"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";

import { ReadOnlySubtopics } from "@/components/read-only-subtopics";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Course } from "@/lib/curriculum";
import { flattenSelectionRows, isFlatRows, withGroupHeadings } from "@/lib/curriculum/rows";
import {
  examPublisher,
  examTrackOf,
  generalExamTabs,
  markedRowCount,
  rowRecurrence,
  subjectScoreSummary,
  type ScoreSummary,
} from "@/lib/exam-detail";
import { cn } from "@/lib/utils";
import type { ExamDetailExam } from "@/components/exam-detail-view";

// Genel Deneme side by side: for one subject at a time, every topic is a row and every exam of the track a column
// (newest on the left, going back in time towards the right, like the Analiz tab), with the same plain X wherever the student marked the topic in that exam --
// so a coach reads a topic's progression across the whole history in one view. A one-click subject switcher on top;
// each exam column carries that subject's own Doğru / Yanlış / Boş / Net and a shortcut into the edit drawer.
// Read-only: editing only happens through onEdit (the existing drawer).
//
// Every table here (Genel and Branş) is the same object as the student's and the coach's Analiz tables: a height-bounded frame with
// a sticky header row, sticky Ünite / Konu / Tekrar columns, and "Tekrar" = in how many of the shown exams a topic was marked
// (shown from two exams up).

function formatShortDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
}

function ExamColumnHead({
  exam,
  summary,
  focused,
  onEdit,
  duration,
  stickyTop = false,
}: {
  exam: ExamDetailExam;
  summary: ScoreSummary | null;
  focused: boolean;
  onEdit?: (exam: ExamDetailExam) => void;
  // Branş Denemesi: the exam's own Süre (minutes) shown under the score.
  duration?: number | null;
  // The header row stays visible while the topics scroll (the branch comparison's bounded table).
  stickyTop?: boolean;
}) {
  return (
    <TableHead
      data-focused={focused || undefined}
      className={cn("min-w-28 border-l p-0 text-center align-top", stickyTop && "bg-background sticky top-0 z-30", !stickyTop && focused && "bg-primary/10")}
    >
      <div className={cn("flex w-full flex-col items-center gap-1 px-2 py-2", stickyTop && focused && "bg-primary/10")}>
        <span className="text-foreground max-w-28 truncate text-xs font-semibold" title={exam.title}>
          {examPublisher(exam.title)}
        </span>
        <span className="text-muted-foreground text-[10px] font-normal">{formatShortDate(exam.task_date)}</span>
        {summary ? (
          <span className="text-muted-foreground text-[10px] font-normal tabular-nums">
            D:{summary.correct} Y:{summary.wrong} B:{summary.empty}
            <br />
            <span className="text-foreground font-semibold">Net {summary.net.toFixed(2)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-[10px] font-normal">sonuç yok</span>
        )}
        {duration !== null && duration !== undefined && duration > 0 && (
          <span className="text-muted-foreground text-[10px] font-normal tabular-nums">Süre {duration} dk</span>
        )}
        {exam.analysis_pending && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">Analiz Bekliyor</span>}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(exam)}
            aria-label={`Sonuçları Düzenle: ${exam.title}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-colors"
          >
            <Pencil className="size-2.5" />
            Düzenle
          </button>
        )}
      </div>
    </TableHead>
  );
}

function CourseComparisonTable({
  course,
  exams,
  scoreKey,
  markedByExam,
  focusExamId,
  onEdit,
}: {
  course: Course;
  exams: ExamDetailExam[];
  scoreKey: string;
  markedByExam: Map<string, Set<string>>;
  focusExamId: string;
  onEdit?: (exam: ExamDetailExam) => void;
}) {
  const rows = flattenSelectionRows(course);
  const flat = isFlatRows(rows);
  const empty = new Set<string>();
  const showTekrar = exams.length >= 2;
  const examIds = exams.map((e) => e.id);
  const konuLeft = flat ? "left-0" : "left-12";
  const tekrarLeft = flat ? "left-48" : "left-[15rem]";

  return (
    <section aria-label={`${course.name} konuları`}>
      <h4 className="mb-2 text-sm font-semibold">{course.name}</h4>
      <div className="max-h-[60dvh] overflow-auto rounded-md border" data-slot="general-comparison-frame">
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
                <ExamColumnHead
                  key={exam.id}
                  exam={exam}
                  summary={subjectScoreSummary(exam.subject_scores, scoreKey, examTrackOf(exam.title))}
                  focused={exam.id === focusExamId}
                  onEdit={onEdit}
                  stickyTop
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {withGroupHeadings(rows).map((item) => {
              const unitLabel = item.kind === "heading" ? item.unitLabel : item.row.unitLabel;
              const unitCell = !flat && item.unitRowSpan !== null && (
                <TableCell
                  rowSpan={item.unitRowSpan}
                  className={cn("bg-card sticky left-0 z-10 border-r p-0 text-center align-middle", item.unitRowSpan === 1 && "text-muted-foreground")}
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
                      data-count={repeated}
                      className={cn(
                        "sticky z-10 w-16 min-w-16 border-r text-center text-xs tabular-nums",
                        tekrarLeft,
                        repeated >= 2 ? "bg-rose-50 font-semibold text-rose-700 dark:bg-rose-950" : "bg-card",
                        repeated === 0 && "text-muted-foreground",
                      )}
                    >
                      {repeated === 0 ? "—" : `${repeated}/${exams.length}`}
                    </TableCell>
                  )}
                  {exams.map((exam) => {
                    const missed = row.memberTopicIds.some((id) => (markedByExam.get(exam.id) ?? empty).has(id));
                    return (
                      <TableCell key={exam.id} className={cn("border-l text-center", exam.id === focusExamId && "bg-primary/5")}>
                        {missed && <X className="mx-auto size-4 text-rose-500" aria-label="İşaretli" />}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
    </section>
  );
}

// ---- Branş Denemesi: one course, every exam of it in the range ----------------------------------------------------------------------------

// Topics as rows, the course's exams as columns (newest on the left), a plain X wherever the topic was marked in that exam, and a
// "Tekrar" column counting in how many of the shown exams each topic was marked -- the chronic weaknesses stand out. The table is
// height-bounded with a sticky header row (and sticky Ünite / Konu / Tekrar columns), so a long topic list never loses its exam
// headings; it scrolls both ways inside its own frame and opens with the clicked exam's column in view.
export function BranchExamComparisonView({
  course,
  exams,
  focusExamId,
  markedByExam,
  netOf,
  onEdit,
}: {
  course: Course | null;
  // Every Branş Denemesi of the course in the range, newest first (comparableBranchExams).
  exams: ExamDetailExam[];
  focusExamId: string;
  markedByExam: Map<string, Set<string>>;
  // The cohort's net rule (LGS / 7th grade 3:1, otherwise 4:1).
  netOf: (correct: number, wrong: number) => number;
  onEdit?: (exam: ExamDetailExam) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const empty = new Set<string>();

  // open with the clicked exam's column in view, however far back it is
  useEffect(() => {
    const column = frameRef.current?.querySelector<HTMLElement>("[data-focused]");
    column?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [focusExamId, exams.length]);

  if (!course) return <p className="text-muted-foreground text-sm">Bu ders için konu tablosu bulunamadı.</p>;
  if (exams.length === 0) return <p className="text-muted-foreground text-sm">Karşılaştırılacak deneme yok.</p>;

  const rows = flattenSelectionRows(course);
  const flat = isFlatRows(rows);
  const pendingCount = exams.filter((e) => e.analysis_pending).length;
  const examIds = exams.map((e) => e.id);
  const summaryOf = (e: ExamDetailExam): ScoreSummary | null =>
    e.correct_count === null && e.wrong_count === null && e.empty_count === null
      ? null
      : {
          correct: e.correct_count ?? 0,
          wrong: e.wrong_count ?? 0,
          empty: e.empty_count ?? 0,
          net: netOf(e.correct_count ?? 0, e.wrong_count ?? 0),
        };
  const konuLeft = flat ? "left-0" : "left-12";
  const tekrarLeft = flat ? "left-48" : "left-[15rem]";

  return (
    <section className="space-y-3" aria-label={`${course.name} branş denemeleri karşılaştırması`}>
      <p className="text-muted-foreground text-xs">
        {exams.length === 1
          ? "Bu aralıkta bu branştan tek deneme var."
          : `${exams.length} deneme, en yeniden eskiye soldan sağa.`}{" "}
        Vurgulu sütun tıkladığın deneme; X = o denemede işaretlenen konu; Tekrar = konunun gösterilen denemelerin kaçında işaretlendiği.
        {pendingCount > 0 && ` ${pendingCount} denemenin konu analizi henüz girilmemiş.`}
      </p>

      <div ref={frameRef} className="max-h-[60dvh] overflow-auto rounded-md border" data-slot="branch-comparison-frame">
        <table data-slot="table" className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {!flat && <TableHead className="bg-background sticky top-0 left-0 z-40 w-12 min-w-12 align-bottom">Ünite</TableHead>}
              <TableHead className={cn("bg-background sticky top-0 z-40 w-48 max-w-48 min-w-48 border-r align-bottom", konuLeft)}>Konu</TableHead>
              <TableHead
                className={cn("bg-background sticky top-0 z-40 w-16 min-w-16 border-r text-center align-bottom", tekrarLeft)}
                title="Konunun, gösterilen denemelerin kaçında işaretlendiği"
              >
                Tekrar
              </TableHead>
              {exams.map((exam) => (
                <ExamColumnHead
                  key={exam.id}
                  exam={exam}
                  summary={summaryOf(exam)}
                  duration={exam.duration_minutes}
                  focused={exam.id === focusExamId}
                  onEdit={onEdit}
                  stickyTop
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {withGroupHeadings(rows).map((item) => {
              const unitLabel = item.kind === "heading" ? item.unitLabel : item.row.unitLabel;
              const unitCell = !flat && item.unitRowSpan !== null && (
                <TableCell
                  rowSpan={item.unitRowSpan}
                  className={cn("bg-card sticky left-0 z-10 border-r p-0 text-center align-middle", item.unitRowSpan === 1 && "text-muted-foreground")}
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
              if (item.kind === "heading") {
                return (
                  <TableRow key={item.key}>
                    {unitCell}
                    <TableCell colSpan={2 + exams.length} className="bg-muted/60 text-xs font-semibold whitespace-normal">
                      {item.label}
                    </TableCell>
                  </TableRow>
                );
              }
              const row = item.row;
              const repeated = rowRecurrence(row, examIds, markedByExam);
              return (
                <TableRow key={row.id}>
                  {unitCell}
                  <TableCell className={cn("bg-card sticky z-10 w-48 max-w-48 min-w-48 border-r font-medium whitespace-normal", konuLeft)}>
                    {row.label}
                    <ReadOnlySubtopics names={row.readOnlyNames} />
                  </TableCell>
                  <TableCell
                    data-slot="recurrence"
                    data-count={repeated}
                    className={cn(
                      "sticky z-10 w-16 min-w-16 border-r text-center text-xs tabular-nums",
                      tekrarLeft,
                      repeated >= 2 ? "bg-rose-50 font-semibold text-rose-700 dark:bg-rose-950" : "bg-card",
                      repeated === 0 && "text-muted-foreground",
                    )}
                  >
                    {repeated === 0 ? "—" : `${repeated}/${exams.length}`}
                  </TableCell>
                  {exams.map((exam) => {
                    const missed = row.memberTopicIds.some((id) => (markedByExam.get(exam.id) ?? empty).has(id));
                    return (
                      <TableCell key={exam.id} className={cn("border-l text-center", exam.id === focusExamId && "bg-primary/5")}>
                        {missed && <X className="mx-auto size-4 text-rose-500" aria-label="İşaretli" />}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
    </section>
  );
}

export function ExamComparisonView({
  exams,
  focusExamId,
  markedByExam,
  onEdit,
  initialTabKey,
}: {
  // Every exam of the track, newest first (comparableGeneralExams).
  exams: ExamDetailExam[];
  // The exam the coach clicked: its column is highlighted.
  focusExamId: string;
  markedByExam: Map<string, Set<string>>;
  onEdit?: (exam: ExamDetailExam) => void;
  initialTabKey?: string;
}) {
  const focus = exams.find((e) => e.id === focusExamId) ?? exams[exams.length - 1];
  const tabs = focus ? generalExamTabs(focus) : [];
  const [activeKey, setActiveKey] = useState(initialTabKey ?? tabs[0]?.key ?? "");
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  if (!focus || !active) return <p className="text-muted-foreground text-sm">Karşılaştırılacak deneme yok.</p>;

  const pendingCount = exams.filter((e) => e.analysis_pending).length;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Dersler" className="bg-secondary flex flex-wrap rounded-lg p-1">
        {tabs.map((tab) => {
          const selected = tab.key === active.key;
          // how many topic rows were marked in the clicked exam, as a hint of where to look
          const count = tab.courses.reduce((n, c) => n + markedRowCount(flattenSelectionRows(c), markedByExam.get(focus.id) ?? new Set<string>()), 0);
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`cmp-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls="cmp-tab-panel"
              onClick={() => setActiveKey(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                selected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", selected ? "bg-primary-foreground/20" : "bg-rose-500/15 text-rose-600")}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        {exams.length} deneme, en yeniden eskiye soldan sağa. Vurgulu sütun tıkladığın deneme; X = o denemede işaretlenen konu
        {exams.length >= 2 && "; Tekrar = konunun gösterilen denemelerin kaçında işaretlendiği"}.
        {pendingCount > 0 && ` ${pendingCount} denemenin konu analizi henüz girilmemiş.`}
      </p>

      <div role="tabpanel" id="cmp-tab-panel" aria-labelledby={`cmp-tab-${active.key}`} className="space-y-4">
        {active.courses.length === 0 ? (
          <p className="text-muted-foreground text-sm">Bu ders için konu tablosu henüz tanımlı değil.</p>
        ) : (
          active.courses.map((course) => (
            <CourseComparisonTable
              key={course.id}
              course={course}
              exams={exams}
              scoreKey={active.scoreKey}
              markedByExam={markedByExam}
              focusExamId={focus.id}
              onEdit={onEdit}
            />
          ))
        )}
      </div>
    </div>
  );
}
