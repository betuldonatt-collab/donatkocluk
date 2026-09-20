// Subject-hierarchical pastel color-coding, approved 2026-09-16: each
// curriculum subject family gets one hue, and TYT/AYT/Branş Denemesi
// progress that hue from lightest to deepest via opacity (the same
// theme-safe bg-{hue}-500/N convention already used elsewhere in this
// app), never via a flat/fixed light-mode-only shade. Deliberately
// excludes emerald, amber and rose from every family hue below -- those
// three are reserved for the task-completion status border
// (taskStatusBorderClass), so a subject's background can never collide in
// meaning with the status drawn on top of it.

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

// [TYT, AYT, Branş Denemesi] -- every class string is written out in full
// (never built with string concatenation) so Tailwind's static scanner
// can find it; a dynamically interpolated class name would silently
// produce no CSS.
const FAMILY_CLASSES: Record<SubjectFamily, [string, string, string]> = {
  turkce: ["bg-pink-500/6", "bg-pink-500/12", "bg-pink-500/20"],
  matematik: ["bg-blue-500/6", "bg-blue-500/12", "bg-blue-500/20"],
  geometri: ["bg-sky-500/6", "bg-sky-500/12", "bg-sky-500/20"],
  fizik: ["bg-violet-500/6", "bg-violet-500/12", "bg-violet-500/20"],
  kimya: ["bg-teal-500/6", "bg-teal-500/12", "bg-teal-500/20"],
  biyoloji: ["bg-green-500/6", "bg-green-500/12", "bg-green-500/20"],
  tarih: ["bg-yellow-500/6", "bg-yellow-500/12", "bg-yellow-500/20"],
  cografya: ["bg-orange-500/6", "bg-orange-500/12", "bg-orange-500/20"],
  // Felsefe Grubu: Felsefe + Psikoloji + Sosyoloji + Mantık share this hue
  // (see COURSE_FAMILY below) -- they're taught/tested together in real
  // AYT Sözel curriculum practice and have no TYT sibling of their own.
  felsefe: ["bg-purple-500/6", "bg-purple-500/12", "bg-purple-500/20"],
  din: ["bg-fuchsia-500/6", "bg-fuchsia-500/12", "bg-fuchsia-500/20"],
  // LGS-only families (TYT/AYT split Fen into Fizik/Kimya/Biyoloji and have
  // no English section) -- distinct hues from every family above and from
  // the reserved emerald/amber/rose status colors.
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
export function subjectBackgroundClass(courseId: string | null, taskType: string): string {
  if (taskType === "general_exam") return "bg-indigo-500/20"; // unchanged from before this system
  if (courseId) {
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
