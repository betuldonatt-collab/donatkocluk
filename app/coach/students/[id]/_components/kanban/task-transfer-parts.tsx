import { CalendarClock, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { postponedLabel } from "@/lib/task-transfer";
import type { DetailTask } from "../../types";

// The corner checkbox of a card while "Toplu İşlem" is on. A task that cannot be handed out again (done, or already
// postponed) shows it dimmed and unchecked, so the coach sees why a click does nothing.
export function TaskSelectBox({ checked, disabled }: { checked: boolean; disabled: boolean }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={disabled ? "Aktarılamaz (tamamlanmış ya da ertelenmiş)" : "Aktarmak için seç"}
      className={cn(
        "absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded border-2 bg-background shadow-sm transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
        disabled && "opacity-40",
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

// "Ertelendi → 14 Eki": set on the original once Toplu İşlem handed it out again (migration 0127).
export function PostponedBadge({ task }: { task: Pick<DetailTask, "status" | "postponed_to"> }) {
  const label = postponedLabel(task);
  if (!label) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] leading-snug font-medium text-violet-700 dark:text-violet-300">
      <CalendarClock className="size-3 shrink-0" />
      {label}
    </span>
  );
}
