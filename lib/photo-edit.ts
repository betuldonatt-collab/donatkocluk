// The geometry (and the canvas drawing) behind the photo editor of the evidence flow: rotate a photo in 90-degree steps and crop it with a
// draggable rectangle. A crop is stored NORMALIZED (0..1) over the already-rotated image, so it is independent of the screen size the
// editor happens to show it at -- the same rectangle applies to the preview and to the full-resolution result.

export type Rotation = 0 | 90 | 180 | 270;
export type CropRect = { x: number; y: number; w: number; h: number };
export type CropHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

// The smallest crop side, as a fraction of the image: a handle can never collapse the rectangle to nothing.
export const MIN_CROP = 0.08;

export function rotateBy(rotation: Rotation, deltaDegrees: 90 | -90): Rotation {
  return ((((rotation + deltaDegrees) % 360) + 360) % 360) as Rotation;
}

// Size of an image after it is rotated.
export function rotatedSize(width: number, height: number, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// Moves a handle of the crop rectangle by (dx, dy), both normalized to the image's size. "move" shifts the whole rectangle (kept inside the
// image); an edge or corner resizes it from that side, never past the image border and never below MIN_CROP.
export function dragCrop(crop: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  if (handle === "move") {
    return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.w), y: clamp(crop.y + dy, 0, 1 - crop.h) };
  }
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.w;
  let bottom = crop.y + crop.h;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_CROP, 1);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_CROP, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function isFullCrop(crop: CropRect): boolean {
  return crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.998 && crop.h >= 0.998;
}

// The crop in pixels of an image `width` x `height` (already rotated): whole pixels, at least 1, inside the image.
export function cropToPixels(crop: CropRect, width: number, height: number): { sx: number; sy: number; sw: number; sh: number } {
  const sx = clamp(Math.round(crop.x * width), 0, Math.max(0, width - 1));
  const sy = clamp(Math.round(crop.y * height), 0, Math.max(0, height - 1));
  const sw = clamp(Math.round(crop.w * width), 1, width - sx);
  const sh = clamp(Math.round(crop.h * height), 1, height - sy);
  return { sx, sy, sw, sh };
}

// Rotates `source` (srcWidth x srcHeight) and crops it. `maxSide` caps the working size so a 12-megapixel photo does not need two
// full-size canvases on a phone (the evidence upload shrinks the result to 1600 px anyway); the crop applies to the rotated image.
export function drawEdited(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  rotation: Rotation,
  crop: CropRect,
  maxSide = 2600,
): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(srcWidth, srcHeight));
  const w = Math.max(1, Math.round(srcWidth * scale));
  const h = Math.max(1, Math.round(srcHeight * scale));
  const rotated = rotatedSize(w, h, rotation);

  const full = document.createElement("canvas");
  full.width = rotated.width;
  full.height = rotated.height;
  const ctx = full.getContext("2d");
  if (!ctx) throw new Error("Fotoğraf işlenemedi.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, full.width, full.height);
  ctx.translate(full.width / 2, full.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);

  if (isFullCrop(crop)) return full;
  const { sx, sy, sw, sh } = cropToPixels(crop, full.width, full.height);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Fotoğraf işlenemedi.");
  outCtx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}
