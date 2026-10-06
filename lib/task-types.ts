// "Kaynak Taraması" (task_type "resource_review"): going back over questions the student got wrong, left blank or
// struggled with. It is NOT a routine; it is a Soru Çözümü in everything but its name -- a course and a topic, a time
// target and / or a question-count target, Doğru / Yanlış / Boş results, the same validation, the same Kanıt Fotoğrafı /
// approval rules for LGS and 7th grade, and its results flow into the same places (topic stats / Soru Dağılımı,
// daily stats, the Karne). Everything that treats a task as a Soru Çözümü asks isSoruCozumuLike instead of comparing
// with "question_bank", so the two can never drift apart.
export const RESOURCE_REVIEW_TASK_TYPE = "resource_review";
export const RESOURCE_REVIEW_LABEL = "Kaynak Taraması";

export function isSoruCozumuLike(taskType: string | null | undefined): boolean {
  return taskType === "question_bank" || taskType === RESOURCE_REVIEW_TASK_TYPE;
}
