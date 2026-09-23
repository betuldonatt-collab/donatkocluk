// Subject-hierarchical pastel color-coding. YKS families (turkce through
// din below) were revised 2026-09-23: a custom "pure hue" per subject,
// hand-spaced evenly around the hue wheel (Tailwind's own named hues
// cluster unevenly in the blue/violet/purple range, which is what made
// Kimya/Biyoloji and Fizik/Felsefe hard to tell apart under the original
// bg-{hue}-500/N system). Each pure hue lives as ONE CSS custom property
// in app/globals.css (--subject-{family}), and TYT/AYT/Branş Denemesi
// below apply /6, /12, /20 opacity on top of it -- same percentages, same
// "transparent wash over the surface" mechanism the original all-Tailwind
// system used, which is also what keeps this theme-safe in both light and
// dark mode with a single value (no light/dark pair needed). An earlier
// version of this revision used solid pre-lightened fills per tier
// instead; even at "pastel" lightness values those read as far more
// present/heavy than the old wash ever did, so this went back to opacity.
//
// Fen and İngilizce (LGS-only) are still on the original Tailwind
// bg-{hue}-500/N opacity system, not yet revised -- a separate pass.
//
// Deliberately excludes emerald, amber and rose from every family/general
// hue below -- those three are reserved for the task-completion status
// border (taskStatusBorderClass), so a subject's background can never
// collide in meaning with the status drawn on top of it.

export type SubjectFamily =
  | "turkce"
  | "matematik"
  | "geometri"
  | "fizik"
  | "kimya"
  | "biyoloji"
  | "tarih"
  | "cografya"
  | "felsefe"
  | "din"
  | "fen"
  | "ingilizce";

// [TYT, AYT, Branş Denemesi] -- the YKS families apply /6, /12, /20
// opacity on top of the custom pure-hue tokens in app/globals.css via
// Tailwind's arbitrary-value syntax (bg-[var(--subject-...)]/N); Fen/
// İngilizce are still plain bg-{hue}-500/N Tailwind utilities (unrevised).
// Every class string is written out in full (never built with string
// concatenation) so Tailwind's static scanner can find it -- a
// dynamically interpolated class name would silently produce no CSS.
const FAMILY_CLASSES: Record<SubjectFamily, [string, string, string]> = {
  turkce: ["bg-[var(--subject-turkce)]/6", "bg-[var(--subject-turkce)]/12", "bg-[var(--subject-turkce)]/20"],
  matematik: [
    "bg-[var(--subject-matematik)]/6",
    "bg-[var(--subject-matematik)]/12",
    "bg-[var(--subject-matematik)]/20",
  ],
  geometri: ["bg-[var(--subject-geometri)]/6", "bg-[var(--subject-geometri)]/12", "bg-[var(--subject-geometri)]/20"],
  fizik: ["bg-[var(--subject-fizik)]/6", "bg-[var(--subject-fizik)]/12", "bg-[var(--subject-fizik)]/20"],
  kimya: ["bg-[var(--subject-kimya)]/6", "bg-[var(--subject-kimya)]/12", "bg-[var(--subject-kimya)]/20"],
  biyoloji: ["bg-[var(--subject-biyoloji)]/6", "bg-[var(--subject-biyoloji)]/12", "bg-[var(--subject-biyoloji)]/20"],
  tarih: ["bg-[var(--subject-tarih)]/6", "bg-[var(--subject-tarih)]/12", "bg-[var(--subject-tarih)]/20"],
  cografya: ["bg-[var(--subject-cografya)]/6", "bg-[var(--subject-cografya)]/12", "bg-[var(--subject-cografya)]/20"],
  // Felsefe Grubu: Felsefe + Psikoloji + Sosyoloji + Mantık share this hue
  // (see COURSE_FAMILY below) -- they're taught/tested together in real
  // AYT Sözel curriculum practice and have no TYT sibling of their own.
  felsefe: ["bg-[var(--subject-felsefe)]/6", "bg-[var(--subject-felsefe)]/12", "bg-[var(--subject-felsefe)]/20"],
  din: ["bg-[var(--subject-din)]/6", "bg-[var(--subject-din)]/12", "bg-[var(--subject-din)]/20"],
  // LGS-only families (TYT/AYT split Fen into Fizik/Kimya/Biyoloji and have
  // no English section) -- distinct hues from every family above and from
  // the reserved emerald/amber/rose status colors. Not yet revised to the
  // custom-pastel system above.
  fen: ["bg-cyan-500/6", "bg-cyan-500/12", "bg-cyan-500/20"],
  ingilizce: ["bg-lime-500/6", "bg-lime-500/12", "bg-lime-500/20"],
};

// Atomic TYT/AYT curriculum course id -> family. Every id here is read
// straight off lib/curriculum's tyt.json/ayt-*.json course lists.
const COURSE_FAMILY: Record<string, SubjectFamily> = {
  "tyt-turkce": "turkce",
  "tyt-matematik": "matematik",
  "tyt-geometri": "geometri",
  "tyt-fizik": "fizik",
  "tyt-kimya": "kimya",
  "tyt-biyoloji": "biyoloji",
  "tyt-tarih": "tarih",
  "tyt-cografya": "cografya",
  "tyt-felsefe": "felsefe",
  "tyt-din": "din",
  "ayt-matematik-sayisal": "matematik",
  "ayt-geometri-sayisal": "geometri",
  "ayt-fizik": "fizik",
  "ayt-kimya": "kimya",
  "ayt-biyoloji": "biyoloji",
  "ayt-edebiyat-ea": "turkce",
  "ayt-tarih-1-ea": "tarih",
  "ayt-cografya-1-ea": "cografya",
  "ayt-matematik-ea": "matematik",
  "ayt-geometri-ea": "geometri",
  "ayt-edebiyat-sozel": "turkce",
  "ayt-tarih-1-sozel": "tarih",
  "ayt-cografya-1-sozel": "cografya",
  "ayt-tarih-2": "tarih",
  "ayt-cografya-2": "cografya",
  "ayt-felsefe": "felsefe",
  "ayt-psikoloji": "felsefe",
  "ayt-sosyoloji": "felsefe",
  "ayt-mantik": "felsefe",
  "ayt-din-kulturu-ve-ahlak-bilgisi": "din",
  "lgs-turkce": "turkce",
  "lgs-matematik": "matematik",
  "lgs-fen-bilimleri": "fen",
  "lgs-inkilap-tarihi": "tarih",
  "lgs-din-kulturu": "din",
  "lgs-ingilizce": "ingilizce",
};

// Branch-exam "macro" course ids (lib/curriculum's BRANCH_EXAM_MACRO_COURSES)
// span more than one family at once, so each macro group gets its own
// dedicated hue rather than borrowing a single constituent's -- except the
// Matematik macro, which only ever combines Matematik + Geometri and reuses
// Matematik's own hue at the Branş tier. Always the deepest tier: a macro
// course only ever appears as a branch_exam task.
const MACRO_CLASSES: Record<string, string> = {
  "tyt-sosyal-macro": "bg-red-500/20",
  "ayt-sos1-ea-macro": "bg-red-500/20",
  "ayt-sos1-sozel-macro": "bg-red-500/20",
  "ayt-sos2-sozel-macro": "bg-red-500/20",
  "tyt-fen-macro": "bg-cyan-500/20",
  "ayt-fen-sayisal-macro": "bg-cyan-500/20",
  "tyt-matematik-macro": "bg-blue-500/20",
  "ayt-matematik-sayisal-macro": "bg-blue-500/20",
  "ayt-matematik-ea-macro": "bg-blue-500/20",
};

// Background tint for a task's subject -- shared data behind the coach
// kanban's cardBackgroundClass and the student board's subjectTintClass
// (each panel keeps its own function name/call site, per this repo's
// per-panel UI-duplication convention; only the color data itself is
// shared here, since it's pure lookup with nothing panel-specific in it).
// Routines that get a look of their own (instead of the neutral routine grey)
// so they're recognisable at a glance in the Rutinler lane. Yeni Nesil Mat
// Dozu is violet -- a hue LGS has no subject family in (Fizik, the only
// violet family, is YKS-only) -- and stronger than a subject tint.
const ROUTINE_CLASSES: Record<string, string> = {
  "yeni-nesil-mat-dozu": "bg-violet-500/25",
};

export function subjectBackgroundClass(courseId: string | null, taskType: string): string {
  // Standalone punchy color, not part of the TYT/AYT/Branş tier system --
  // Genel Deneme is a milestone, meant to stand out rather than blend
  // into the subject palette.
  if (taskType === "general_exam") return "bg-[var(--subject-genel-deneme)]";
  if (courseId) {
    const routineClass = ROUTINE_CLASSES[courseId];
    if (routineClass) return routineClass;
    const macroClass = MACRO_CLASSES[courseId];
    if (macroClass) return macroClass;
    const family = COURSE_FAMILY[courseId];
    if (family) {
      const [tyt, ayt, branch] = FAMILY_CLASSES[family];
      if (taskType === "branch_exam") return branch;
      return courseId.startsWith("ayt-") ? ayt : tyt;
    }
  }
  // Paragraf/Problem routines, extra_custom, or no course set at all.
  return "bg-slate-500/10";
}

// Task-completion status as a thick, full-saturation border -- replaces
// every prior thin left-border-only or background-fill treatment of the
// same three statuses. Full border on all sides (not border-l-*), so it
// reads clearly against the pastel subject background above.
export function taskStatusBorderClass(status: string, completed: boolean): string {
  const isDone = status === "done" || completed;
  if (isDone) return "border-[3px] border-emerald-500";
  if (status === "half_done") return "border-[3px] border-amber-500";
  if (status === "not_done") return "border-[3px] border-rose-500";
  return "";
}
