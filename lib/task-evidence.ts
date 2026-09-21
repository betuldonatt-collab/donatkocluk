// Kanıt Fotoğrafı: shared constants and path rules for the photos a student
// attaches to a task (Storage bucket `task_evidence`, migration 0087). Used by
// the upload/remove/view server actions and the browser-side compressor.

export const EVIDENCE_BUCKET = "task_evidence";

// The browser shrinks every photo before upload (lib/image-compress.ts), aiming
// well under EVIDENCE_TARGET_BYTES. EVIDENCE_MAX_BYTES is the server's hard cap:
// it also has to fit inside a Server Action request (1 MB by default), and is
// far below the bucket's own 2 MB backstop.
export const EVIDENCE_TARGET_BYTES = 450 * 1024;
export const EVIDENCE_MAX_BYTES = 900 * 1024;

export const EVIDENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function isEvidenceMimeType(type: string): boolean {
  return (EVIDENCE_MIME_TYPES as readonly string[]).includes(type);
}

// <student_id>/<task_id>/ -- the folder the bucket's RLS policies key on.
export function evidenceFolder(studentId: string, taskId: string): string {
  return `${studentId}/${taskId}/`;
}

export function evidencePath(studentId: string, taskId: string, id: string, mimeType: string): string {
  return `${evidenceFolder(studentId, taskId)}${id}.${EXTENSIONS[mimeType] ?? "jpg"}`;
}

// True when `path` is a file directly inside that student's folder for that task
// (no traversal, no other student's or task's folder).
export function isEvidencePathFor(path: string, studentId: string, taskId: string): boolean {
  const folder = evidenceFolder(studentId, taskId);
  if (!path.startsWith(folder)) return false;
  const name = path.slice(folder.length);
  return name.length > 0 && !name.includes("/") && !name.includes("..");
}

// Size in pixels after scaling (w, h) so the longer side is at most `max`;
// never scales up.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Review state of a task's photos (student_tasks.evidence_review_status, 0088).
export type EvidenceReviewStatus = "none" | "pending" | "approved" | "rejected";

// The approval rule: a task in the coach's approval flow (coach-assigned, or a
// self-created one the coach already approved) that carries photos is not
// completed by the student's say-so. When they mark it done / half done -- or add
// photos to a task already marked so -- it is held for the coach instead. A
// self-created task the coach has not approved yet is already waiting on that
// approval, and an approved review is not asked twice.
export function shouldHoldForEvidenceReview(input: {
  inApprovalFlow: boolean;
  photoCount: number;
  status: string;
  reviewStatus: string;
}): boolean {
  return (
    input.inApprovalFlow &&
    input.photoCount > 0 &&
    (input.status === "done" || input.status === "half_done") &&
    input.reviewStatus !== "approved"
  );
}
