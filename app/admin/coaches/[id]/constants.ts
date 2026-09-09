// Plain module (no "use server") -- a "use server" file may only export
// async functions, so this page-size constant can't live in actions.ts
// alongside getMoreCoachReviews even though it's that action's contract.
export const COACH_REVIEWS_PAGE_SIZE = 20;
