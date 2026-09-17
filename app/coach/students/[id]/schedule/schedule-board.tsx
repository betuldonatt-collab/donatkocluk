"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Lock, LockOpen, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isRoutineCourseId } from "@/lib/curriculum";
import { sumTaskCounts } from "@/lib/scoring";
import { updateScheduleRoutineRowHeights, updateScheduleTaskRowHeights } from "@/lib/schedule-row-heights";
import { useRowHeights, type RowHeights } from "@/lib/use-row-heights";
import {
  createStudentEvent,
  deleteAssignedTask,
  deleteStudentEvent,
  duplicateAssignedTask,
  getPastWeeksForStudent,
  getStudentEventsForWeek,
  getStudentTasksForWeek,
  isWeekLocked,
  lockWeek,
  moveAssignedTask,
  setEventLocked,
  setTaskLocked,
  unlockWeek,
  updateAssignedTaskOrder,
  updateAssignedTaskStatus,
  updateStudentEvent,
  updateStudentEventOrder,
  type AssignedTaskStatus,
  type StudentEvent,
} from "../../../actions";
import type { DetailTask } from "../types";
import type { CourseResourceData } from "../_components/kaynak-takibi-tab";
import { EventCard, EventCardBody, EVENT_TYPE_CLASSES, eventDragId, isEventDragId, eventIdFromDragId } from "../_components/kanban/event-card";
import { EventDialog, type EventDialogState } from "../_components/kanban/event-dialog";
import { KanbanTaskCard } from "../_components/kanban/kanban-task-card";
import { RoutineTaskCard } from "../_components/kanban/routine-task-card";
import {
  cardBackgroundClass,
  DEFAULT_CARD_HEIGHT_PX,
  MIN_CARD_HEIGHT_PX,
  statusClasses,
  TaskCardBody,
} from "../_components/kanban/task-card-body";
import { TaskDrawer, type TaskDrawerState } from "../_components/kanban/task-drawer";

const DAY_PREFIX = "day:";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A rolling 7-day window starting EXACTLY at referenceIso -- deliberately
// not Monday-aligned (see lib/date.ts's mondayOf/weekDates, which stay
// reserved for the true Mon-Sun cycles used elsewhere in this app, e.g.
// Karne). This lets a coach run a "Wednesday to next Wednesday" program:
// Next/Prev shift the window by exactly one day (see the nav buttons
// below), so any 7-day span is reachable without ever snapping back to a
// calendar-week boundary. Each date's own day-of-week decides its label,
// not its position in the array.
function getWeekDays(referenceIso: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(referenceIso, i);
    const d = new Date(`${date}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    return { date, label: `${DAY_LABELS[dow]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

// "Hızlı İşaretleme" (Paintbrush) toolbar options -- see the paintMode
// state and its toggle buttons in ScheduleBoard.
const PAINT_MODES: { value: AssignedTaskStatus; label: string; emoji: string; activeClass: string }[] = [
  { value: "done", label: "Yapıldı Olarak İşaretle", emoji: "✅", activeClass: "bg-emerald-500 text-white border-emerald-500" },
  { value: "half_done", label: "Yarım Olarak İşaretle", emoji: "⏳", activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "not_done", label: "Yapılmadı Olarak İşaretle", emoji: "❌", activeClass: "bg-rose-500 text-white border-rose-500" },
];

function drawerKey(state: TaskDrawerState | null): string {
  if (!state) return "closed";
  if (state.mode === "create") return `create:${state.date}`;
  if (state.mode === "create-multi") return `create-multi:${state.initialTab ?? "task"}:${state.initialDate ?? ""}`;
  return `edit:${state.task.id}`;
}

// Full-width, calendar-style scheduling workspace -- a rolling 7-day
// window (see getWeekDays; NOT locked to Monday-Sunday, so a coach can run
// a "Wednesday to next Wednesday" program), drag-and-drop across days
// (student_tasks + student_events, mirroring the coach dashboard's own
// daily checklist dnd-kit pattern). Each day column is split into a
// Rutinler zone on top (Paragraf/Problem, routed there purely by
// course_id -- see isRoutineCourseId) and, below it, one combined
// tasks-and-time-blocks list -- the two types interleave freely (Task 1 ->
// Okul -> Task 2) in a single order_index sequence split across two
// tables at persist time (see combinedItemIdsForDay/applyCombinedOrder).
// Task creation/editing happens in a slide-over drawer, never a blocking
// modal; a time block uses its own small Dialog (event-dialog.tsx).
export function ScheduleBoard({
  studentId,
  initialWeekDays,
  initialTasks,
  initialEvents,
  courseResourceData: initialCourseResourceData,
  highlightTaskId,
  initialRoutineRowHeights,
  initialTaskRowHeights,
}: {
  studentId: string;
  initialWeekDays: { date: string; label: string }[];
  initialTasks: DetailTask[];
  initialEvents: StudentEvent[];
  courseResourceData: CourseResourceData;
  // Deep-link from a dashboard alert (e.g. "Eksik Deneme Sonucu") -- the
  // matching task's edit drawer auto-opens once below, so the coach lands
  // straight on the specific exam that's missing a result instead of the
  // student's general profile.
  highlightTaskId?: string | null;
  // The coach's own profiles.schedule_routine_row_heights_px /
  // schedule_task_row_heights_px, fetched server-side by schedule/page.tsx
  // so the very first render already matches their last drag, with no
  // flash of the wrong heights while a client fetch resolves.
  initialRoutineRowHeights: number[];
  initialTaskRowHeights: number[];
}) {
  const today = todayISO();
  const [weekDays, setWeekDays] = useState(initialWeekDays);
  const [tasks, setTasks] = useState(initialTasks);
  const [events, setEvents] = useState(initialEvents);
  const [eventDialogState, setEventDialogState] = useState<EventDialogState | null>(null);
  // Stateful (not just the initial prop) so a resource created inline
  // from the drawer's "type new" flow (see handleResourceCreated) is
  // immediately resolvable by name on the card that references it,
  // without waiting for a full page reload.
  const [courseResourceData, setCourseResourceData] = useState(initialCourseResourceData);
  const [loading, setLoading] = useState(false);
  const [drawerState, setDrawerState] = useState<TaskDrawerState | null>(() => {
    const target = highlightTaskId ? initialTasks.find((t) => t.id === highlightTaskId) : null;
    return target ? { mode: "edit", task: target } : null;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId && !isEventDragId(activeId) ? (tasks.find((t) => t.id === activeId) ?? null) : null;
  const activeEvent = activeId && isEventDragId(activeId) ? (events.find((e) => e.id === eventIdFromDragId(activeId)) ?? null) : null;
  // Which day column to highlight as the current drop target, resolved
  // centrally (via containerOf, below) from whatever dnd-kit currently
  // considers the closest droppable -- deliberately NOT each DayColumn's
  // own useDroppable({ isOver }), since that flips to an individual card's
  // own nested sortable rect (see the SortableContext comment on
  // DayColumn) the instant the pointer is over an existing card rather
  // than empty space, making a per-column isOver flicker on and off while
  // dragging down a populated day instead of staying lit for the whole
  // column the way a coach actually needs to see it.
  const [overDay, setOverDay] = useState<string | null>(null);
  const [weekLocked, setWeekLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  // Independent per-row height for each lane -- a strict, Excel-like grid
  // across the WHOLE board: dragging any card's or event's resize handle
  // only ever adjusts the row it's actually in (shared across all 7 days
  // at that index), leaving every other row untouched, in both the
  // Rutinler lane and the Görevler lane. The two lanes are entirely
  // independent row-index spaces from each other. See useRowHeights for
  // the shared drag/persist mechanics.
  const routineRows = useRowHeights(
    initialRoutineRowHeights,
    MIN_CARD_HEIGHT_PX,
    DEFAULT_CARD_HEIGHT_PX,
    updateScheduleRoutineRowHeights,
    (message) => toast.error(message),
  );
  const taskRows = useRowHeights(
    initialTaskRowHeights,
    MIN_CARD_HEIGHT_PX,
    DEFAULT_CARD_HEIGHT_PX,
    updateScheduleTaskRowHeights,
    (message) => toast.error(message),
  );

  // "Hızlı İşaretleme" (Paintbrush) mode -- while set, clicking any task
  // card on the board marks it with this status instead of opening the
  // edit drawer (see handleStatusChange below and the card components'
  // own paintMode prop). Coach-only by design: the student board has no
  // equivalent, since there's nothing bulky to replace there.
  const [paintMode, setPaintMode] = useState<AssignedTaskStatus | null>(null);

  useEffect(() => {
    if (!paintMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPaintMode(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paintMode]);

  // Flattened once per courseResourceData change -- a task's resource_ids
  // don't carry their own course_id, and a resource could in principle be
  // looked up regardless of which course the task itself is filed under,
  // so a single flat id->name map is simpler and more robust than a
  // per-course lookup keyed by task.course_id.
  const resourceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of Object.values(courseResourceData)) {
      for (const resource of entry.resources) map.set(resource.id, resource.name);
      for (const resource of entry.branchExamResources) map.set(resource.id, resource.name);
    }
    return map;
  }, [courseResourceData]);

  const isCurrentWeek = weekDays.some((d) => d.date === today);
  // A window can only be locked/evaluated once it's actually begun --
  // locking a window that's entirely in the future makes no sense, there's
  // nothing to finalize yet. No more "start of this calendar week" to
  // compare against under the rolling model, so this is just "has the
  // window's first day arrived yet."
  const isPastOrCurrentWeek = weekDays[0].date <= today;

  useEffect(() => {
    let cancelled = false;
    isWeekLocked(studentId, weekDays[0].date).then((locked) => {
      if (!cancelled) setWeekLocked(locked);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, weekDays]);

  async function handleToggleLock() {
    const next = !weekLocked;
    const message = next
      ? "Bu haftayı kilitlemek istediğine emin misin? Öğrenci bu haftanın görevlerini artık düzenleyemez."
      : "Bu haftanın kilidini açmak istediğine emin misin? Öğrenci tekrar düzenleyebilecek.";
    if (!confirm(message)) return;

    setLockBusy(true);
    try {
      if (next) await lockWeek(studentId, weekDays[0].date);
      else await unlockWeek(studentId, weekDays[0].date);
      setWeekLocked(next);
    } finally {
      setLockBusy(false);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function loadWeek(newWeekDays: { date: string; label: string }[]) {
    setLoading(true);
    try {
      const [taskRows, eventRows] = await Promise.all([
        getStudentTasksForWeek(studentId, newWeekDays[0].date, newWeekDays[6].date),
        getStudentEventsForWeek(studentId, newWeekDays[0].date, newWeekDays[6].date),
      ]);
      setTasks(taskRows as DetailTask[]);
      setEvents(eventRows);
      setWeekDays(newWeekDays);
    } finally {
      setLoading(false);
    }
  }

  function tasksByDay(date: string) {
    return tasks.filter((t) => t.task_date === date).sort((a, b) => a.order_index - b.order_index);
  }

  function eventsByDay(date: string) {
    return events.filter((e) => e.event_date === date).sort((a, b) => a.order_index - b.order_index);
  }

  function handleEventCreated(created: StudentEvent) {
    setEvents((prev) => [...prev, created]);
  }

  function handleEventSaved(saved: StudentEvent) {
    setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
  }

  function handleEventDeleted(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  // Duplicate onto the same day, appended after everything currently
  // there (same non-error-handled fire-and-forget shape as handleDuplicate
  // below, for a task) -- the coach can then drag the copy wherever it
  // actually belongs, same day or another one.
  async function handleDuplicateEvent(event: StudentEvent) {
    const created = await createStudentEvent(studentId, {
      description: event.description,
      eventType: event.event_type,
      eventDate: event.event_date,
      startTime: event.start_time.slice(0, 5),
      endTime: event.end_time.slice(0, 5),
      orderIndex: combinedItemIdsForDay(event.event_date).length,
    });
    setEvents((prev) => [...prev, created]);
  }

  // Optimistic, reverted on failure -- same shape as every other quick
  // toggle in this file (handleStatusChange below).
  function handleToggleEventLock(event: StudentEvent) {
    const next = !event.is_locked;
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_locked: next } : e)));
    setEventLocked(studentId, event.id, next).catch((e) => {
      setEvents((prev) => prev.map((ev) => (ev.id === event.id ? { ...ev, is_locked: event.is_locked } : ev)));
      toast.error(e instanceof Error ? e.message : "Kilit durumu değiştirilemedi.");
    });
  }

  function handleDeleteEvent(event: StudentEvent) {
    const previousEvents = events;
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    deleteStudentEvent(studentId, event.id).catch((e) => {
      setEvents(previousEvents);
      toast.error(e instanceof Error ? e.message : "Zaman bloğu silinemedi, geri getirildi.");
    });
  }

  function containerOf(id: string): string | null {
    if (id.startsWith(DAY_PREFIX)) return id.slice(DAY_PREFIX.length);
    if (isEventDragId(id)) return events.find((e) => e.id === eventIdFromDragId(id))?.event_date ?? null;
    return tasks.find((t) => t.id === id)?.task_date ?? null;
  }

  // The Görevler section's single combined [task|event] drag id sequence
  // for one day, in current order_index order -- tasks keep their bare
  // uuid, events use eventDragId(id) (see event-card.tsx). Routines stay
  // out of this entirely: they're a separate, non-dnd section (see
  // DayColumn). Both tables keep their own order_index column
  // (0067_student_events_order_index.sql); merging happens only here, at
  // render/reorder time.
  function combinedItemIdsForDay(date: string): string[] {
    const dayTasks = tasks.filter((t) => t.task_date === date && !isRoutineCourseId(t.course_id));
    const dayEvents = events.filter((e) => e.event_date === date);
    return [
      ...dayTasks.map((t) => ({ id: t.id, order_index: t.order_index })),
      ...dayEvents.map((e) => ({ id: eventDragId(e.id), order_index: e.order_index })),
    ]
      .sort((a, b) => a.order_index - b.order_index)
      .map((it) => it.id);
  }

  function isLockedId(id: string): boolean {
    if (isEventDragId(id)) return events.find((e) => e.id === eventIdFromDragId(id))?.is_locked ?? false;
    return tasks.find((t) => t.id === id)?.is_locked ?? false;
  }

  // useSortable({ disabled }) only stops a locked card from being picked
  // up -- it does nothing to stop arrayMove/splice from repositioning it
  // when OTHER items get dragged past it, since dnd-kit treats every id in
  // the array uniformly once a drag is in progress elsewhere. This corrects
  // that after the fact: every locked id gets pinned back to the exact
  // absolute index it held in `originalOrder` (the day's sequence right
  // before this specific drag), and only unlocked ids flow into whatever
  // slots are left, in the relative order `naiveOrder` (a plain arrayMove
  // or splice result) already put them in. Applies equally to same-day
  // reorders and cross-day inserts below -- both produce a "naive new
  // order" that needs the same correction.
  function enforceLockedPositions(naiveOrder: string[], originalOrder: string[]): string[] {
    const lockedIndexById = new Map<string, number>();
    originalOrder.forEach((id, i) => {
      if (isLockedId(id)) lockedIndexById.set(id, i);
    });
    if (lockedIndexById.size === 0) return naiveOrder;

    const indexToLockedId = new Map<number, string>();
    lockedIndexById.forEach((idx, id) => indexToLockedId.set(idx, id));

    const unlockedInNaiveOrder = naiveOrder.filter((id) => !lockedIndexById.has(id));
    const result: string[] = [];
    let ui = 0;
    for (let i = 0; i < naiveOrder.length; i++) {
      const lockedId = indexToLockedId.get(i);
      result.push(lockedId ?? unlockedInNaiveOrder[ui++]);
    }
    return result;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  // Drives the drop-target highlight below (DayColumn's isDropTarget) --
  // fires continuously as the pointer moves, so the highlighted day always
  // matches whichever one dnd-kit would actually resolve `over` to right
  // now, same containerOf() resolution handleDragEnd uses for the real
  // move.
  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    setOverDay(over ? containerOf(over.id as string) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverDay(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const sourceDay = containerOf(activeId);
    const targetDay = containerOf(overId);
    if (!sourceDay || !targetDay) return;

    if (sourceDay === targetDay) {
      const dayItemIds = combinedItemIdsForDay(sourceDay);
      const oldIndex = dayItemIds.indexOf(activeId);
      const newIndex = dayItemIds.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const naiveOrder = arrayMove(dayItemIds, oldIndex, newIndex);
      applyCombinedOrder(enforceLockedPositions(naiveOrder, dayItemIds));
      return;
    }

    // Cross-day: insert the dragged id into the TARGET day's current
    // combined list at the position implied by `overId` (a specific card,
    // or the end when dropped on the bare day container), then renumber
    // that day's whole combined sequence -- one shared code path handles
    // "task moves day" and "event moves day" identically; only the extra
    // per-kind call below (moveAssignedTask vs. updateStudentEvent, to
    // flip task_date/event_date) differs.
    const targetItemIds = combinedItemIdsForDay(targetDay);
    let insertIndex = targetItemIds.length;
    if (!overId.startsWith(DAY_PREFIX)) {
      const idx = targetItemIds.indexOf(overId);
      if (idx !== -1) insertIndex = idx;
    }
    const naiveTargetIds = [...targetItemIds];
    naiveTargetIds.splice(insertIndex, 0, activeId);
    const newTargetIds = enforceLockedPositions(naiveTargetIds, targetItemIds);

    if (isEventDragId(activeId)) {
      const movedEvent = events.find((e) => e.id === eventIdFromDragId(activeId));
      if (!movedEvent) return;
      applyCombinedOrder(newTargetIds, { kind: "event", event: movedEvent, targetDay });
    } else {
      const movedTask = tasks.find((t) => t.id === activeId);
      if (!movedTask) return;
      applyCombinedOrder(newTargetIds, { kind: "task", task: movedTask, targetDay });
    }
  }

  // Renumbers a day's combined [task|event] id sequence to 0..N-1 and
  // persists it, optimistically applying the same numbers locally first
  // (with rollback on failure) -- same shape as the single-table version
  // this replaced, just splitting the final updates by row type. `moved`
  // is only passed for a cross-day drop: it additionally flips
  // task_date/event_date on the one item that actually changed days.
  function applyCombinedOrder(
    orderedIds: string[],
    moved?: { kind: "task"; task: DetailTask; targetDay: string } | { kind: "event"; event: StudentEvent; targetDay: string },
  ) {
    const taskUpdates: { id: string; order_index: number }[] = [];
    const eventUpdates: { id: string; order_index: number }[] = [];
    orderedIds.forEach((id, i) => {
      if (isEventDragId(id)) eventUpdates.push({ id: eventIdFromDragId(id), order_index: i });
      else taskUpdates.push({ id, order_index: i });
    });

    const previousTasks = tasks;
    const previousEvents = events;
    const taskOrderById = new Map(taskUpdates.map((u) => [u.id, u.order_index]));
    const eventOrderById = new Map(eventUpdates.map((u) => [u.id, u.order_index]));

    setTasks((prev) =>
      prev.map((t) => {
        if (moved?.kind === "task" && t.id === moved.task.id) return { ...t, task_date: moved.targetDay, order_index: taskOrderById.get(t.id)! };
        return taskOrderById.has(t.id) ? { ...t, order_index: taskOrderById.get(t.id)! } : t;
      }),
    );
    setEvents((prev) =>
      prev.map((e) => {
        if (moved?.kind === "event" && e.id === moved.event.id) return { ...e, event_date: moved.targetDay, order_index: eventOrderById.get(e.id)! };
        return eventOrderById.has(e.id) ? { ...e, order_index: eventOrderById.get(e.id)! } : e;
      }),
    );

    // Sequential, not Promise.all -- each of these is its own independent
    // Server Action request, and firing 2-3 of them at once from a single
    // drag was a real contributor to the session-refresh race investigated
    // above: Supabase rotates the refresh token on use, so if this burst
    // happens to land right as the access token needs refreshing, whichever
    // concurrent request loses the rotation gets treated by proxy.ts as
    // "no user" and hard-redirects the coach out entirely. One request at a
    // time can still theoretically lose a race against some OTHER
    // concurrent activity, but it removes this specific self-inflicted
    // burst as a cause. Slightly slower per drag (a few hundred ms at
    // most, still fire-and-forget from the caller's perspective below);
    // rollback-on-any-failure behavior is unchanged.
    async function runCalls() {
      if (moved?.kind === "task") {
        await moveAssignedTask(studentId, moved.task.id, moved.targetDay, taskOrderById.get(moved.task.id)!);
        const rest = taskUpdates.filter((u) => u.id !== moved.task.id);
        if (rest.length > 0) await updateAssignedTaskOrder(studentId, rest);
        if (eventUpdates.length > 0) await updateStudentEventOrder(studentId, eventUpdates);
      } else if (moved?.kind === "event") {
        await updateStudentEvent(studentId, moved.event.id, {
          description: moved.event.description,
          eventType: moved.event.event_type,
          eventDate: moved.targetDay,
          startTime: moved.event.start_time.slice(0, 5),
          endTime: moved.event.end_time.slice(0, 5),
          orderIndex: eventOrderById.get(moved.event.id)!,
        });
        const rest = eventUpdates.filter((u) => u.id !== moved.event.id);
        if (rest.length > 0) await updateStudentEventOrder(studentId, rest);
        if (taskUpdates.length > 0) await updateAssignedTaskOrder(studentId, taskUpdates);
      } else {
        if (taskUpdates.length > 0) await updateAssignedTaskOrder(studentId, taskUpdates);
        if (eventUpdates.length > 0) await updateStudentEventOrder(studentId, eventUpdates);
      }
    }

    runCalls().catch((e) => {
      setTasks(previousTasks);
      setEvents(previousEvents);
      toast.error(e instanceof Error ? e.message : "Sıralama kaydedilemedi, geri alındı.");
    });
  }

  function handleCreated(created: DetailTask[]) {
    setTasks((prev) => [...prev, ...created]);
  }

  function handleResourceCreated(courseId: string, kind: "study" | "branch_exam", resource: { id: string; name: string }) {
    setCourseResourceData((prev) => {
      const current = prev[courseId] ?? { resources: [], branchExamResources: [], progress: {}, topicStats: { byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } } };
      return {
        ...prev,
        [courseId]:
          kind === "branch_exam"
            ? {
                ...current,
                branchExamResources: [...current.branchExamResources, { ...resource, total_stock: 0, remaining_stock: 0, is_active: true }],
              }
            : { ...current, resources: [...current.resources, { ...resource, is_active: true }] },
      };
    });
  }

  function handleSaved(updated: DetailTask) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function handleDuplicate(task: DetailTask) {
    const created = await duplicateAssignedTask(studentId, task.id);
    setTasks((prev) => [...prev, created as DetailTask]);
  }

  // Optimistic, reverted on failure -- same shape as handleToggleEventLock.
  function handleToggleTaskLock(task: DetailTask) {
    const next = !task.is_locked;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_locked: next } : t)));
    setTaskLocked(studentId, task.id, next).catch((e) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_locked: task.is_locked } : t)));
      toast.error(e instanceof Error ? e.message : "Kilit durumu değiştirilemedi.");
    });
  }

  function handleDelete(task: DetailTask) {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    deleteAssignedTask(studentId, task.id).catch((e) => {
      setTasks(previousTasks);
      toast.error(e instanceof Error ? e.message : "Görev silinemedi, geri getirildi.");
    });
  }

  function handleStatusChange(task: DetailTask, status: AssignedTaskStatus) {
    const previousTasks = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    updateAssignedTaskStatus(studentId, task.id, status).catch((e) => {
      setTasks(previousTasks);
      toast.error(e instanceof Error ? e.message : "Durum güncellenemedi, geri alındı.");
    });
  }

  // The widest lane across the current 7-day window, one for each of the
  // two independent row-index spaces (see routineRows/taskRows) -- every
  // DayColumn pads its own lane out to this many slots (real cards, then
  // empty per-row-height placeholders) so every row -- Rutinler AND
  // Görevler alike -- lines up at the exact same Y in every column,
  // Monday through Sunday, and so a day with fewer items than its busiest
  // neighbor still has a same-height placeholder sitting at each row it's
  // missing (needed for taskRows.heightOf(i) to mean the same row for
  // every day, not just "however many items I happen to have").
  const maxRoutineSlots = Math.max(0, ...weekDays.map((day) => tasksByDay(day.date).filter((t) => isRoutineCourseId(t.course_id)).length));
  const maxGorevSlots = Math.max(
    0,
    ...weekDays.map((day) => tasksByDay(day.date).filter((t) => !isRoutineCourseId(t.course_id)).length + eventsByDay(day.date).length),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, -1)))}
          aria-label="Bir gün geri"
          disabled={loading}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <input
          type="date"
          value={weekDays[0].date}
          onChange={(e) => e.target.value && loadWeek(getWeekDays(e.target.value))}
          disabled={loading}
          aria-label="Belirli bir tarihten başlayan 7 günlük görünüme git"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, 1)))}
          aria-label="Bir gün ileri"
          disabled={loading}
        >
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-foreground text-sm font-medium">
          {weekDays[0].label} – {weekDays[6].label}
        </span>
        {!isCurrentWeek && (
          <Button type="button" variant="ghost" size="sm" onClick={() => loadWeek(getWeekDays(today))} disabled={loading}>
            Bugün
          </Button>
        )}
        <PastWeeksDropdown studentId={studentId} currentWeekStart={weekDays[0].date} onSelectWeek={(date) => loadWeek(getWeekDays(date))} />

        {isPastOrCurrentWeek && (
          <Button
            type="button"
            variant={weekLocked ? "destructive" : "outline"}
            size="sm"
            onClick={handleToggleLock}
            disabled={lockBusy}
          >
            {weekLocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            {lockBusy ? "İşleniyor..." : weekLocked ? "Kilidi Aç" : "Haftayı Kilitle / Değerlendir"}
          </Button>
        )}

        {/* Independent from "Yeni Görev Ekle" below -- opens EventDialog
            directly (see event-dialog.tsx), never TaskDrawer, so a time
            block's own create flow never shares fields with the task
            drawer. Defaults to today when it's in view, otherwise the
            window's first day; the dialog's own Tarih field lets the coach
            change that before saving. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setEventDialogState({ mode: "create", date: isCurrentWeek ? today : weekDays[0].date })}
        >
          <Clock className="size-4" />
          Zaman Bloğu Ekle
        </Button>

        <Button type="button" size="sm" onClick={() => setDrawerState({ mode: "create-multi" })}>
          <Plus className="size-4" />
          Yeni Görev Ekle
        </Button>
      </div>

      <div className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium">Hızlı İşaretleme:</span>
        {PAINT_MODES.map(({ value, label, emoji, activeClass }) => (
          <button
            key={value}
            type="button"
            onClick={() => setPaintMode((prev) => (prev === value ? null : value))}
            className={cn(
              "border-border inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              paintMode === value ? activeClass : "bg-background text-foreground hover:bg-accent",
            )}
          >
            <span aria-hidden>{emoji}</span>
            {label}
          </button>
        ))}
        {paintMode && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setPaintMode(null)}>
            Modu Kapat (Esc)
          </Button>
        )}
      </div>

      {weekLocked && (
        <div className="border-border bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Lock className="size-4 shrink-0" />
          Bu hafta kilitli -- öğrenci artık bu haftanın görevlerini düzenleyemez. Tamamlanma oranı sabitlendi.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverDay(null);
        }}
      >
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1260px] grid-cols-7 items-start gap-3">
            {weekDays.map((day) => {
              const dayTasks = tasksByDay(day.date);
              return (
                <DayColumn
                  key={day.date}
                  day={day}
                  isToday={day.date === today}
                  isDropTarget={day.date === overDay}
                  events={eventsByDay(day.date)}
                  routineTasks={dayTasks.filter((t) => isRoutineCourseId(t.course_id))}
                  regularTasks={dayTasks.filter((t) => !isRoutineCourseId(t.course_id))}
                  maxRoutineSlots={maxRoutineSlots}
                  maxGorevSlots={maxGorevSlots}
                  routineRows={routineRows}
                  taskRows={taskRows}
                  resourceNameById={resourceNameById}
                  onAddRoutine={() => setDrawerState({ mode: "create-multi", initialTab: "routine", initialDate: day.date })}
                  onAddTask={() => setDrawerState({ mode: "create", date: day.date })}
                  onEdit={(task) => setDrawerState({ mode: "edit", task })}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onToggleLock={handleToggleTaskLock}
                  paintMode={paintMode}
                  onAddEvent={() => setEventDialogState({ mode: "create", date: day.date })}
                  onEditEvent={(event) => setEventDialogState({ mode: "edit", event })}
                  onDuplicateEvent={handleDuplicateEvent}
                  onDeleteEvent={handleDeleteEvent}
                  onToggleEventLock={handleToggleEventLock}
                />
              );
            })}
          </div>
        </div>

        <WeeklyDybTotal tasks={tasks} />

        {/* Renders in a portal, independent of the SortableContext tree --
            the card being dragged stays put (opacity-faded) in its list
            while this floating clone follows the pointer, instead of the
            old behavior where the list itself reflowed under the cursor. */}
        <DragOverlay>
          {/* Row height is a property of the SLOT the card is dragged
              through, not the card itself (see routineRows/taskRows) --
              the floating ghost isn't sitting in any slot, so it just uses
              a sensible fixed preview size rather than trying to track
              whichever row it's currently hovering. */}
          {activeTask && (
            <div
              style={{ height: DEFAULT_CARD_HEIGHT_PX }}
              className={cn(
                "border-border flex w-[220px] flex-col overflow-hidden rounded-md border p-2.5 shadow-lg",
                cardBackgroundClass(activeTask),
                statusClasses(activeTask),
              )}
            >
              <TaskCardBody task={activeTask} resourceNameById={resourceNameById} />
            </div>
          )}
          {activeEvent && (
            <div className={cn("flex w-[220px] items-start gap-1 rounded-md border px-2 py-1.5 text-xs shadow-lg", EVENT_TYPE_CLASSES[activeEvent.event_type])}>
              <EventCardBody event={activeEvent} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {drawerState && (
        <TaskDrawer
          key={drawerKey(drawerState)}
          state={drawerState}
          onClose={() => setDrawerState(null)}
          studentId={studentId}
          weekDays={weekDays}
          courseResourceData={courseResourceData}
          onCreated={handleCreated}
          onSaved={handleSaved}
          onResourceCreated={handleResourceCreated}
        />
      )}

      {eventDialogState && (
        <EventDialog
          key={eventDialogState.mode === "edit" ? `edit:${eventDialogState.event.id}` : `create:${eventDialogState.date}`}
          state={eventDialogState}
          studentId={studentId}
          onClose={() => setEventDialogState(null)}
          onCreated={handleEventCreated}
          onSaved={handleEventSaved}
          onDeleted={handleEventDeleted}
        />
      )}
    </div>
  );
}

function DayColumn({
  day,
  isToday,
  isDropTarget,
  events,
  routineTasks,
  regularTasks,
  maxRoutineSlots,
  maxGorevSlots,
  routineRows,
  taskRows,
  resourceNameById,
  onAddRoutine,
  onAddTask,
  onEdit,
  onDuplicate,
  onDelete,
  onStatusChange,
  onToggleLock,
  paintMode,
  onAddEvent,
  onEditEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onToggleEventLock,
}: {
  day: { date: string; label: string };
  isToday: boolean;
  isDropTarget: boolean;
  events: StudentEvent[];
  routineTasks: DetailTask[];
  regularTasks: DetailTask[];
  maxRoutineSlots: number;
  maxGorevSlots: number;
  routineRows: RowHeights;
  taskRows: RowHeights;
  resourceNameById: Map<string, string>;
  onAddRoutine: () => void;
  onAddTask: () => void;
  onEdit: (task: DetailTask) => void;
  onDuplicate: (task: DetailTask) => void;
  onDelete: (task: DetailTask) => void;
  onStatusChange: (task: DetailTask, status: AssignedTaskStatus) => void;
  onToggleLock: (task: DetailTask) => void;
  paintMode: AssignedTaskStatus | null;
  onAddEvent: () => void;
  onEditEvent: (event: StudentEvent) => void;
  onDuplicateEvent: (event: StudentEvent) => void;
  onDeleteEvent: (event: StudentEvent) => void;
  onToggleEventLock: (event: StudentEvent) => void;
}) {
  // Droppable now covers the WHOLE column (events + rutinler + görevler),
  // not just the görevler list -- a time block can be dropped anywhere in
  // a day and still resolve to that day's date. The görevler section's
  // individual sortable task cards still register their own, more precise
  // nested droppable rects (see SortableContext below), so dropping
  // exactly on another task still reorders as before; this only widens
  // what counts as "this day" everywhere else in the column.
  const { setNodeRef } = useDroppable({ id: `${DAY_PREFIX}${day.date}` });

  // Tasks and time blocks interleaved into one render/sort order, by their
  // own (separately-columned) order_index -- see combinedItemIdsForDay in
  // ScheduleBoard, which computes the same merge for drag-end math. Ties
  // (both default to 0 on creation) fall back to a stable sort, same as an
  // untouched student_tasks list already does.
  const scheduleItems: ({ kind: "task"; data: DetailTask } | { kind: "event"; data: StudentEvent })[] = [
    ...regularTasks.map((t) => ({ kind: "task" as const, data: t })),
    ...events.map((e) => ({ kind: "event" as const, data: e })),
  ].sort((a, b) => a.data.order_index - b.data.order_index);
  const scheduleItemIds = scheduleItems.map((it) => (it.kind === "task" ? it.data.id : eventDragId(it.data.id)));

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // No min-h here (and no flex-1 growth inside, below) -- a day
        // column's height must follow its own content so items-start on
        // the parent grid (see ScheduleBoard) actually shows: a light day
        // stays short and top-aligned instead of stretching to match a
        // packed neighbor.
        "flex flex-col rounded-lg border transition-colors",
        isToday ? "border-primary/40 bg-primary/5" : "border-border bg-card/40",
        // Drop-target highlight (isDropTarget, from ScheduleBoard's
        // centrally-resolved overDay) -- a ring rather than just a border
        // color change so it stays clearly visible layered on top of
        // isToday's own tint, giving the coach one unambiguous answer to
        // "which day am I about to drop this on" regardless of how many
        // cards are already in the way.
        isDropTarget && "border-primary bg-primary/10 ring-primary ring-2 ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between gap-1 px-2 pt-2">
        <h3 className={cn("truncate text-sm leading-tight font-semibold", isToday ? "text-primary" : "text-foreground")}>
          {day.label}
        </h3>
      </div>

      {/* Section 1: Rutinler -- Paragraf/Problem land here automatically,
          routed purely by course_id, regardless of which "+" created them. */}
      <div className="border-border/60 mx-2 mt-2 space-y-1.5 border-b pb-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-primary text-[10px] font-semibold tracking-wide uppercase">Rutinler</span>
          <Button type="button" variant="ghost" size="icon" className="size-5 shrink-0" onClick={onAddRoutine} aria-label="Rutin ekle">
            <Plus className="size-3.5" />
          </Button>
        </div>
        {maxRoutineSlots === 0 ? (
          <p className="text-muted-foreground py-1.5 text-center text-[10px]">—</p>
        ) : (
          <div className="space-y-1.5">
            {routineTasks.map((task, i) => (
              <RoutineTaskCard
                key={task.id}
                task={task}
                resourceNameById={resourceNameById}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
                paintMode={paintMode}
                cardHeight={routineRows.heightOf(i)}
                onResize={(deltaY) => routineRows.onResize(i, deltaY)}
                onResizeEnd={() => routineRows.onResizeEnd(i, maxRoutineSlots)}
              />
            ))}
            {/* Pads this day's Rutinler lane out to the week's widest one
                (maxRoutineSlots, computed in ScheduleBoard) so every row --
                not just where the lane happens to end -- lines up at the
                same Y in every column. Each placeholder shares its row's
                own independent height (routineRows.heightOf), same as a
                real card at that index would. */}
            {Array.from({ length: maxRoutineSlots - routineTasks.length }).map((_, j) => {
              const rowIndex = routineTasks.length + j;
              return (
                <div
                  key={`routine-placeholder-${rowIndex}`}
                  aria-hidden
                  style={{ height: routineRows.heightOf(rowIndex) }}
                  className="border-border/40 rounded-md border border-dashed"
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: tasks and time blocks, unified -- a coach can drag a
          time block ("Okul", a coach meeting) to sit directly between two
          tasks (Task 1 -> Okul -> Task 2), not just to a different day.
          Both share one SortableContext and one combined order_index
          sequence per day (see combinedItemIdsForDay/applyCombinedOrder in
          ScheduleBoard); a time block still renders with EventCard, which
          carries none of KanbanTaskCard's status/D-Y-B affordances. */}
      <div className="flex flex-col gap-1.5 p-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Görevler</span>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" className="size-5" onClick={onAddEvent} aria-label="Zaman bloğu ekle">
              <Clock className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-5" onClick={onAddTask} aria-label="Görev ekle">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>

        <SortableContext items={scheduleItemIds} strategy={verticalListSortingStrategy}>
          <div className="flex min-h-[80px] flex-col gap-1.5">
            {maxGorevSlots === 0 ? (
              <button
                type="button"
                onClick={onAddTask}
                className="text-muted-foreground hover:border-primary/40 hover:text-foreground flex items-center justify-center rounded-md border border-dashed py-6 text-xs transition-colors"
              >
                Görev ekle
              </button>
            ) : (
              <>
                {scheduleItems.map((item, i) =>
                  item.kind === "task" ? (
                    <KanbanTaskCard
                      key={item.data.id}
                      task={item.data}
                      resourceNameById={resourceNameById}
                      onEdit={onEdit}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      onStatusChange={onStatusChange}
                      onToggleLock={onToggleLock}
                      paintMode={paintMode}
                      cardHeight={taskRows.heightOf(i)}
                      onResize={(deltaY) => taskRows.onResize(i, deltaY)}
                      onResizeEnd={() => taskRows.onResizeEnd(i, maxGorevSlots)}
                    />
                  ) : (
                    <EventCard
                      key={item.data.id}
                      event={item.data}
                      onEdit={onEditEvent}
                      onDuplicate={onDuplicateEvent}
                      onDelete={onDeleteEvent}
                      onToggleLock={onToggleEventLock}
                      height={taskRows.heightOf(i)}
                      onResize={(deltaY) => taskRows.onResize(i, deltaY)}
                      onResizeEnd={() => taskRows.onResizeEnd(i, maxGorevSlots)}
                    />
                  ),
                )}
                {/* Pads this day's Görevler lane out to the week's widest
                    one (maxGorevSlots, computed in ScheduleBoard) so every
                    row lines up at the same Y in every column, exactly
                    like the Rutinler placeholders above -- a strict grid
                    across the whole board, not just the routine lane. */}
                {Array.from({ length: maxGorevSlots - scheduleItems.length }).map((_, j) => {
                  const rowIndex = scheduleItems.length + j;
                  return (
                    <div
                      key={`gorev-placeholder-${rowIndex}`}
                      aria-hidden
                      style={{ height: taskRows.heightOf(rowIndex) }}
                      className="border-border/40 rounded-md border border-dashed"
                    />
                  );
                })}
              </>
            )}
          </div>
        </SortableContext>
      </div>

      <DybFooter tasks={[...routineTasks, ...regularTasks]} />
    </div>
  );
}

// D/Y/B for everything scored in this day -- tasks with no score yet
// (null counts) contribute nothing, so an all-pending day just shows
// zeros rather than looking like a data error.
function DybFooter({ tasks }: { tasks: DetailTask[] }) {
  const { correct, wrong, empty } = sumTaskCounts(tasks);
  return (
    <div className="border-border/60 text-muted-foreground flex items-center justify-center gap-2 border-t px-2 py-1.5 text-[11px] tabular-nums">
      <span className="text-emerald-700">D:{correct}</span>
      <span className="text-rose-700">Y:{wrong}</span>
      <span className="text-amber-700">B:{empty}</span>
    </div>
  );
}

// Grand total across all 7 days -- same sumTaskCounts as each day's own
// footer, just over the whole week's tasks instead of one day's.
function WeeklyDybTotal({ tasks }: { tasks: DetailTask[] }) {
  const { correct, wrong, empty } = sumTaskCounts(tasks);
  return (
    <div className="mt-3 flex justify-center">
      <div className="border-border bg-muted/30 flex items-center gap-4 rounded-full border px-5 py-2 text-sm font-medium tabular-nums">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Haftalık Toplam</span>
        <span className="text-emerald-700">D:{correct}</span>
        <span className="text-rose-700">Y:{wrong}</span>
        <span className="text-amber-700">B:{empty}</span>
      </div>
    </div>
  );
}

const MONTH_LABELS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatWeekRangeLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${start.getUTCDate()} ${MONTH_LABELS_SHORT[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTH_LABELS_SHORT[end.getUTCMonth()]}`;
}

// "Geçmiş Programlar" archive -- lists every past week that actually has
// assigned tasks (fetched on open, not pre-loaded, so it can't go stale
// within a long session) and jumps the board there on click. Same fully
// editable board, just navigated to a different week -- no separate
// read-only mode.
function PastWeeksDropdown({
  studentId,
  currentWeekStart,
  onSelectWeek,
}: {
  studentId: string;
  currentWeekStart: string;
  onSelectWeek: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weeks, setWeeks] = useState<{ weekStart: string; taskCount: number }[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && weeks === null) {
      setLoading(true);
      try {
        setWeeks(await getPastWeeksForStudent(studentId));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button type="button" variant="outline" size="sm" onClick={handleToggle}>
        <CalendarClock className="size-4" />
        Geçmiş Programlar
      </Button>

      {open && (
        <div className="border-border bg-popover text-popover-foreground absolute z-20 mt-1 w-64 overflow-hidden rounded-md border shadow-md">
          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">Yükleniyor...</p>
            ) : !weeks || weeks.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">Henüz geçmiş program yok.</p>
            ) : (
              weeks.map((w) => (
                <button
                  key={w.weekStart}
                  type="button"
                  onClick={() => {
                    onSelectWeek(w.weekStart);
                    setOpen(false);
                  }}
                  className={cn(
                    "hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                    w.weekStart === currentWeekStart && "bg-accent/60 font-medium",
                  )}
                >
                  <span>{formatWeekRangeLabel(w.weekStart)}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{w.taskCount} görev</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
