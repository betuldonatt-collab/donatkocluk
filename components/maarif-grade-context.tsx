"use client";

import { createContext, useContext } from "react";

import type { MaarifGrade } from "@/lib/maarif-grade";

// The Maarif grade (9 or 10) of the student whose panel/page is being
// rendered, or null for an ordinary YKS/LGS student. Provided once near the
// top of the coach student pages and the student layout so deeply nested
// client forms can read it without threading a prop beside `examType`
// through a dozen components. Defaults to null, so anything rendered outside
// a provider (and every existing student) behaves exactly as before.
const MaarifGradeContext = createContext<MaarifGrade | null>(null);

export function MaarifGradeProvider({ value, children }: { value: MaarifGrade | null; children: React.ReactNode }) {
  return <MaarifGradeContext.Provider value={value}>{children}</MaarifGradeContext.Provider>;
}

export function useMaarifGrade(): MaarifGrade | null {
  return useContext(MaarifGradeContext);
}
