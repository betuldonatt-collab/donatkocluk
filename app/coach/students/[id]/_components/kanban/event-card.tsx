"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Copy, GripVertical, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { cn } from "@/lib/utils";
import { STUDENT_EVENT_TYPE_LABELS, type StudentEventType } from "@/lib/student-events";
import type { StudentEvent } from "../../../../actions";

// Meeting gets a solid, high-contrast highlight -- the coach needs to see
// the exact cutoff time at a glance and plot tasks around it. Everything
// else is a light, neutral tint that stays out of the way.
export const EVENT_TYPE_CLASSES: Record<StudentEventType, string> = {
  meeting: "bg-violet-600 border-violet-700 text-white",
  school: "bg-gray-100 border-gray-300 text-gray-600",
  sports: "bg-teal-50 border-teal-200 text-teal-800",
  personal: "bg-blue-50 border-blue-200 text-blue-800",
  other: "bg-slate-100 border-slate-300 text-slate-600",
};

// event.id -> a dnd-kit drag id distinct from a task's bare uuid, so
// schedule-board.tsx's single shared handleDragEnd can tell "an event was
// dragged" from "a task was dragged" just by looking at active.id -- events
// and tasks are different tables with independently-generated uuids, so
// without a prefix there'd be no structural way to know which array to look
// the dragged id up in. Both now live in the SAME SortableContext per day
// (see schedule-board.tsx), interleaved by a shared order_index sequence.
export const EVENT_DRAG_PREFIX = "event:";
export function eventDragId(id: string): string {
  return `${EVENT_DRAG_PREFIX}${id}`;
}
export function isEventDragId(id: string): boolean {
  return id.startsWith(EVENT_DRAG_PREFIX);
}
export function eventIdFromDragId(id: string): string {
  return id.slice(EVENT_DRAG_PREFIX.length);
}

// Presentational only -- no drag wiring, so this is safe to re-render a
// second time inside DragOverlay (see schedule-board.tsx) without
// double-registering a second useSortable for the same id. The heading is
// the event_type label itself -- there is no separate title field to show
// (see event-dialog.tsx); the description, if any, carries whatever custom
// text the coach wrote. Both lines truncate to one line each -- events now
// share the same per-row grid as tasks (see EventCard below), so their
// content needs to fit whatever height that row was dragged to just like
// a task card's does.
export function EventCardBody({ event }: { event: StudentEvent }) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-semibold">{STUDENT_EVENT_TYPE_LABELS[event.event_type]}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums opacity-90">
          <Clock className="size-2.5" />
          {event.start_time.slice(0, 5)}
        </span>
      </div>
      <span className="block truncate text-[10px] opacity-80">
        {event.start_time.slice(0, 5)}–{event.end_time.slice(0, 5)}
      </span>
      {event.description?.trim() && (
        <span className="mt-0.5 line-clamp-3 block text-[10px] leading-snug break-words whitespace-pre-wrap opacity-80">
          {event.description.trim()}
        </span>
      )}
    </div>
  );
}

// Movable time block -- sortable right alongside tasks in the same day
// list (grip handle + useSortable, same as KanbanTaskCard) so it can be
// dragged between days AND interleaved at a specific position (Task 1 ->
// Okul -> Task 2). Never gradeable though: no status checkbox, no D/Y/B
// stats (see student_events / 0066_student_events.sql,
// 0067_student_events_order_index.sql). Shares the Görevler lane's
// per-row height grid with KanbanTaskCard (see schedule-board.tsx's
// taskRowHeights) -- whichever row index this event lands at, dragging
// its own resize handle adjusts that row for every day's item at the
// same index, tasks included.
export function EventCard({
  event,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleLock,
  height,
  onResize,
  onResizeEnd,
}: {
  event: StudentEvent;
  onEdit: (event: StudentEvent) => void;
  onDuplicate: (event: StudentEvent) => void;
  onDelete: (event: StudentEvent) => void;
  onToggleLock: (event: StudentEvent) => void;
  height: number;
  onResize: (deltaY: number) => void;
  onResizeEnd: () => void;
}) {
  // Same disabled-via-lock treatment as KanbanTaskCard -- see its own
  // comment for why this is enough on its own, no reorder-math changes.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: eventDragId(event.id),
    disabled: event.is_locked,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, height };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex flex-col gap-1 overflow-hidden rounded-md border px-2 py-1.5 text-xs",
        EVENT_TYPE_CLASSES[event.event_type],
      )}
    >
      <div className="flex min-h-0 flex-1 items-start gap-1 overflow-hidden">
        <button
          type="button"
          className={cn(
            "mt-0.5 shrink-0 touch-none rounded p-0.5 opacity-70",
            event.is_locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
          )}
          aria-label={event.is_locked ? "Kilitli -- taşınamaz" : "Sürükleyerek taşı"}
          {...attributes}
          {...listeners}
        >
          {event.is_locked ? <Lock className="size-3.5" /> : <GripVertical className="size-3.5" />}
        </button>
        <EventCardBody event={event} />
      </div>

      <div className="mt-auto flex shrink-0 justify-end gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 opacity-70 hover:opacity-100"
          onClick={() => onToggleLock(event)}
          aria-label={event.is_locked ? "Kilidi Aç" : "Kilitle"}
          title={event.is_locked ? "Kilidi Aç" : "Kilitle"}
        >
          {event.is_locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 opacity-70 hover:opacity-100"
          onClick={() => onDuplicate(event)}
          aria-label="Kopyala"
        >
          <Copy className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 opacity-70 hover:opacity-100"
          onClick={() => onEdit(event)}
          aria-label="Düzenle"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 opacity-70 hover:text-destructive hover:opacity-100"
          onClick={() => onDelete(event)}
          aria-label="Sil"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      <ResizeHandle onResize={onResize} onResizeEnd={onResizeEnd} label="Bu satırın yüksekliğini ayarla" />
    </div>
  );
}
