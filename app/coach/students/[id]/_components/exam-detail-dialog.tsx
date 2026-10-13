"use client";

import { Pencil } from "lucide-react";

import { BranchExamComparisonView, ExamComparisonView } from "@/components/exam-comparison-view";
import { comparableBranchExams, comparableGeneralExams, examTrackOf } from "@/lib/exam-detail";
import { findCourseById } from "@/lib/curriculum";
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
  const compared = isGeneral ? comparableGeneralExams(allGeneralExams, exam) : comparableBranchExams(allBranchExams, exam, isInRange);
  const branchCourse = isGeneral ? null : findCourseById(exam.course_id);
  const trackLabel = { tyt: "TYT", ayt: "AYT", lgs: "LGS", m7: "7. Sınıf", m9: "9. Sınıf", m10: "10. Sınıf", m11: "11. Sınıf" }[examTrackOf(exam.title)];

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

        {isGeneral ? (
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
