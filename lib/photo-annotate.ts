import { FULL_CROP, drawEdited, type Rotation } from "./photo-edit";

// The coach's photo editor (Fotoğraf Havuzu): rotate a student's photo and draw / highlight on it. The result is a NEW JPEG kept in the
// coach-only `coach_annotations` bucket; the student's original is never changed and the student never sees the copy (migration 0140).
//
// Strokes are stored NORMALIZED (0..1 of the image's width and height, in the image as currently rotated) with their thickness as a
// fraction of the image's SHORTER side, so they look the same on the small preview and the full-size export, and a 90-degree turn maps
// them exactly (a point (x, y) turned clockwise becomes (1 - y, x); the shorter side does not change).

export type Tool = "pen" | "highlighter";
export type Point = [number, number];
export type Stroke = { tool: Tool; color: string; size: number; points: Point[] };

export const PEN_COLORS = [
  { value: "#e11d48", label: "Kırmızı" },
  { value: "#f59e0b", label: "Turuncu" },
  { value: "#facc15", label: "Sarı" },
  { value: "#16a34a", label: "Yeşil" },
  { value: "#2563eb", label: "Mavi" },
  { value: "#111827", label: "Siyah" },
] as const;

export const BRUSH_SIZES = [
  { key: "thin", label: "İnce", size: 0.004 },
  { key: "medium", label: "Orta", size: 0.008 },
  { key: "thick", label: "Kalın", size: 0.016 },
] as const;
export type BrushKey = (typeof BRUSH_SIZES)[number]["key"];

// The highlighter is a much wider, see-through marker.
export const HIGHLIGHTER_WIDTH_FACTOR = 4;
export const HIGHLIGHTER_ALPHA = 0.35;

// The edited copy is uploaded through a Server Action (default body limit 1 MB), so it stays well under that.
export const ANNOTATION_MAX_BYTES = 900 * 1024;
export const ANNOTATION_BUCKET = "coach_annotations";
// Working size of the editor: a 12-megapixel photo is shrunk to this on its longer side (the student's upload is 1600 px anyway).
export const EDITOR_MAX_SIDE = 1800;

export function rotatePoint(p: Point, delta: 90 | -90): Point {
  return delta === 90 ? [1 - p[1], p[0]] : [p[1], 1 - p[0]];
}

// Turns every stroke with the image, so a drawing stays on what it marked.
export function rotateStrokes(strokes: Stroke[], delta: 90 | -90): Stroke[] {
  return strokes.map((s) => ({ ...s, points: s.points.map((p) => rotatePoint(p, delta)) }));
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// A pointer position inside the canvas's on-screen box, as a normalized point (clamped to the image).
export function toNormalized(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point {
  if (rect.width <= 0 || rect.height <= 0) return [0, 0];
  return [clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height)];
}

// Appends a point unless it is practically where the last one is (a long scribble stays a light list of points).
export const MIN_POINT_DISTANCE = 0.0015;
export function addPoint(stroke: Stroke, p: Point): Stroke {
  const last = stroke.points[stroke.points.length - 1];
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_POINT_DISTANCE) return stroke;
  return { ...stroke, points: [...stroke.points, p] };
}

export function newStroke(tool: Tool, color: string, brush: BrushKey, start: Point): Stroke {
  const size = BRUSH_SIZES.find((b) => b.key === brush)?.size ?? BRUSH_SIZES[1].size;
  return { tool, color, size, points: [start] };
}

// Line width in pixels of a stroke on an image `width` x `height`.
export function strokeWidthPx(stroke: Stroke, width: number, height: number): number {
  const base = Math.max(1, stroke.size * Math.min(width, height));
  return stroke.tool === "highlighter" ? base * HIGHLIGHTER_WIDTH_FACTOR : base;
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number): void {
  if (stroke.points.length === 0) return;
  const lw = strokeWidthPx(stroke, width, height);
  ctx.save();
  ctx.globalAlpha = stroke.tool === "highlighter" ? HIGHLIGHTER_ALPHA : 1;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const [first, ...rest] = stroke.points;
  if (rest.length === 0) {
    ctx.beginPath();
    ctx.arc(first[0] * width, first[1] * height, lw / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // ONE path per stroke: a see-through highlighter does not get darker where its own stroke crosses itself.
    ctx.beginPath();
    ctx.moveTo(first[0] * width, first[1] * height);
    for (const p of rest) ctx.lineTo(p[0] * width, p[1] * height);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number): void {
  for (const s of strokes) drawStroke(ctx, s, width, height);
}

// The rotated photo as a canvas (the editor's base layer).
export function renderBase(source: CanvasImageSource, srcWidth: number, srcHeight: number, rotation: Rotation): HTMLCanvasElement {
  return drawEdited(source, srcWidth, srcHeight, rotation, FULL_CROP, EDITOR_MAX_SIDE);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

// Burns the strokes into the base and encodes a JPEG under ANNOTATION_MAX_BYTES (lowering the quality, then the size, until it fits).
export async function exportAnnotated(base: HTMLCanvasElement, strokes: Stroke[]): Promise<Blob> {
  let smallest: Blob | null = null;
  for (const maxSide of [EDITOR_MAX_SIDE, 1400, 1100]) {
    const scale = Math.min(1, maxSide / Math.max(base.width, base.height));
    const w = Math.max(1, Math.round(base.width * scale));
    const h = Math.max(1, Math.round(base.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Fotoğraf işlenemedi.");
    ctx.drawImage(base, 0, 0, w, h);
    drawStrokes(ctx, strokes, w, h);
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      if (blob.size <= ANNOTATION_MAX_BYTES) return blob;
      if (!smallest || blob.size < smallest.size) smallest = blob;
    }
  }
  if (!smallest) throw new Error("Fotoğraf işlenemedi.");
  return smallest;
}

// <coach>/<student>/<uuid>.jpg -- the coach's own folder first, so Storage RLS can tell whose it is.
export function annotationPath(coachId: string, studentId: string, id: string): string {
  return `${coachId}/${studentId}/${id}.jpg`;
}

export function isAnnotationPathFor(path: string, coachId: string, studentId: string): boolean {
  return path.startsWith(`${coachId}/${studentId}/`) && !path.includes("..") && path.length > coachId.length + studentId.length + 2;
}
