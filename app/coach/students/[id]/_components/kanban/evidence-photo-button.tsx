"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidenceReviewDialog } from "../../../../_components/evidence-review-dialog";
import type { DetailTask } from "../../types";

// Small camera icon on a task card when the student attached Kanıt Fotoğrafı to
// it; click opens the photo review (per-photo Onayla / Reddet when the task is
// waiting for review, read-only with the verdicts otherwise). Renders nothing for
// a task without photos. The photos are fetched when the dialog opens, not when
// the board loads.
export function EvidencePhotoButton({ studentId, task }: { studentId: string; task: DetailTask }) {
  const router = useRouter();
  const count = task.evidence_image_paths?.length ?? 0;
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  const waiting = task.evidence_review_status === "pending";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={waiting ? "size-5 text-amber-600 hover:text-amber-700" : "size-5 text-sky-600 hover:text-sky-700"}
        onClick={() => setOpen(true)}
        aria-label={`Kanıt fotoğraflarını gör (${count})`}
        title={waiting ? `Kanıt fotoğrafı (${count}) — onayını bekliyor` : `Kanıt fotoğrafı (${count})`}
      >
        <Camera className="size-3" />
      </Button>
      {open && (
        <EvidenceReviewDialog
          studentId={studentId}
          taskId={task.id}
          title={task.title}
          onClose={() => setOpen(false)}
          onReviewed={() => router.refresh()}
        />
      )}
    </>
  );
}
