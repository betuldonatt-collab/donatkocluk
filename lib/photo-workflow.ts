// Who goes through the Kanıt Fotoğrafı / coach-approval workflow when completing a task: every task except Kitap
// Okuma (its page range is the proof) and İngilizce Kelime Quizi needs at least one evidence photo (and, for the
// result-bearing types, its Doğru/Yanlış/Boş), and the task is completed only once the coach approves it
// (lib/lgs-completion.ts holds the rules, migrations 0087-0109 the database side).
//
// That is the LGS cohort -- and the 7th grade, which mirrors LGS here (migration 0123): a 7th grader is a 'YKS'
// exam_type row with profiles.is_maarif7, so the cohort cannot be read off exam_type alone. YKS and the 9th /
// 10th / 11th grades complete immediately, as before.
export function usesPhotoWorkflow(student: { examType: string | null | undefined; maarifGrade: number | null | undefined }): boolean {
  return student.examType === "LGS" || student.maarifGrade === 7;
}
