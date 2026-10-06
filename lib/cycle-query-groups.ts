import type { CycleWindow } from "./completion";

// A roster page needs, per student, only the tasks inside THAT student's current cycle window -- not their whole
// history. Windows differ per student, but most share the same one (same lock day, same upcoming session), so the
// students are grouped by identical window: one bounded query per distinct window instead of one per student, and
// never an unbounded read of every task ever assigned.
export type CycleQueryGroup = CycleWindow & { studentIds: string[] };

export function groupStudentsByCycleWindow(studentIds: string[], windowOf: (studentId: string) => CycleWindow): CycleQueryGroup[] {
  const groups = new Map<string, CycleQueryGroup>();
  for (const id of studentIds) {
    const { start, end } = windowOf(id);
    const key = `${start}|${end}`;
    const group = groups.get(key);
    if (group) group.studentIds.push(id);
    else groups.set(key, { start, end, studentIds: [id] });
  }
  return [...groups.values()];
}
