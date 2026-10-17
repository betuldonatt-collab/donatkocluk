"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Highlighter, Loader2, Pencil, RotateCcw, RotateCw, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { decodeImageFile } from "@/lib/image-compress";
import { friendlyError } from "@/lib/friendly-error";
import { rotateBy, type Rotation } from "@/lib/photo-edit";
import {
  BRUSH_SIZES,
  PEN_COLORS,
  addPoint,
  drawStrokes,
  exportAnnotated,
  newStroke,
  renderBase,
  rotateStrokes,
  toNormalized,
  type BrushKey,
  type Stroke,
  type Tool,
} from "@/lib/photo-annotate";
import { cn } from "@/lib/utils";

type Loaded = { source: CanvasImageSource; width: number; height: number; close: () => void };

// The coach's photo editor: rotate in 90-degree steps and draw / highlight with a finger, pen or mouse. Nothing is saved until "Kaydet":
// that hands the finished JPEG to `onSave`, which stores it as the coach's PRIVATE copy -- the student's original is never touched.
export function PhotoEditor({
  imageUrl,
  busy,
  onSave,
  onCancel,
}: {
  imageUrl: string;
  busy: boolean;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(PEN_COLORS[0].value);
  const [brush, setBrush] = useState<BrushKey>("medium");
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Decode the photo once. It is fetched as bytes (the signed link allows it) so the canvas is never tainted and can be exported.
  useEffect(() => {
    let cancelled = false;
    let decoded: Loaded | null = null;
    (async () => {
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        decoded = await decodeImageFile(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
        if (cancelled) {
          decoded.close();
          return;
        }
        setLoaded(decoded);
      } catch (e) {
        if (!cancelled) setLoadError(friendlyError(e, "Fotoğraf düzenleme için açılamadı."));
      }
    })();
    return () => {
      cancelled = true;
      decoded?.close();
    };
  }, [imageUrl]);

  // The base layer: the photo at the current rotation.
  const baseResult = useMemo(() => {
    if (!loaded) return null;
    try {
      return { canvas: renderBase(loaded.source, loaded.width, loaded.height, rotation), error: null };
    } catch (e) {
      return { canvas: null, error: friendlyError(e, "Fotoğraf düzenleme için açılamadı.") };
    }
  }, [loaded, rotation]);
  const base = baseResult?.canvas ?? null;

  // Redraw: base, the finished strokes, the stroke being drawn.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base) return;
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(base, 0, 0);
    drawStrokes(ctx, strokes, base.width, base.height);
    if (live) drawStrokes(ctx, [live], base.width, base.height);
  }, [base, strokes, live]);

  const turn = useCallback((delta: 90 | -90) => {
    setRotation((r) => rotateBy(r, delta));
    setStrokes((prev) => rotateStrokes(prev, delta)); // a drawing turns with the photo
    setLive(null);
  }, []);

  function pointAt(e: React.PointerEvent<HTMLCanvasElement>) {
    return toNormalized(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || exporting || !base) return;
    try {
      // keeps the stroke going when the finger / pen leaves the canvas; a pointer that already ended throws, which is harmless
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // drawing still works without capture
    }
    setLive(newStroke(tool, color, brush, pointAt(e)));
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!live) return;
    const p = pointAt(e);
    setLive((cur) => (cur ? addPoint(cur, p) : cur));
  }
  function finishStroke() {
    if (!live) return;
    setStrokes((prev) => [...prev, live]);
    setLive(null);
  }

  async function save() {
    if (!base || busy || exporting) return;
    setExporting(true);
    try {
      onSave(await exportAnnotated(base, strokes));
    } catch (e) {
      setLoadError(friendlyError(e, "Fotoğraf kaydedilemedi."));
    } finally {
      setExporting(false);
    }
  }

  const changed = strokes.length > 0 || rotation !== 0;
  const working = busy || exporting;

  const problem = loadError ?? baseResult?.error ?? null;
  if (problem) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-destructive text-sm">{problem}</p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Kapat
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Araç">
          <Button type="button" size="sm" variant={tool === "pen" ? "default" : "outline"} onClick={() => setTool("pen")} aria-pressed={tool === "pen"}>
            <Pencil className="size-4" />
            Kalem
          </Button>
          <Button type="button" size="sm" variant={tool === "highlighter" ? "default" : "outline"} onClick={() => setTool("highlighter")} aria-pressed={tool === "highlighter"}>
            <Highlighter className="size-4" />
            Vurgula
          </Button>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Renk">
          {PEN_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.label}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
              style={{ backgroundColor: c.value }}
              className={cn("size-6 rounded-full border-2 border-white shadow ring-1 ring-black/20", color === c.value && "ring-primary ring-2 ring-offset-1")}
            />
          ))}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Kalınlık">
          {BRUSH_SIZES.map((b) => (
            <Button key={b.key} type="button" size="sm" variant={brush === b.key ? "secondary" : "ghost"} onClick={() => setBrush(b.key)} aria-pressed={brush === b.key}>
              {b.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => turn(-90)} aria-label="Sola döndür" disabled={!base}>
            <RotateCcw className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => turn(90)} aria-label="Sağa döndür" disabled={!base}>
            <RotateCw className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={strokes.length === 0} aria-label="Son çizgiyi geri al">
            <Undo2 className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => setStrokes([])} disabled={strokes.length === 0} aria-label="Tüm çizimleri sil">
            <Eraser className="size-4" />
          </Button>
        </div>
      </div>

      <div className="bg-muted flex min-h-60 items-center justify-center overflow-hidden rounded-md">
        {base ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            className="max-h-[62dvh] w-auto max-w-full cursor-crosshair touch-none select-none"
            aria-label="Fotoğraf üzerinde çiz"
          />
        ) : (
          <span className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Fotoğraf hazırlanıyor...
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">Düzenlenmiş kopya sadece sana görünür; öğrenci orijinal fotoğrafı görmeye devam eder.</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={working}>
            Vazgeç
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!base || !changed || working}>
            {working && <Loader2 className="size-4 animate-spin" />}
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
