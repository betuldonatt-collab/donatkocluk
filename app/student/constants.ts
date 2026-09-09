// Plain module (no "use server") -- a "use server" file may only export
// async functions, so this page-size constant can't live in actions.ts
// alongside getMoreBransExams/getMoreGenelExams even though it's their
// contract.
export const EXAMS_PAGE_SIZE = 20;
