"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Hourglass, ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EvidenceLightbox } from "@/components/evidence-lightbox";
import { compressImage } from "@/lib/image-compress";
import { getTaskEvidenceUrls, removeTaskEvidence, uploadTaskEvidence } from "../../actions";

// "Kanıt Fotoğrafı": the student attaches photos of their finished work (e.g. a
// solved test page) to the task. Every photo is shrunk in the browser first
// (lib/image-compress.ts) so a phone photo of several MB becomes a few hundred KB
// before it ever reaches Storage. Two entry points: the camera (capture) and the
// gallery/files. There is no limit on the number of photos.
//
// A task with photos is not completed on the student's say-so: marking it done
// holds it for the coach's approval (updateTaskProgress), and this component
// shows where the review stands.

type ReviewStatus = "none" | "pending" | "approved" | "rejected";

export function EvidenceUploader({
  taskId,
  paths,
  reviewStatus,
  onChange,
}: {
  taskId: string;
  paths: string[];
  reviewStatus: ReviewStatus;
  // Called with the task's new photo paths, review status and task status after
  // an upload/removal (adding photos to a done task sends it to the coach).
  onChange: (next: { paths: string[]; reviewStatus: ReviewStatus; status: string }) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState<{ phase: "compress" | "upload"; index: number; total: number } | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [viewing, setViewing] = useState(false);

  // Signed thumbnails for the photos already stored; refetched whenever the list changes.
  const pathsKey = paths.join("|");
  useEffect(() => {
    let cancelled = false;
    if (paths.length === 0) {
      Promise.resolve().then(() => !cancelled && setUrls([]));
      return () => {
        cancelled = true;
      };
    }
    getTaskEvidenceUrls(taskId).then((result) => {
      if (!cancelled && result.ok) setUrls(result.urls);
    });
    return () => {
      cancelled = true;
    };
    // pathsKey stands in for `paths` (a new array identity every render would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, pathsKey]);

  // The gallery picker allows several photos at once. They are compressed and
  // uploaded one after another (each upload appends to the task's photo list, so
  // running them in parallel would overwrite each other); the first failure stops
  // the batch and says which photo and which step failed.
  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    let uploaded = 0;
    for (const [i, file] of files.entries()) {
      const label = files.length > 1 ? `${i + 1}. fotoğraf: ` : "";
      try {
        setBusy({ phase: "compress", index: i + 1, total: files.length });
        const compressed = await compressImage(file);
        setBusy({ phase: "upload", index: i + 1, total: files.length });
        const form = new FormData();
        form.set("taskId", taskId);
        form.set("file", compressed);
        const result = await uploadTaskEvidence(form);
        if (!result.ok) {
          console.error("[evidence upload] server refused the photo:", result);
          setError({ message: label + result.error, detail: result.detail });
          break;
        }
        uploaded += 1;
        onChange({ paths: result.paths, reviewStatus: result.reviewStatus as ReviewStatus, status: result.status });
      } catch (e) {
        // Thrown here (not returned by the action): the browser could not decode or
        // shrink the photo, or the request itself failed (too large, offline).
        console.error("[evidence upload] client-side failure:", e);
        setError({
          message: label + "Fotoğraf işlenemedi veya gönderilemedi. Başka bir fotoğraf dene.",
          detail: `client · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`.slice(0, 220),
        });
        break;
      }
    }
    if (files.length > 1 && uploaded > 0) console.info(`[evidence upload] ${uploaded}/${files.length} photos uploaded`);
    setBusy(null);
  }

  async function handleRemove(path: string) {
    setError(null);
    const result = await removeTaskEvidence(taskId, path);
    if (!result.ok) {
      console.error("[evidence remove] failed:", result);
      setError({ message: result.error, detail: result.detail });
      return;
    }
    onChange({ paths: result.paths, reviewStatus: result.reviewStatus as ReviewStatus, status: result.status });
  }

  return (
    <div className="space-y-2">
      <Label>Kanıt Fotoğrafı</Label>

      {reviewStatus === "pending" && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          <Hourglass className="mt-0.5 size-3.5 shrink-0" />
          Koç onayı bekleniyor. Fotoğraflar incelenip onaylandığında görev tamamlandı sayılır.
        </div>
      )}
      {reviewStatus === "rejected" && (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Koç fotoğrafları onaylamadı. Fotoğrafları düzeltip görevi tekrar tamamlandı olarak işaretle.
        </div>
      )}
      {reviewStatus === "approved" && paths.length > 0 && (
        <p className="text-xs text-emerald-700">Koç bu görevin fotoğraflarını onayladı.</p>
      )}

      {paths.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {paths.map((path, i) => (
            <div key={path} className="relative">
              {urls[i] ? (
                <button type="button" onClick={() => setViewing(true)} aria-label="Fotoğrafı büyüt">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[i]} alt={`Kanıt fotoğrafı ${i + 1}`} className="bg-muted size-16 rounded-md border object-cover" />
                </button>
              ) : (
                <div className="bg-muted size-16 animate-pulse rounded-md border" />
              )}
              <button
                type="button"
                onClick={() => handleRemove(path)}
                disabled={busy !== null}
                className="bg-background text-muted-foreground hover:text-destructive absolute -top-1.5 -right-1.5 rounded-full border p-0.5 shadow-sm"
                aria-label="Fotoğrafı kaldır"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => cameraRef.current?.click()}>
          <Camera className="size-4" />
          Fotoğraf Çek
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => galleryRef.current?.click()}>
          <ImagePlus className="size-4" />
          Galeriden Seç
        </Button>
      </div>

      {/* capture="environment" opens the phone's rear camera directly; the second input is the plain picker. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {busy && (
        <p className="text-muted-foreground text-xs">
          {busy.total > 1 ? `Fotoğraf ${busy.index}/${busy.total}: ` : ""}
          {busy.phase === "compress" ? "küçültülüyor..." : "yükleniyor..."}
        </p>
      )}
      {error && (
        <div className="space-y-0.5">
          <p className="text-destructive text-xs">{error.message}</p>
          {error.detail && <p className="text-muted-foreground font-mono text-[10px] break-all">Hata detayı: {error.detail}</p>}
        </div>
      )}
      <p className="text-muted-foreground text-[11px]">
        Fotoğraflar otomatik küçültülür; sadece koçun görebilir. Fotoğraflı görevi tamamlandı olarak işaretlediğinde koçun onayına gider.
      </p>

      <EvidenceLightbox
        open={viewing}
        onOpenChange={setViewing}
        title="Yüklediğin fotoğraflar"
        urls={urls}
        loading={false}
        error={null}
      />
    </div>
  );
}
