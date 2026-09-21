"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidenceLightbox } from "@/components/evidence-lightbox";
import { getTaskEvidenceUrlsForCoach } from "../../../../actions";
import type { DetailTask } from "../../types";

// Small camera icon on a task card when the student attached Kanıt Fotoğrafı to
// it; click opens the lightbox. Renders nothing for a task without photos. The
// (signed, short-lived) URLs are fetched on click, not when the board loads.
export function EvidencePhotoButton({ studentId, task }: { studentId: string; task: DetailTask }) {
  const count = task.evidence_image_paths?.length ?? 0;
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await getTaskEvidenceUrlsForCoach(studentId, task.id);
    if (result.ok) setUrls(result.urls);
    else setError(result.error);
    setLoading(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-5 text-sky-600 hover:text-sky-700"
        onClick={handleOpen}
        aria-label={`Kanıt fotoğrafını gör (${count})`}
        title={`Kanıt fotoğrafı (${count})`}
      >
        <Camera className="size-3" />
      </Button>
      <EvidenceLightbox open={open} onOpenChange={setOpen} title={task.title} urls={urls} loading={loading} error={error} />
    </>
  );
}
