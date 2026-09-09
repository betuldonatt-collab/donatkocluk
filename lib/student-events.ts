// Shared with both app/coach/actions.ts (a "use server" file, which can
// only export async functions -- a plain object export breaks the whole
// module at runtime) and client components (event-card.tsx,
// event-dialog.tsx). Single source of truth for a time block's display
// title: the coach never types one (see event-dialog.tsx); a
// student_events row's `title` column is always just this label for its
// event_type, computed server-side on every create/update so it can't
// drift from what the UI shows.
export type StudentEventType = "meeting" | "school" | "sports" | "personal" | "other";

export const STUDENT_EVENT_TYPE_LABELS: Record<StudentEventType, string> = {
  meeting: "Koç Görüşmesi",
  school: "Okul",
  sports: "Spor",
  personal: "Kişisel",
  other: "Diğer",
};
