"use client";

import { Pencil } from "lucide-react";

import { BranchExamComparisonView, ExamComparisonView } from "@/components/exam-comparison-view";
import { comparableBranchExams, comparableGeneralExams, examTrackOf } from "@/lib/exam-detail";
import { splitExamsByAnalysis } from "@/lib/exam-solved";
import { PendingAnalysisBox } from "@/components/pending-analysis-box";
import { GENERAL_EXAM_TRACK_LABELS } from "@/lib/general-exam-track";
import { findAnalysisCourse } from "@/lib/curriculum";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DetailTask } from "../types";

function formatExamDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// The popup behind a click on an exam in Grafikler (the net charts and the Genel Deneme Geçmişi list), read-only, with a
// shortcut into the coach's existing edit drawer ("Sonuçları Düzenle"). Nothing here changes data by itself.
//  - Genel Deneme: ALL exams of that track side by side (topics as rows, exams as columns, newest to oldest), one subject
//    at a time via one-click tabs; the clicked exam's column is highlighted.
//  - Branş Denemesi: ALL Branş Denemesi of that same course inside the Grafikler date range side by side (topics as rows, exams as
//    columns, newest to oldest, with a "Tekrar" count column and a sticky header), the clicked exam's column highlighted.
export function ExamDetailDialog({
  exam,
  allGeneralExams,
  allBranchExams,
  isInRange,
  rangeLabel,
  markedByExam,
  netOf,
  onClose,
  onEdit,
}: {
  exam: DetailTask;
  // Every Genel Deneme of the student (the comparison keeps the ones of the clicked exam's track).
  allGeneralExams: DetailTask[];
  // Every Branş Denemesi of the student (the comparison keeps the ones of the clicked exam's course, inside the range).
  allBranchExams: DetailTask[];
  // The Grafikler date range, as a predicate on a task date, and its label for the header.
  isInRange: (dateIso: string) => boolean;
  rangeLabel: string;
  markedByExam: Map<string, Set<string>>;
  netOf: (correct: number, wrong: number) => number;
  onClose: () => void;
  onEdit: (exam: DetailTask) => void;
}) {
  const isGeneral = exam.task_type === "general_exam";
  const comparedAll = isGeneral ? comparableGeneralExams(allGeneralExams, exam) : comparableBranchExams(allBranchExams, exam, isInRange);
  // Only solved-AND-analysed exams are columns; solved ones still waiting for their analysis sit in the yellow box on the right; unsolved ones
  // are not listed (lib/exam-solved.ts).
  const { analyzed: compared, pending } = splitExamsByAnalysis(comparedAll);
  const branchCourse = isGeneral ? null : findAnalysisCourse(exam.course_id);
  const trackLabel = GENERAL_EXAM_TRACK_LABELS[examTrackOf(exam.title, exam.subject_scores)];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>
            {isGeneral ? `${trackLabel} Genel Deneme Karşılaştırması` : `${branchCourse?.name ?? exam.title} Branş Denemesi Karşılaştırması`}
          </DialogTitle>
          <DialogDescription>
            {isGeneral ? `Seçilen: ${exam.title} -- ${formatExamDate(exam.task_date)}` : `Seçilen: ${formatExamDate(exam.task_date)} · ${rangeLabel}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
        {compared.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {pending.length > 0 ? "Analizi tamamlanmış deneme yok; analizi bekleyen denemeler sağdaki kutuda." : "Karşılaştırılacak deneme yok."}
          </p>
        ) : isGeneral ? (
          <ExamComparisonView
            key={exam.id}
            exams={compared}
            focusExamId={exam.id}
            markedByExam={markedByExam}
            onEdit={(e) => {
              const full = compared.find((c) => c.id === e.id);
              if (full) onEdit(full);
            }}
          />
        ) : (
          <BranchExamComparisonView
            key={exam.id}
            course={branchCourse}
            exams={compared}
            focusExamId={exam.id}
            markedByExam={markedByExam}
            netOf={netOf}
            onEdit={(e) => {
              const full = compared.find((c) => c.id === e.id);
              if (full) onEdit(full);
            }}
          />
        )}
        </div>
        <PendingAnalysisBox exams={pending} onOpen={onEdit} className="lg:w-64 lg:shrink-0" />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onEdit(exam)}>
            <Pencil className="size-4" />
            Sonuçları Düzenle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
