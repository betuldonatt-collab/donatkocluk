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
