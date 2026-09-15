export type CountFields = {
  total: number | null;
  correct: number | null;
  wrong: number | null;
  empty: number | null;
};

// If exactly 3 of the 4 fields are filled, derives the 4th (total = correct +
// wrong + empty, or the missing addend = total - the other two), clamped to
// >= 0 since a count can't be negative. Returns {} otherwise (0, 2, or 4
// fields filled -- nothing to auto-calculate).
export function autoCalcMissingField(fields: CountFields): Partial<CountFields> {
  const keys: (keyof CountFields)[] = ["total", "correct", "wrong", "empty"];
  const filled = keys.filter((k) => fields[k] !== null);
  if (filled.length !== 3) return {};

  const missing = keys.find((k) => fields[k] === null)!;
  if (missing === "total") {
    return { total: (fields.correct ?? 0) + (fields.wrong ?? 0) + (fields.empty ?? 0) };
  }
  const total = fields.total!;
  if (missing === "correct") return { correct: Math.max(0, total - (fields.wrong ?? 0) - (fields.empty ?? 0)) };
  if (missing === "wrong") return { wrong: Math.max(0, total - (fields.correct ?? 0) - (fields.empty ?? 0)) };
  return { empty: Math.max(0, total - (fields.correct ?? 0) - (fields.wrong ?? 0)) };
}

// True unless all 4 fields are filled AND the equation doesn't hold -- with
// fewer than 4 filled there's nothing to check yet (auto-calc above handles
// exactly-3), so this only ever flags a genuine, fully-entered mismatch.
export function countsAreConsistent(fields: CountFields): boolean {
  const { total, correct, wrong, empty } = fields;
  if (total === null || correct === null || wrong === null || empty === null) return true;
  return total === correct + wrong + empty;
}

export type AutoTaskStatus = "done" | "half_done";

// Tolerance for auto-computed task status (see updateTaskProgress in
// app/student/actions.ts, and the live hint in task-modal.tsx) -- a
// student who's within this many questions of the coach- or self-
// assigned Toplam still counts as fully "Yapıldı"; anything short of that
// defaults to "Yarım Yapıldı". No third automatic bucket: "Yapılmadı"
// stays an explicit, student-initiated signal (the button in
// task-modal.tsx), never auto-assigned by this rule.
export const AUTO_STATUS_TOLERANCE = 5;

// Shared by the server (the actual, authoritative computation in
// updateTaskProgress) and the client (a live preview hint under the count
// fields, computed identically so the hint never disagrees with what
// actually gets saved) -- null when there's no known target to compare
// against (e.g. a task with no Toplam set at all), in which case the
// caller should leave status alone rather than guessing.
export function computeAutoTaskStatus(
  target: number | null,
  correct: number,
  wrong: number,
  empty: number,
): AutoTaskStatus | null {
  if (target === null) return null;
  const solved = correct + wrong + empty;
  return target - solved <= AUTO_STATUS_TOLERANCE ? "done" : "half_done";
}

export type DualPartStatus = "done" | "half_done" | "not_done";

const DUAL_STATUS_RANK: Record<DualPartStatus, number> = { not_done: 0, half_done: 1, done: 2 };

// Combines the two halves of a "dual" task (task-modal.tsx: a video/
// topic-study task that also carries a question-count target) into one
// overall status. Normally the weaker half wins -- a half-finished video
// caps a perfect question score at "Yarım Yapıldı", same as a half-solved
// question set caps a finished video. The one exception is the extreme
// done+not_done pairing: collapsing an actually-finished half all the way
// down to "Yapılmadı" just because the other half was skipped entirely
// would be harsher than either half on its own deserves, so that specific
// pairing lands on "Yarım Yapıldı" instead of the raw minimum.
export function mergeDualTaskStatus(a: DualPartStatus, b: DualPartStatus): DualPartStatus {
  if ((a === "done" && b === "not_done") || (a === "not_done" && b === "done")) return "half_done";
  return DUAL_STATUS_RANK[a] <= DUAL_STATUS_RANK[b] ? a : b;
}
