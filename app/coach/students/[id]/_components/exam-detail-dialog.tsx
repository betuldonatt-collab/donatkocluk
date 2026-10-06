"use client";

import { Pencil } from "lucide-react";

import { ExamComparisonView } from "@/components/exam-comparison-view";
import { ExamDetailView } from "@/components/exam-detail-view";
import { comparableGeneralExams, examTrackOf } from "@/lib/exam-detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DetailTask } from "../types";

function formatExamDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// The popup behind a click on an exam in Grafikler (the net charts and the Genel Deneme Geçmişi list), read-only, with a
// shortcut into the coach's existing edit drawer ("Sonuçları Düzenle"). Nothing here changes data by itself.
//  - Genel Deneme: ALL exams of that track side by side (topics as rows, exams as columns, oldest to newest), one subject
//    at a time via one-click tabs; the clicked exam's column is highlighted.
//  - Branş Denemesi: that one exam's scores and its course's topic table.
export function ExamDetailDialog({
  exam,
  allGeneralExams,
  markedByExam,
  netOf,
  onClose,
  onEdit,
}: {
  exam: DetailTask;
  // Every Genel Deneme of the student (the comparison keeps the ones of the clicked exam's track).
  allGeneralExams: DetailTask[];
  markedByExam: Map<string, Set<string>>;
  netOf: (correct: number, wrong: number) => number;
  onClose: () => void;
  onEdit: (exam: DetailTask) => void;
}) {
  const isGeneral = exam.task_type === "general_exam";
  const compared = isGeneral ? comparableGeneralExams(allGeneralExams, exam) : [];
  const trackLabel = { tyt: "TYT", ayt: "AYT", lgs: "LGS", m7: "7. Sınıf", m9: "9. Sınıf", m10: "10. Sınıf", m11: "11. Sınıf" }[examTrackOf(exam.title)];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={isGeneral ? "max-w-6xl" : "max-w-4xl"}>
        <DialogHeader>
          <DialogTitle>{isGeneral ? `${trackLabel} Genel Deneme Karşılaştırması` : exam.title}</DialogTitle>
          <DialogDescription>{isGeneral ? `Seçilen: ${exam.title} -- ${formatExamDate(exam.task_date)}` : formatExamDate(exam.task_date)}</DialogDescription>
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
          <ExamDetailView key={exam.id} exam={exam} markedTopicIds={markedByExam.get(exam.id) ?? new Set<string>()} netOf={netOf} />
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
