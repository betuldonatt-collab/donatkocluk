// A student's exit_category (set by admin via setStudentStatus) is
// displayed and analyzed by both the admin assignment table AND the
// coach's own churn/stats page -- a genuinely shared concept, not a
// coach-only or admin-only one, so it lives here rather than in either
// panel's types.ts (a drifted duplicate would risk the two panels
// disagreeing on what a category even means, unlike this app's usual
// per-panel UI duplication where drift is harmless).
export type ExitCategory = "graduated" | "grade_transition" | "financial" | "motivation" | "system";

export const EXIT_CATEGORY_LABELS: Record<ExitCategory, string> = {
  graduated: "Mezun / Hedefe Ulaştı",
  grade_transition: "Üst Sınıfa Geçiş / Yaz Arası",
  financial: "Maddi / Finansal Nedenler",
  motivation: "Motivasyon / Uyum Kaybı",
  system: "Sistem / Platform Kaynaklı",
};
