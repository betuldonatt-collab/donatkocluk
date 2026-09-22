import { cn } from "@/lib/utils";

// The description (açıklama) a coach wrote for a task, shown right under its
// title: small, muted, and with the coach's own line breaks kept exactly as typed
// (whitespace-pre-wrap). Long text is clamped to a few lines on cards
// (`lines`); pass "all" where there is room to show it in full (hover detail).
// Renders nothing when there is no description, so cards without one look
// exactly as before.
const LINE_CLAMP = { 2: "line-clamp-2", 3: "line-clamp-3", all: "" } as const;

export function TaskDescription({
  text,
  lines = 3,
  className,
}: {
  text: string | null | undefined;
  lines?: keyof typeof LINE_CLAMP;
  className?: string;
}) {
  const value = text?.trim();
  if (!value) return null;
  return (
    <p className={cn("text-muted-foreground text-xs leading-snug break-words whitespace-pre-wrap", LINE_CLAMP[lines], className)}>
      {value}
    </p>
  );
}
