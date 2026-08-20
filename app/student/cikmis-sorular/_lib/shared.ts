// Plain module (no "use client") so both the Server Component page and the
// client-side table/chart components can import from it safely.
export const PAST_QUESTION_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

export type PastQuestionMap = Record<string, boolean>; // `${topicId}::${year}` -> solved

export function pastQuestionKey(topicId: string, year: number) {
  return `${topicId}::${year}`;
}
