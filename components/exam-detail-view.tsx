"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { ReadOnlySubtopics } from "@/components/read-only-subtopics";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { findCourseById, type Course } from "@/lib/curriculum";
import { flattenSelectionRows, isFlatRows, withGroupHeadings } from "@/lib/curriculum/rows";
import {
  examScoreTotals,
  examTrackOf,
  generalExamTabs,
  markedRowCount,
  netFunctionFor,
  subjectScoreSummary,
  type ExamSubjectTab,
  type ScoreSummary,
  type SubjectScores,
} from "@/lib/exam-detail";
import { cn } from "@/lib/utils";

// The detail of ONE exam (a Genel Deneme or a Branş Denemesi): its scores and, per subject, the topics the student
// marked -- the same topic rows and the same plain X the analysis tables use, but for a single exam, with a one-click
// subject switcher for a Genel Deneme. Read-only; the caller decides what else sits around it (edit button, ...).

export type ExamDetailExam = {
  id: string;
  title: string;
  task_date: string;
  task_type: string;
  course_id: string | null;
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  duration_minutes: number | null;
  subject_scores: SubjectScores | null;
  analysis_pending: boolean;
};

function formatExamDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function ScoreStrip({ summary, duration }: { summary: ScoreSummary | null; duration?: number | null }) {
  if (!summary) return <p className="text-muted-foreground text-sm">Bu bölüm için henüz sonuç girilmemiş.</p>;
  const cells: { label: string; value: string; className?: string }[] = [
    { label: "Doğru", value: String(summary.correct), className: "text-emerald-700" },
    { label: "Yanlış", value: String(summary.wrong), className: "text-rose-700" },
    { label: "Boş", value: String(summary.empty), className: "text-amber-700" },
    { label: "Net", value: summary.net.toFixed(2), className: "text-foreground" },
  ];
  if (duration !== null && duration !== undefined) cells.push({ label: "Süre", value: `${duration} dk`, className: "text-foreground" });
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cells.map((c) => (
        <div key={c.label} className="bg-muted/40 rounded-md px-3 py-2">
          <dt className="text-muted-foreground text-[11px]">{c.label}</dt>
          <dd className={cn("text-lg font-semibold tabular-nums", c.className)}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// One course's topics with an X on every topic the student marked in this exam.
function ExamMarksTable({ course, markedTopicIds }: { course: Course; markedTopicIds: Set<string> }) {
  const rows = flattenSelectionRows(course);
  const flat = isFlatRows(rows);
  const marked = markedRowCount(rows, markedTopicIds);

  return (
    <section aria-label={`${course.name} konuları`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{course.name}</h4>
        <span className="text-muted-foreground text-xs tabular-nums">{marked} konu işaretli</span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {!flat && <TableHead className="bg-background sticky left-0 z-20 w-12 align-bottom">Ünite</TableHead>}
              <TableHead className={cn("bg-background sticky z-20 border-r align-bottom", flat ? "left-0" : "left-12")}>Konu</TableHead>
              <TableHead className="w-24 text-center">İşaret</TableHead>
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
                    <TableCell colSpan={2} className="bg-muted/60 text-xs font-semibold whitespace-normal">
                      {item.label}
                    </TableCell>
                  </TableRow>
                );
              }
              const row = item.row;
              const missed = row.memberTopicIds.some((id) => markedTopicIds.has(id));
              return (
                <TableRow key={row.id} data-marked={missed || undefined}>
                  {unitCell}
                  <TableCell className={cn("bg-card sticky z-10 border-r font-medium whitespace-normal", flat ? "left-0" : "left-12")}>
                    {row.label}
                    <ReadOnlySubtopics names={row.readOnlyNames} />
                  </TableCell>
                  <TableCell className="text-center">{missed && <X className="mx-auto size-4 text-rose-500" aria-label="İşaretli" />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function tabMarkedCount(tab: ExamSubjectTab, markedTopicIds: Set<string>): number {
  return tab.courses.reduce((n, c) => n + markedRowCount(flattenSelectionRows(c), markedTopicIds), 0);
}

export function ExamDetailView({
  exam,
  markedTopicIds,
  netOf,
  initialTabKey,
}: {
  exam: ExamDetailExam;
  // Every topic id the student marked in THIS exam.
  markedTopicIds: Set<string>;
  // Net rule for a Branş Denemesi (cohort-aware: LGS / 7th grade 3:1, otherwise 4:1). A Genel Deneme's rule comes from its title.
  netOf?: (correct: number, wrong: number) => number;
  // The subject tab shown first (default: the first one).
  initialTabKey?: string;
}) {
  const isGeneral = exam.task_type === "general_exam";
  const track = examTrackOf(exam.title);
  const tabs = isGeneral ? generalExamTabs(exam) : [];
  const [activeKey, setActiveKey] = useState(initialTabKey ?? tabs[0]?.key ?? "");
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  const pendingNote = exam.analysis_pending && (
    <p className="rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-700">
      Konu analizi henüz girilmemiş (Analiz Bekliyor) -- işaretlenen konular girildiğinde burada görünür.
    </p>
  );

  if (!isGeneral) {
    const course = findCourseById(exam.course_id);
    const net = (netOf ?? netFunctionFor(track))(exam.correct_count ?? 0, exam.wrong_count ?? 0);
    const hasScore = exam.correct_count !== null || exam.wrong_count !== null || exam.empty_count !== null;
    return (
      <div className="space-y-4">
        <ScoreStrip
          summary={hasScore ? { correct: exam.correct_count ?? 0, wrong: exam.wrong_count ?? 0, empty: exam.empty_count ?? 0, net } : null}
          duration={exam.duration_minutes}
        />
        {pendingNote}
        {course ? <ExamMarksTable course={course} markedTopicIds={markedTopicIds} /> : <p className="text-muted-foreground text-sm">Bu ders için konu tablosu bulunamadı.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground mb-1.5 text-xs font-medium">Toplam ({formatExamDate(exam.task_date)})</p>
        <ScoreStrip summary={examScoreTotals(exam.subject_scores, track)} />
      </div>

      {pendingNote}

      <div role="tablist" aria-label="Dersler" className="bg-secondary flex flex-wrap rounded-lg p-1">
        {tabs.map((tab) => {
          const count = tabMarkedCount(tab, markedTopicIds);
          const selected = tab.key === active?.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`exam-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls="exam-tab-panel"
              onClick={() => setActiveKey(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                selected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", selected ? "bg-primary-foreground/20" : "bg-rose-500/15 text-rose-600")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active && (
        <div role="tabpanel" id="exam-tab-panel" aria-labelledby={`exam-tab-${active.key}`} className="space-y-4">
          <ScoreStrip summary={subjectScoreSummary(exam.subject_scores, active.scoreKey, track)} />
          {active.courses.length === 0 ? (
            <p className="text-muted-foreground text-sm">Bu ders için konu tablosu henüz tanımlı değil.</p>
          ) : (
            active.courses.map((course) => <ExamMarksTable key={course.id} course={course} markedTopicIds={markedTopicIds} />)
          )}
        </div>
      )}
    </div>
  );
}
