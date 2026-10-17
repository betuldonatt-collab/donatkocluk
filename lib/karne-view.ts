import type { KarneDocumentProps } from "@/components/karne-document";
import type { LoadedKarneSummary } from "./karne-summary-data";

// ONE place decides what a Karne document is given, so the coach's preview / "Yazdır", the student's Karnelerim and the parent's Karneler can
// never drift apart again: the same numbers (loadKarneSummary), the same header, the same note rule, the same approval badge.

export type KarneViewStudent = {
  fullName: string | null;
  // profiles.sinif_sube ("11-A") and profiles.exam_type ("LGS" / "YKS"): the class line is the first one known.
  sinifSube: string | null;
  examType: string | null;
};

// The report card whose period the Karne is showing, if it is one (its range is exactly the displayed period).
export type KarneViewCard = {
  status: "draft" | "approved";
  cycle_number: number | null;
  approved_at: string | null;
  coach_notes: string | null;
};

export function karneDocumentProps(input: {
  loaded: LoadedKarneSummary;
  student: KarneViewStudent;
  card: KarneViewCard | null;
  // The COACH previews a draft period with the note being written; a student or parent never sees a draft's note.
  includeDraftNote?: boolean;
}): KarneDocumentProps {
  const { loaded, student, card } = input;
  const approved = card?.status === "approved";
  return {
    summary: loaded.summary,
    studentName: student.fullName,
    classLabel: student.sinifSube ?? student.examType ?? null,
    coachNote: card && (approved || input.includeDraftNote) ? card.coach_notes : null,
    approval: card && approved ? { approvedAt: card.approved_at, cycleNumber: card.cycle_number } : null,
    frozen: loaded.frozen,
  };
}
