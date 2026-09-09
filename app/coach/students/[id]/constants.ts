// Plain module (no "use server") -- a "use server" file may only export
// async functions, so this page-size constant can't live in actions.ts
// alongside getMoreStudentNotes even though it's that action's contract.
export const STUDENT_NOTES_PAGE_SIZE = 30;
