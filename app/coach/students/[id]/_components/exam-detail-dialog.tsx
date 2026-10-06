"use client";

import { Pencil } from "lucide-react";

import { ExamDetailView } from "@/components/exam-detail-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DetailTask } from "../types";

function formatExamDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// The popup behind a click on an exam in Grafikler (the net charts and the Genel Deneme Geçmişi list): a read-only
// breakdown of that one exam -- scores, and per subject the topics the student marked -- with a shortcut into the
// coach's existing edit drawer ("Sonuçları Düzenle"). Nothing here changes data by itself.
export function ExamDetailDialog({
  exam,
  markedTopicIds,
  netOf,
  onClose,
  onEdit,
}: {
  exam: DetailTask;
  markedTopicIds: Set<string>;
  netOf: (correct: number, wrong: number) => number;
  onClose: () => void;
  onEdit: (exam: DetailTask) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{exam.title}</DialogTitle>
          <DialogDescription>{formatExamDate(exam.task_date)}</DialogDescription>
        </DialogHeader>

        <ExamDetailView key={exam.id} exam={exam} markedTopicIds={markedTopicIds} netOf={netOf} />

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
