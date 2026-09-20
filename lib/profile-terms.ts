import type { ExamType } from "./exam-type";

// The two "target" labels on a student's profile differ by cohort: YKS
// students aim at a university + department, LGS students at a high school
// + a percentile (yüzdelik dilim). The underlying columns are separate
// (target_university / target_department vs target_high_school /
// target_percentile), so an LGS student's YKS-shaped fields are never
// reused or overwritten -- only the labels and which fields render change.
export const PROFILE_TERMS: Record<ExamType, { targetOne: string; targetTwo: string; grade: string }> = {
  YKS: { targetOne: "Hedef Üniversite", targetTwo: "Hedef Bölüm", grade: "OBP" },
  LGS: { targetOne: "Hedef Lise", targetTwo: "Hedef Yüzdelik Dilim", grade: "Karne Ortalaması" },
};

// 1.5 -> "%1,5" (tr-TR decimal comma); null/undefined -> "—".
export function formatPercentile(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `%${Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
}
