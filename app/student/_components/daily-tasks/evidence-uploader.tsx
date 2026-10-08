"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Hourglass, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EvidenceLightbox, REJECTED_PHOTO_TEXT } from "@/components/evidence-lightbox";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image-compress";
import { getTaskEvidenceUrls, removeTaskEvidence, uploadTaskEvidence } from "../../actions";
import { PhotoCaptureFlow, type StagedPhoto, type UploadOutcome } from "./photo-capture-flow";

// The duplicate message moved next to the flow that raises it.
export { DUPLICATE_PHOTO_MESSAGE } from "./photo-capture-flow";

// "Kanıt Fotoğrafı": the student attaches photos of their finished work (e.g. a
// solved test page) to the task. Every photo is shrunk in the browser first
// (lib/image-compress.ts) so a phone photo of several MB becomes a few hundred KB
// before it ever reaches Storage. One entry point, "Fotoğraf Ekle", opens the full-screen
// multi-photo flow (photo-capture-flow.tsx): continuous in-app camera, a staging gallery,
// crop/rotate, and one button that uploads everything staged. There is no limit on the
// number of photos.
//
// A task with photos is not completed on the student's say-so: marking it done
// holds it for the coach's approval (updateTaskProgress), and this component
// shows where the review stands.

type ReviewStatus = "none" | "pending" | "approved" | "rejected";

// Duplicate guard: the same file picked twice (same name, size and last-modified
// time) is refused. The photos in Storage are recompressed copies, so their
// original identity is remembered per task in this browser (path -> signature)
// and forgotten again when a photo is deleted.

const signatureKey = (taskId: string) => `evidence-signatures:${taskId}`;

function loadSignatures(taskId: string, currentPaths: string[]): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(signatureKey(taskId)) ?? "{}") as Record<string, string>;
    return Object.fromEntries(Object.entries(raw).filter(([path]) => currentPaths.includes(path)));
  } catch {
    return {};
  }
}

function saveSignatures(taskId: string, signatures: Record<string, string>) {
  try {
    localStorage.setItem(signatureKey(taskId), JSON.stringify(signatures));
  } catch {
    // Private mode / storage disabled: duplicates are then only caught within this session.
  }
}
type PhotoStatus = Record<string, "approved" | "rejected">;

export function EvidenceUploader({
  taskId,
  paths,
  reviewStatus,
  photoStatus,
  rejectionNote = null,
  onChange,
}: {
  taskId: string;
  paths: string[];
  reviewStatus: ReviewStatus;
  // The coach's optional reason for the rejection, shown under the message.
  rejectionNote?: string | null;
  // The coach's verdict per photo (a path that is not here has not been reviewed).
  photoStatus: PhotoStatus;
  // Called with the task's new photo paths, review state, per-photo verdicts and
  // task status after an upload/removal (adding photos to a done task sends it to
  // the coach).
  onChange: (next: { paths: string[]; reviewStatus: ReviewStatus; status: string; photoStatus: PhotoStatus }) => void;
}) {
  const [flowOpen, setFlowOpen] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState<{ phase: "compress" | "upload"; index: number; total: number } | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [viewing, setViewing] = useState(false);
  // The path being deleted right now (its X shows a spinner-ish state).
  const [removing, setRemoving] = useState<string | null>(null);
  // Signatures of the photos added since this modal opened (path -> signature) --
  // covers a browser where localStorage is unavailable.
  const sessionSignatures = useRef<Record<string, string>>({});

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

  // Uploads the photos staged in the capture flow. They are compressed and uploaded one
  // after another (each upload appends to the task's photo list, so running them in
  // parallel would overwrite each other); the first failure stops the batch and says
  // which photo and which step failed -- the flow keeps the rest staged for a retry.
  async function uploadStaged(photos: StagedPhoto[], onPhotoDone: (id: string) => void): Promise<UploadOutcome> {
    setError(null);
    let uploaded = 0;
    for (const [i, photo] of photos.entries()) {
      const label = photos.length > 1 ? `${i + 1}. fotoğraf: ` : "";
      try {
        setBusy({ phase: "compress", index: i + 1, total: photos.length });
        const compressed = await compressImage(photo.file);
        setBusy({ phase: "upload", index: i + 1, total: photos.length });
        const form = new FormData();
        form.set("taskId", taskId);
        form.set("file", compressed);
        const result = await uploadTaskEvidence(form);
        if (!result.ok) {
          console.error("[evidence upload] server refused the photo:", result);
          setBusy(null);
          return { error: { message: label + result.error, detail: result.detail } };
        }
        uploaded += 1;
        // Remember which original file became this stored photo.
        const newPath = result.paths[result.paths.length - 1];
        sessionSignatures.current[newPath] = photo.signature;
        saveSignatures(taskId, { ...loadSignatures(taskId, result.paths), [newPath]: photo.signature });
        onChange({
          paths: result.paths,
          reviewStatus: result.reviewStatus as ReviewStatus,
          status: result.status,
          photoStatus: result.photoStatus,
        });
        onPhotoDone(photo.id);
      } catch (e) {
        // Thrown here (not returned by the action): the browser could not decode or
        // shrink the photo, or the request itself failed (too large, offline).
        console.error("[evidence upload] client-side failure:", e);
        setBusy(null);
        return {
          error: {
            message: label + "Fotoğraf işlenemedi veya gönderilemedi. Başka bir fotoğraf dene.",
            detail: `client · ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`.slice(0, 220),
          },
        };
      }
    }
    if (photos.length > 1 && uploaded > 0) console.info(`[evidence upload] ${uploaded}/${photos.length} photos uploaded`);
    setBusy(null);
    return { error: null };
  }

  async function handleRemove(path: string) {
    if (removing) return;
    setError(null);
    setRemoving(path);
    try {
      const result = await removeTaskEvidence(taskId, path);
      if (!result.ok) {
        console.error("[evidence remove] failed:", result);
        setError({ message: result.error, detail: result.detail });
        return;
      }
      delete sessionSignatures.current[path];
      saveSignatures(taskId, loadSignatures(taskId, result.paths));
      onChange({
        paths: result.paths,
        reviewStatus: result.reviewStatus as ReviewStatus,
        status: result.status,
        photoStatus: result.photoStatus,
      });
    } catch (e) {
      // The request itself failed (before, the rejection was swallowed and the
      // button seemed to do nothing).
      console.error("[evidence remove] request failed:", e);
      setError({
        message: "Fotoğraf silinemedi. Tekrar dene.",
        detail: `client · ${e instanceof Error ? e.message : String(e)}`.slice(0, 220),
      });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Kanıt fotoğrafı (zorunlu): bu görevi tamamlamak için çalışmanın en az bir fotoğrafını yüklemelisin.</Label>

      {reviewStatus === "pending" && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          <Hourglass className="mt-0.5 size-3.5 shrink-0" />
          Koçun fotoğraflarına bakıyor. Fotoğraflar onaylandığında görev tamamlandı sayılır.
        </div>
      )}
      {reviewStatus === "rejected" && (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Koç bu görevi geri gönderdi. Kırmızı çerçeveli fotoğrafları silip yenisini ekle, sonra görevi tekrar tamamlandı olarak işaretle.
            {rejectionNote && <span className="mt-1 block font-medium">Koçun notu: {rejectionNote}</span>}
          </span>
        </div>
      )}
      {reviewStatus === "approved" && paths.length > 0 && (
        <p className="text-xs text-emerald-700">Fotoğraflar onaylandı.</p>
      )}

      {paths.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {paths.map((path, i) => {
            const verdict = photoStatus[path] ?? null;
            return (
              <div key={path} className="space-y-1">
                <div className="relative">
                  {urls[i] ? (
                    <button
                      type="button"
                      onClick={() => setViewing(true)}
                      aria-label="Fotoğrafı büyüt"
                      className={cn(
                        "block aspect-square w-full overflow-hidden rounded-md",
                        verdict === "rejected" ? "border-2 border-red-500" : verdict === "approved" ? "border-2 border-emerald-500" : "border",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls[i]} alt={`Kanıt fotoğrafı ${i + 1}`} className="bg-muted size-full object-cover" />
                    </button>
                  ) : (
                    <div
                      className={cn(
                        "bg-muted aspect-square w-full animate-pulse rounded-md",
                        verdict === "rejected" ? "border-2 border-red-500" : "border",
                      )}
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRemove(path);
                    }}
                    disabled={removing !== null}
                    className={cn(
                      "bg-background text-foreground hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 z-10 flex size-6 items-center justify-center rounded-full border shadow-sm transition-colors",
                      removing === path && "animate-pulse opacity-60",
                    )}
                    aria-label="Fotoğrafı kaldır"
                    title="Fotoğrafı kaldır"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {verdict === "rejected" && <p className="text-xs leading-snug font-semibold text-red-600">{REJECTED_PHOTO_TEXT}</p>}
                {verdict === "approved" && <p className="text-[11px] leading-snug text-emerald-700">Fotoğraf onaylandı</p>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setFlowOpen(true)}>
          <Camera className="size-4" />
          Fotoğraf Ekle
        </Button>
      </div>

      <PhotoCaptureFlow
        open={flowOpen}
        onOpenChange={setFlowOpen}
        knownSignatures={() => Object.values({ ...loadSignatures(taskId, paths), ...sessionSignatures.current })}
        progress={busy}
        onUpload={uploadStaged}
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
        photos={urls.map((url, i) => ({ url, status: photoStatus[paths[i]] ?? null }))}
        loading={false}
        error={null}
      />
    </div>
  );
}
