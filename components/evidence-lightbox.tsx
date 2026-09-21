"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Lightbox for a task's Kanıt Fotoğrafı: one photo at a time with previous/next
// and a thumbnail strip. Presentational -- the caller loads the (signed,
// short-lived) URLs.
//
// Two audiences:
//  * student (default): read-only. A photo the coach rejected gets a red border
//    and the text "Koçun bu fotoğrafı onaylamadı"; an approved one a green border.
//  * coach review (`review` given): every photo has its own Onayla / Reddet
//    buttons, plus "Tümünü Onayla" / "Tümünü Reddet" (which save straight away)
//    and "Kararları Kaydet" once every photo has a verdict.

export type PhotoVerdict = "approved" | "rejected";
export type EvidencePhotoView = { url: string; status?: PhotoVerdict | null };

export type EvidenceReviewControls = {
  // The coach's pending verdict for each photo (same order as `photos`); null = undecided.
  decisions: (PhotoVerdict | null)[];
  onDecide: (index: number, decision: PhotoVerdict) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onSave: () => void;
  busy: boolean;
  // Shown above the buttons, e.g. when the task is not waiting for review yet.
  note?: string;
};

export const REJECTED_PHOTO_TEXT = "Koçun bu fotoğrafı onaylamadı";

export function EvidenceLightbox({
  open,
  onOpenChange,
  title,
  photos,
  loading,
  error,
  review,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  photos: EvidencePhotoView[];
  loading: boolean;
  error: string | null;
  review?: EvidenceReviewControls;
}) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, photos.length - 1));
  const stateOf = (i: number): PhotoVerdict | null => (review ? (review.decisions[i] ?? null) : (photos[i]?.status ?? null));
  const state = photos.length > 0 ? stateOf(current) : null;
  const decidedCount = review ? review.decisions.filter((d) => d !== null).length : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setIndex(0);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Çözdüğün testlerin fotoğrafını buraya yükleyebilirsin.</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground py-10 text-center text-sm">Fotoğraf yükleniyor...</p>
        ) : error ? (
          <p className="text-destructive py-10 text-center text-sm">{error}</p>
        ) : photos.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">Bu görev için fotoğraf yok.</p>
        ) : (
          <div className="space-y-3">
            <div
              className={cn(
                "overflow-hidden rounded-md border",
                state === "rejected" && "border-2 border-red-500",
                state === "approved" && "border-2 border-emerald-500",
              )}
            >
              <a href={photos[current].url} target="_blank" rel="noreferrer" className="block">
                {/* Signed Storage URL, not a static asset -- next/image would only add a proxy hop. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[current].url}
                  alt={`Kanıt fotoğrafı ${current + 1}`}
                  className="bg-muted mx-auto max-h-[50dvh] w-auto max-w-full object-contain"
                />
              </a>
            </div>

            {review ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn("text-sm font-medium", state === "rejected" ? "text-red-600" : state === "approved" ? "text-emerald-700" : "text-muted-foreground")}>
                  {state === "rejected" ? "Fotoğraf reddedildi" : state === "approved" ? "Fotoğraf onaylandı" : "Henüz karar verilmedi"}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={state === "approved" ? "default" : "outline"}
                    className={cn("gap-1", state === "approved" && "bg-emerald-600 text-white hover:bg-emerald-700")}
                    disabled={review.busy}
                    onClick={() => review.onDecide(current, "approved")}
                  >
                    <Check className="size-3.5" />
                    Onayla
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={state === "rejected" ? "default" : "outline"}
                    className={cn(
                      "gap-1",
                      state === "rejected" ? "bg-red-600 text-white hover:bg-red-700" : "border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600",
                    )}
                    disabled={review.busy}
                    onClick={() => review.onDecide(current, "rejected")}
                  >
                    <X className="size-3.5" />
                    Reddet
                  </Button>
                </div>
              </div>
            ) : (
              state && (
                <p className={cn("text-sm font-semibold", state === "rejected" ? "text-red-600" : "text-emerald-700")}>
                  {state === "rejected" ? REJECTED_PHOTO_TEXT : "Fotoğraf onaylandı"}
                </p>
              )
            )}

            {review && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="text-muted-foreground text-xs">
                  {decidedCount}/{photos.length} fotoğraf için karar verildi.
                </p>
                <Button type="button" size="sm" disabled={review.busy || decidedCount < photos.length} onClick={review.onSave}>
                  {review.busy ? "Kaydediliyor..." : "Kararları Kaydet"}
                </Button>
              </div>
            )}

            {photos.length > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIndex((current - 1 + photos.length) % photos.length)}
                  aria-label="Önceki fotoğraf"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {current + 1} / {photos.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIndex((current + 1) % photos.length)}
                  aria-label="Sonraki fotoğraf"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}

            {photos.length > 1 && (
              <div className="flex flex-wrap justify-center gap-2">
                {photos.map((photo, i) => {
                  const s = stateOf(i);
                  return (
                    <button
                      key={photo.url}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`${i + 1}. fotoğraf`}
                      className={cn(
                        "overflow-hidden rounded border-2",
                        s === "rejected" ? "border-red-500" : s === "approved" ? "border-emerald-500" : "border-transparent",
                        i === current && "ring-primary ring-2 ring-offset-1",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" className="bg-muted size-12 object-cover" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {review && photos.length > 0 && !loading && !error && (
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            {review.note && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{review.note}</p>}
            <p className="text-muted-foreground text-xs">Bir fotoğraf bile reddedilirse görev öğrenciye geri gönderilir.</p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" size="sm" disabled={review.busy} onClick={review.onApproveAll}>
                Tümünü Onayla
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                disabled={review.busy}
                onClick={review.onRejectAll}
              >
                Tümünü Reddet
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
