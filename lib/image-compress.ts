import { EVIDENCE_TARGET_BYTES, fitWithin } from "./task-evidence";

// Browser-side photo compression for the Kanıt Fotoğrafı upload: a phone photo is
// 3-8 MB, which would fill the storage quota after a few dozen uploads. The
// image is decoded (EXIF rotation applied), scaled so its longer side is at most
// 1600 px -- plenty to read a solved test page -- and re-encoded as JPEG, lowering
// the quality (then the size) until it is under the target. Client-only.

const MAX_SIDE_STEPS = [1600, 1280, 1024];
const QUALITY_STEPS = [0.75, 0.65, 0.55, 0.45];

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the EXIF orientation, so a portrait phone photo is not sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to the <img> decoder.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Resolves to a JPEG File no larger than `targetBytes` when that is achievable;
// otherwise the smallest attempt (the server still enforces its own hard cap).
export async function compressImage(file: File, targetBytes: number = EVIDENCE_TARGET_BYTES): Promise<File> {
  const decoded = await decode(file);
  try {
    let smallest: Blob | null = null;
    for (const maxSide of MAX_SIDE_STEPS) {
      const { width, height } = fitWithin(decoded.width, decoded.height, maxSide);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Fotoğraf işlenemedi.");
      // JPEG has no alpha: paint white first so a transparent PNG doesn't turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, quality);
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= targetBytes) return new File([blob], "kanit.jpg", { type: "image/jpeg" });
      }
    }
    if (!smallest) throw new Error("Fotoğraf işlenemedi.");
    return new File([smallest], "kanit.jpg", { type: "image/jpeg" });
  } finally {
    decoded.close();
  }
}
