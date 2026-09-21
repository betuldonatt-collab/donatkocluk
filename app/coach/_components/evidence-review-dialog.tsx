"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EvidenceLightbox, type PhotoVerdict } from "@/components/evidence-lightbox";
import {
  getTaskEvidenceForCoach,
  reviewEvidencePhotos,
  type CoachEvidencePhoto,
  type EvidenceReviewOutcome,
} from "../actions";

// The coach's photo review: every uploaded photo with its own Onayla / Reddet,
// plus "Tümünü Onayla" / "Tümünü Reddet". Verdicts are picked first and saved
// together ("Kararları Kaydet"), so the coach can look at all the photos before
// anything reaches the student; the bulk buttons save immediately. If ANY photo is
// rejected the task goes back to the student. The buttons are there whenever the
// task has photos -- even before the student has marked it done, so the coach can
// already flag a bad photo (an approval then only records the verdict).
//
// Mount it only while it is open -- it loads the (signed) photo URLs when it mounts.
export function EvidenceReviewDialog({
  studentId,
  taskId,
  title,
  onClose,
  onReviewed,
}: {
  studentId: string;
  taskId: string;
  title: string;
  onClose: () => void;
  // Called after a verdict set was saved, with what it did to the task.
  onReviewed?: (outcome: EvidenceReviewOutcome) => void;
}) {
  const [photos, setPhotos] = useState<CoachEvidencePhoto[]>([]);
  const [decisions, setDecisions] = useState<(PhotoVerdict | null)[]>([]);
  const [reviewStatus, setReviewStatus] = useState("none");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTaskEvidenceForCoach(studentId, taskId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPhotos(result.photos);
        setDecisions(result.photos.map((p) => p.status));
        setReviewStatus(result.reviewStatus);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, taskId]);

  async function submit(list: { path: string; decision: PhotoVerdict }[]) {
    setBusy(true);
    try {
      const result = await reviewEvidencePhotos(taskId, list);
      if (!result.success) {
        if (result.code === "ERROR") {
          // Stay open so the coach can retry; say exactly what failed.
          toast.error(result.message);
          return;
        }
        toast.error("Bu görev zaten işlenmiş veya öğrenci tarafından güncellenmiş.");
        onClose();
        return;
      }
      toast.success(
        result.outcome === "approved"
          ? "Tüm fotoğraflar onaylandı, görev tamamlandı."
          : result.outcome === "rejected"
            ? "Görev öğrenciye geri gönderildi."
            : "Kararlar kaydedildi.",
      );
      onReviewed?.(result.outcome);
      onClose();
    } catch (e) {
      // The request itself failed (network, or the server could not build its
      // response) -- the verdicts may or may not have been saved.
      console.error("[evidence review] request failed:", e);
      toast.error("Karar gönderilemedi. Sayfayı yenileyip fotoğrafların durumunu kontrol et, gerekirse tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  const all = (decision: PhotoVerdict) => photos.map((p) => ({ path: p.path, decision }));

  return (
    <EvidenceLightbox
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title={title}
      photos={photos.map((p) => ({ url: p.url, status: p.status }))}
      loading={loading}
      error={error}
      review={
        photos.length > 0
          ? {
              decisions,
              busy,
              note:
                reviewStatus === "pending"
                  ? undefined
                  : "Öğrenci bu görevi henüz onaya göndermedi (ya da daha önce karara bağlandı). Vereceğin kararlar fotoğraflara işlenir; reddedersen öğrenci kırmızı çerçeveyle görür.",
              onDecide: (i, decision) => setDecisions((prev) => prev.map((d, idx) => (idx === i ? decision : d))),
              onApproveAll: () => void submit(all("approved")),
              onRejectAll: () => void submit(all("rejected")),
              onSave: () =>
                void submit(photos.map((p, i) => ({ path: p.path, decision: decisions[i] as PhotoVerdict }))),
            }
          : undefined
      }
    />
  );
}
