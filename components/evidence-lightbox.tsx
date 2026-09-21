"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Simple lightbox for a task's Kanıt Fotoğrafı: one photo at a time with
// previous/next when there are several, opening the original in a new tab on
// click. Presentational -- the caller loads the (signed, short-lived) URLs.

export function EvidenceLightbox({
  open,
  onOpenChange,
  title,
  urls,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  urls: string[];
  loading: boolean;
  error: string | null;
}) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, urls.length - 1));

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
          <DialogTitle>Kanıt Fotoğrafı</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground py-10 text-center text-sm">Fotoğraf yükleniyor...</p>
        ) : error ? (
          <p className="text-destructive py-10 text-center text-sm">{error}</p>
        ) : urls.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">Bu görev için fotoğraf yok.</p>
        ) : (
          <div className="space-y-3">
            <a href={urls[current]} target="_blank" rel="noreferrer" className="block">
              {/* Signed Storage URL, not a static asset -- next/image would only add a proxy hop. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls[current]}
                alt={`Kanıt fotoğrafı ${current + 1}`}
                className="bg-muted mx-auto max-h-[65dvh] w-auto max-w-full rounded-md object-contain"
              />
            </a>
            {urls.length > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIndex((current - 1 + urls.length) % urls.length)}
                  aria-label="Önceki fotoğraf"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {current + 1} / {urls.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIndex((current + 1) % urls.length)}
                  aria-label="Sonraki fotoğraf"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
