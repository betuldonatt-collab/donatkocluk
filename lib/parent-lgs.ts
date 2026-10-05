// The parent panel's LGS-only additions (Dün/Bugün/Yarın bars, the "Tam
// Program" page) are shown -- and their extra data is fetched -- ONLY for a
// student whose cohort is LGS. Everything (page, layout, sidebar) asks this one
// function, so YKS / 9th-grade / 10th-grade parents keep exactly the panel they
// have today. (The database side is scoped the same way: migration 0100's
// parent read policies only apply to LGS students -- and, since migration 0124, to 7th graders.)
//
// A 7th grader (profiles.is_maarif7, exam_type 'YKS') follows the LGS photo / approval workflow, so their parent
// gets the same view: pass `isMaarif7` alongside the exam type.
export function isLgsParentView(examType: string | null | undefined, isMaarif7: boolean | null | undefined = false): boolean {
  return examType === "LGS" || isMaarif7 === true;
}
