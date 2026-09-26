// The parent panel's LGS-only additions (Dün/Bugün/Yarın bars, the "Tam
// Program" page) are shown -- and their extra data is fetched -- ONLY for a
// student whose cohort is LGS. Everything (page, layout, sidebar) asks this one
// function, so YKS / 9th-grade / 10th-grade parents keep exactly the panel they
// have today. (The database side is scoped the same way: migration 0100's
// parent read policies only apply to LGS students.)
export function isLgsParentView(examType: string | null | undefined): boolean {
  return examType === "LGS";
}
