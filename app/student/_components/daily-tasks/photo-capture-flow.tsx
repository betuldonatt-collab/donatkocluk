"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, Check, Crop, ImagePlus, Loader2, Plus, RotateCcw, RotateCw, SwitchCamera, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { decodeImageFile, type DecodedImage } from "@/lib/image-compress";
import { drawEdited, dragCrop, FULL_CROP, isFullCrop, rotateBy, type CropHandle, type CropRect, type Rotation } from "@/lib/photo-edit";
import { splitDuplicateFiles } from "@/lib/task-evidence";

// "Çoklu fotoğraf çek ve düzenle": the full-screen flow behind the Kanıt Fotoğrafı button.
//
//   1. Camera   -- an in-app WebRTC camera that STAYS OPEN between shots, so a whole stack of
//                  pages is one continuous session. Where the camera is unavailable (no HTTPS,
//                  permission refused, no device) it falls back to the phone's own camera app /
//                  the file picker, appending each result to the same stack.
//   2. Gallery  -- every staged photo (nothing has been uploaded yet): delete, edit, add more.
//   3. Editor   -- rotate in 90-degree steps and crop with a draggable rectangle (canvas).
//   4. Upload   -- one button processes every staged photo (the parent compresses and uploads
//                  them one after another) and clears the stack as each one lands.
//
// The staged photos live only in this component's state (blob URLs for the thumbnails, revoked
// when a photo leaves the stack or the component unmounts).

export const DUPLICATE_PHOTO_MESSAGE = "aynı fotoğrafı yükledin kontrol et.";

export type StagedPhoto = {
  id: string;
  file: File;
  // Blob URL of `file`, for the thumbnail / editor.
  url: string;
  // Identity of the ORIGINAL picked file (the duplicate guard); an edit keeps it.
  signature: string;
  edited: boolean;
};
export type UploadProgress = { phase: "compress" | "upload"; index: number; total: number } | null;
export type UploadOutcome = { error: { message: string; detail?: string } | null };

type View = "camera" | "gallery" | "edit";

let nextId = 0;

export function PhotoCaptureFlow({
  open,
  onOpenChange,
  knownSignatures,
  progress,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Signatures of the photos already uploaded to the task (so the same file is not added twice).
  knownSignatures: () => string[];
  progress: UploadProgress;
  // Uploads the staged photos in order, calling `onPhotoDone(id)` as each one is stored; stops at
  // the first failure and reports it (the photos not yet done stay staged for a retry).
  onUpload: (photos: StagedPhoto[], onPhotoDone: (id: string) => void) => Promise<UploadOutcome>;
}) {
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const photosRef = useRef<StagedPhoto[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  function addFiles(files: File[]): number {
    if (files.length === 0) return 0;
    const known = [...knownSignatures(), ...photosRef.current.map((p) => p.signature)];
    const { fresh, duplicates } = splitDuplicateFiles(files, known);
    if (duplicates > 0) toast.warning(DUPLICATE_PHOTO_MESSAGE);
    if (fresh.length === 0) return 0;
    const staged = fresh.map(({ file, signature }) => ({ id: `p${nextId++}`, file, url: URL.createObjectURL(file), signature, edited: false }));
    // Keep the ref current immediately: two shots in quick succession must both see the first.
    photosRef.current = [...photosRef.current, ...staged];
    setPhotos(photosRef.current);
    setError(null);
    return staged.length;
  }

  function removePhoto(id: string) {
    const gone = photosRef.current.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    photosRef.current = photosRef.current.filter((p) => p.id !== id);
    setPhotos(photosRef.current);
  }

  function replacePhoto(id: string, file: File) {
    const old = photosRef.current.find((p) => p.id === id);
    if (!old) return;
    URL.revokeObjectURL(old.url);
    photosRef.current = photosRef.current.map((p) => (p.id === id ? { ...p, file, url: URL.createObjectURL(file), edited: true } : p));
    setPhotos(photosRef.current);
  }

  function requestClose() {
    if (uploading) return;
    if (photosRef.current.length > 0) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(false);
  }

  function discardAndClose() {
    for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    photosRef.current = [];
    setPhotos([]);
    setError(null);
    setConfirmClose(false);
    onOpenChange(false);
  }

  async function submit() {
    if (uploading || photosRef.current.length === 0) return;
    setUploading(true);
    setError(null);
    const total = photosRef.current.length;
    let outcome: UploadOutcome;
    try {
      outcome = await onUpload(photosRef.current, removePhoto);
    } catch (e) {
      console.error("[evidence upload] unexpected failure:", e);
      outcome = { error: { message: "Fotoğraflar yüklenemedi. Tekrar dene.", detail: e instanceof Error ? e.message : String(e) } };
    }
    setUploading(false);
    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    toast.success(total === 1 ? "Fotoğraf yüklendi." : `${total} fotoğraf yüklendi.`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent
        className={cn(
          "top-0 left-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-0 p-0 sm:p-0",
          "sm:top-[50%] sm:left-[50%] sm:h-[min(92dvh,860px)] sm:w-[min(94vw,720px)] sm:max-w-none sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border",
        )}
      >
        <FlowContent
          photos={photos}
          uploading={uploading}
          error={error}
          progress={progress}
          onAddFiles={addFiles}
          onRemove={removePhoto}
          onReplace={replacePhoto}
          onSubmit={() => void submit()}
        />
        {confirmClose && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6">
            <div className="bg-card w-full max-w-xs space-y-3 rounded-lg border p-4 shadow-lg">
              <p className="text-sm font-semibold">Yüklenmemiş fotoğrafların var</p>
              <p className="text-muted-foreground text-sm">
                {photos.length} fotoğraf henüz yüklenmedi. Kapatırsan bu fotoğraflar silinir.
              </p>
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => setConfirmClose(false)}>
                  Devam et
                </Button>
                <Button type="button" variant="outline" className="text-destructive" onClick={discardAndClose}>
                  Kapat ve fotoğrafları sil
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Mounted only while the dialog is open, so the view starts fresh at every opening: the camera for
// a new stack, the gallery when photos are still staged (e.g. after a failed upload).
function FlowContent({
  photos,
  uploading,
  error,
  progress,
  onAddFiles,
  onRemove,
  onReplace,
  onSubmit,
}: {
  photos: StagedPhoto[];
  uploading: boolean;
  error: { message: string; detail?: string } | null;
  progress: UploadProgress;
  onAddFiles: (files: File[]) => number;
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  onSubmit: () => void;
}) {
  const [view, setView] = useState<View>(photos.length > 0 ? "gallery" : "camera");
  const [editingId, setEditingId] = useState<string | null>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const editing = editingId ? (photos.find((p) => p.id === editingId) ?? null) : null;
  const activeView: View = view === "edit" && !editing ? "gallery" : view;

  function pickFrom(files: FileList | null) {
    // The phone's own camera app (and the file picker) leave the page, so the result lands in the gallery.
    onAddFiles(Array.from(files ?? []));
    setView("gallery");
  }

  const title = activeView === "camera" ? "Fotoğraf çek" : activeView === "edit" ? "Fotoğrafı düzenle" : `Fotoğraflar${photos.length ? ` (${photos.length})` : ""}`;

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-3 pr-12">
        <DialogTitle className="text-base">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Görevin kanıt fotoğraflarını çek, düzenle ve hepsini birden yükle.
        </DialogDescription>
      </div>

      <div className="flex min-h-0 flex-col">
        {activeView === "camera" && (
          <CameraView
            count={photos.length}
            lastUrl={photos[photos.length - 1]?.url ?? null}
            onShot={(file) => onAddFiles([file])}
            onDone={() => setView("gallery")}
            onNativeCamera={() => nativeCameraRef.current?.click()}
            onPickGallery={() => galleryRef.current?.click()}
          />
        )}
        {activeView === "gallery" && (
          <GalleryView
            photos={photos}
            uploading={uploading}
            error={error}
            progress={progress}
            onCamera={() => setView("camera")}
            onNativeCamera={() => nativeCameraRef.current?.click()}
            onPickGallery={() => galleryRef.current?.click()}
            onEdit={(id) => {
              setEditingId(id);
              setView("edit");
            }}
            onRemove={onRemove}
            onSubmit={onSubmit}
          />
        )}
        {activeView === "edit" && editing && (
          <PhotoEditor
            key={editing.id + editing.url}
            photo={editing}
            onCancel={() => setView("gallery")}
            onSave={(file) => {
              onReplace(editing.id, file);
              setView("gallery");
            }}
          />
        )}
      </div>

      {/* capture="environment" opens the phone's rear camera app; the second input is the plain multi-picker. */}
      <input
        ref={nativeCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          pickFrom(e.target.files);
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
          pickFrom(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Camera

function cameraErrorText(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Kamera izni verilmedi. Tarayıcı ayarlarından izin verebilir ya da telefonunun kamerasını kullanabilirsin.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Bu cihazda kullanılabilir bir kamera bulunamadı.";
  if (name === "NotReadableError") return "Kamera başka bir uygulama tarafından kullanılıyor olabilir.";
  return "Kamera açılamadı.";
}

function CameraView({
  count,
  lastUrl,
  onShot,
  onDone,
  onNativeCamera,
  onPickGallery,
}: {
  count: number;
  lastUrl: string | null;
  onShot: (file: File) => void;
  onDone: () => void;
  onNativeCamera: () => void;
  onPickGallery: () => void;
}) {
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "live" | "unavailable">(supported ? "starting" : "unavailable");
  const [reason, setReason] = useState<string | null>(supported ? null : "Tarayıcın uygulama içi kamerayı desteklemiyor.");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [attempt, setAttempt] = useState(0);
  const [flash, setFlash] = useState(false);

  // The stream is opened once per (facing, attempt) and released when the view goes away -- NOT
  // after each shot, so shooting never reopens the camera.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStatus("live");
      } catch (e) {
        if (cancelled) return;
        console.error("[camera] getUserMedia failed:", e);
        setReason(cameraErrorText(e));
        setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [supported, facing, attempt]);

  function shoot() {
    const video = videoRef.current;
    if (!video || status !== "live" || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Fotoğraf çekilemedi. Tekrar dene.");
          return;
        }
        const now = Date.now();
        onShot(new File([blob], `kamera-${now}.jpg`, { type: "image/jpeg", lastModified: now }));
      },
      "image/jpeg",
      0.92,
    );
  }

  if (status === "unavailable") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <Camera className="text-muted-foreground size-10" />
        <p className="text-muted-foreground max-w-xs text-sm">{reason}</p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button type="button" onClick={onNativeCamera}>
            <Camera className="size-4" />
            Telefonun kamerasını aç
          </Button>
          <Button type="button" variant="outline" onClick={onPickGallery}>
            <ImagePlus className="size-4" />
            Galeriden seç
          </Button>
          {supported && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStatus("starting");
                setReason(null);
                setAttempt((n) => n + 1);
              }}
            >
              Kamerayı tekrar dene
            </Button>
          )}
          {count > 0 && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Fotoğraflara dön ({count})
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black">
      <div className="relative min-h-0 flex-1">
        {/* The whole frame is shown (contain) because the whole frame is what gets captured. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn("absolute inset-0 size-full object-contain", facing === "user" && "-scale-x-100")}
        />
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Kamera açılıyor...
          </div>
        )}
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute top-3 left-3 bg-black/50 text-white hover:bg-black/70"
          onClick={onPickGallery}
        >
          <ImagePlus className="size-4" />
          Galeriden seç
        </Button>
        {count > 0 && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {count} fotoğraf çekildi
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 items-center bg-black px-4 py-4">
        <div className="flex justify-start">
          {count > 0 ? (
            <button
              type="button"
              onClick={onDone}
              className="flex items-center gap-2 rounded-full bg-white/15 py-1 pr-3 pl-1 text-sm font-medium text-white"
              aria-label={`Çekilen ${count} fotoğrafı göster`}
            >
              {lastUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lastUrl} alt="" className="size-9 rounded-full object-cover" />
              )}
              Bitti · {count}
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={shoot}
            disabled={status !== "live"}
            aria-label="Fotoğraf çek"
            className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-90 disabled:opacity-40"
          >
            <span className="size-11 rounded-full bg-white" />
          </button>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setStatus("starting");
              setFacing((f) => (f === "environment" ? "user" : "environment"));
            }}
            aria-label="Kamerayı çevir"
            className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <SwitchCamera className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Gallery (the staging area)

export function GalleryView({
  photos,
  uploading,
  error,
  progress,
  onCamera,
  onNativeCamera,
  onPickGallery,
  onEdit,
  onRemove,
  onSubmit,
}: {
  photos: StagedPhoto[];
  uploading: boolean;
  error: { message: string; detail?: string } | null;
  progress: UploadProgress;
  onCamera: () => void;
  onNativeCamera: () => void;
  onPickGallery: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  const cameraSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {photos.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">Henüz fotoğraf yok. Fotoğraf çek ya da galeriden seç.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo, i) => (
              <li key={photo.id} className="relative">
                <button
                  type="button"
                  onClick={() => onEdit(photo.id)}
                  disabled={uploading}
                  aria-label={`${i + 1}. fotoğrafı düzenle`}
                  className="bg-muted block aspect-square w-full overflow-hidden rounded-md border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={`Fotoğraf ${i + 1}`} className="size-full object-cover" />
                </button>
                <span className="pointer-events-none absolute top-1 left-1 rounded-full bg-black/60 px-1.5 text-[10px] font-medium text-white">
                  {i + 1}
                </span>
                {photo.edited && (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">düzenlendi</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(photo.id)}
                  disabled={uploading}
                  aria-label={`${i + 1}. fotoğrafı sil`}
                  className="bg-background text-foreground hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 flex size-7 items-center justify-center rounded-full border shadow-sm transition-colors disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(photo.id)}
                  disabled={uploading}
                  aria-label={`${i + 1}. fotoğrafı kırp veya döndür`}
                  className="bg-background text-foreground absolute right-1 bottom-1 flex size-7 items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
                >
                  <Crop className="size-3.5" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={cameraSupported ? onCamera : onNativeCamera}
                disabled={uploading}
                className="text-muted-foreground hover:bg-muted flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs disabled:opacity-50"
              >
                <Plus className="size-5" />
                Ekle
              </button>
            </li>
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t p-4">
        {error && (
          <div className="space-y-0.5">
            <p className="text-destructive text-xs">{error.message}</p>
            {error.detail && <p className="text-muted-foreground font-mono text-[10px] break-all">Hata detayı: {error.detail}</p>}
            <p className="text-muted-foreground text-xs">Yüklenmeyen fotoğraflar burada duruyor; tekrar yükleyebilirsin.</p>
          </div>
        )}
        {uploading && progress && (
          <p className="text-muted-foreground text-xs">
            {progress.total > 1 ? `Fotoğraf ${progress.index}/${progress.total}: ` : ""}
            {progress.phase === "compress" ? "küçültülüyor..." : "yükleniyor..."}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={uploading} onClick={cameraSupported ? onCamera : onNativeCamera}>
            <Camera className="size-4" />
            Fotoğraf çek
          </Button>
          <Button type="button" variant="outline" disabled={uploading} onClick={onPickGallery}>
            <ImagePlus className="size-4" />
            Galeriden ekle
          </Button>
        </div>
        <Button type="button" className="w-full" disabled={uploading || photos.length === 0} onClick={onSubmit}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {uploading ? "Yükleniyor..." : photos.length === 0 ? "Yükle" : `${photos.length} fotoğrafı yükle`}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Editor (rotate + crop)

const HANDLES: { id: Exclude<CropHandle, "move">; place: string }[] = [
  { id: "nw", place: "left-0 top-0 cursor-nwse-resize" },
  { id: "n", place: "left-1/2 top-0 cursor-ns-resize" },
  { id: "ne", place: "left-full top-0 cursor-nesw-resize" },
  { id: "e", place: "left-full top-1/2 cursor-ew-resize" },
  { id: "se", place: "left-full top-full cursor-nwse-resize" },
  { id: "s", place: "left-1/2 top-full cursor-ns-resize" },
  { id: "sw", place: "left-0 top-full cursor-nesw-resize" },
  { id: "w", place: "left-0 top-1/2 cursor-ew-resize" },
];

function PhotoEditor({ photo, onCancel, onSave }: { photo: StagedPhoto; onCancel: () => void; onSave: (file: File) => void }) {
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: CropHandle; x: number; y: number; crop: CropRect; w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let current: DecodedImage | null = null;
    decodeImageFile(photo.file)
      .then((d) => {
        if (cancelled) {
          d.close();
          return;
        }
        current = d;
        setDecoded(d);
      })
      .catch((e) => {
        console.error("[photo editor] decode failed:", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      current?.close();
    };
  }, [photo.file]);

  // The preview is the rotated image at a screen-friendly size; the crop rectangle is drawn over it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!decoded || !canvas) return;
    const preview = drawEdited(decoded.source, decoded.width, decoded.height, rotation, FULL_CROP, 1400);
    canvas.width = preview.width;
    canvas.height = preview.height;
    canvas.getContext("2d")?.drawImage(preview, 0, 0);
  }, [decoded, rotation]);

  function rotate(delta: 90 | -90) {
    setRotation((r) => rotateBy(r, delta));
    // The crop is expressed over the rotated image, so a turn starts the crop afresh.
    setCrop(FULL_CROP);
  }

  function startDrag(handle: CropHandle, e: React.PointerEvent<HTMLElement>) {
    const frame = frameRef.current;
    if (!frame) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = frame.getBoundingClientRect();
    drag.current = { handle, x: e.clientX, y: e.clientY, crop, w: rect.width, h: rect.height };
  }
  function moveDrag(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.w === 0 || d.h === 0) return;
    setCrop(dragCrop(d.crop, d.handle, (e.clientX - d.x) / d.w, (e.clientY - d.y) / d.h));
  }
  function endDrag() {
    drag.current = null;
  }

  async function save() {
    if (!decoded || saving) return;
    if (rotation === 0 && isFullCrop(crop)) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      const canvas = drawEdited(decoded.source, decoded.width, decoded.height, rotation, crop);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("toBlob returned null");
      const now = Date.now();
      onSave(new File([blob], `duzenlendi-${now}.jpg`, { type: "image/jpeg", lastModified: now }));
    } catch (e) {
      console.error("[photo editor] save failed:", e);
      toast.error("Fotoğraf düzenlenemedi. Tekrar dene.");
      setSaving(false);
    }
  }

  const boxStyle: CSSProperties = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/90 p-5">
        {failed ? (
          <p className="max-w-xs text-center text-sm text-white/80">Bu fotoğraf düzenlenemedi. Silip yeniden çekmeyi dene.</p>
        ) : !decoded ? (
          <Loader2 className="size-6 animate-spin text-white/80" />
        ) : (
          <div ref={frameRef} className="relative touch-none select-none">
            <canvas ref={canvasRef} className="block h-auto max-h-[56dvh] w-auto max-w-[calc(100vw-2.5rem)] sm:max-w-full" />
            {/* Everything outside the crop is dimmed. */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]" style={boxStyle} />
            </div>
            <div
              className="absolute cursor-move touch-none border-2 border-white"
              style={boxStyle}
              onPointerDown={(e) => startDrag("move", e)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {HANDLES.map((h) => (
                <div
                  key={h.id}
                  role="presentation"
                  className={cn("absolute z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center", h.place)}
                  onPointerDown={(e) => startDrag(h.id, e)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <span className="size-3.5 rounded-sm border border-black/40 bg-white shadow" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t p-4">
        <div className="flex items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!decoded || saving} onClick={() => rotate(-90)} aria-label="Sola döndür">
            <RotateCcw className="size-4" />
            Sola
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!decoded || saving} onClick={() => rotate(90)} aria-label="Sağa döndür">
            <RotateCw className="size-4" />
            Sağa
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!decoded || saving || (rotation === 0 && isFullCrop(crop))}
            onClick={() => {
              setRotation(0);
              setCrop(FULL_CROP);
            }}
          >
            Sıfırla
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Vazgeç
          </Button>
          <Button type="button" disabled={!decoded || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
