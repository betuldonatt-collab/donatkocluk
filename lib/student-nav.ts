// Which left-menu items a student sees, as one pure rule shared by the sidebar and
// the guided tour (so the two lists can never disagree).
//
//  - Çıkmış Sorular (the YKS past-questions page) is hidden for any Maarif grade
//    (9th/10th/11th).
//  - İngilizce Quiz is LGS-only.
//  - Yazılılar (school exams) is for every student with a school grade -- LGS,
//    9th-12th, and anyone below -- and is hidden for graduates (Mezun,
//    profiles.is_graduate), who take no school exams.

export const YAZILILAR_HREF = "/student/yazililar";

const MAARIF_HIDDEN_HREFS = new Set(["/student/cikmis-sorular"]);
const LGS_ONLY_HREFS = new Set(["/student/ingilizce-quiz"]);
const NOT_FOR_GRADUATES_HREFS = new Set([YAZILILAR_HREF]);

export type StudentNavContext = {
  examType: "YKS" | "LGS";
  // Any Maarif grade (9th/10th/11th).
  isMaarif: boolean;
  isGraduate: boolean;
};

export function isStudentNavItemVisible(href: string, ctx: StudentNavContext): boolean {
  if (ctx.isMaarif && MAARIF_HIDDEN_HREFS.has(href)) return false;
  if (ctx.examType !== "LGS" && LGS_ONLY_HREFS.has(href)) return false;
  if (ctx.isGraduate && NOT_FOR_GRADUATES_HREFS.has(href)) return false;
  return true;
}

// Whether a student may open the Yazılılar page itself (the page checks this too, so
// typing the address does not get a graduate in).
export function canAccessYazililar(student: { isGraduate: boolean }): boolean {
  return !student.isGraduate;
}
