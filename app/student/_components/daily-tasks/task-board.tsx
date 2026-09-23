"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CalendarClock, ChevronLeft, ChevronRight, ClipboardList, Lock, Trash2 } from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { isRoutineCourseId } from "@/lib/curriculum";
import { sumTaskCounts, sumTaskDuration } from "@/lib/scoring";
import { updateScheduleRoutineRowHeights, updateScheduleTaskRowHeights } from "@/lib/schedule-row-heights";
import { useRowHeights } from "@/lib/use-row-heights";
import { useAutoRowHeights } from "@/lib/use-auto-row-heights";
import { deleteCustomTask, getPastWeeksForStudent, getTasksForWeek, updateTaskOrder } from "../../actions";
import type { ExamType } from "@/lib/exam-type";
import { AddCustomTaskDialog } from "./add-custom-task-dialog";
import { PendingAnalysisAlert } from "./pending-analysis-alert";
import { SortableTaskCard } from "./sortable-task-card";
import { TaskModal } from "./task-modal";
import { WeekProgressBar } from "./week-progress-bar";
import { TaskDescription } from "@/components/task-description";
import type { StudentFixedTask, StudentTask } from "./types";
import { DEFAULT_CELL_HEIGHT_PX, MIN_CELL_HEIGHT_PX, WeekTaskCell } from "./week-task-cell";

type ViewMode = "today" | "week";
type ModalStep = "form" | "analysis";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const MONTH_LABELS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Monday=0..Sunday=6, matching this app's own existing convention
// (mondayIndexOf/DAY_LABELS_SHORT in the coach's schedule-board.tsx/
// task-drawer.tsx) -- JS's native getUTCDay() is Sunday=0..Saturday=6, so
// this just rotates it.
function dayOfWeekOf(dateIso: string): number {
  return (new Date(`${dateIso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// A rolling 7-day window starting EXACTLY at referenceIso -- deliberately
// not Monday-aligned, mirroring the coach's own schedule-board.tsx (see
// its own comment) so Prev/Next below can shift the window by exactly 1
// day instead of jumping a whole week. Each date's own day-of-week
// decides its label, not its position in the array.
function getWeekDays(referenceIso: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(referenceIso, i);
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `${DAY_LABELS[dayOfWeekOf(date)]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

// Read-only "Sabit Görevler" chip -- injected from the student's fixed
// weekly skeleton (managed by the coach on the Program tab, see migration
// 0081's own comment for why this is never editable here). Same dashed/
// locked visual treatment as the coach's own schedule-board.tsx injects,
// so it reads as the same feature on both panels.
function FixedTaskChip({
  task,
  innerRef,
  minHeight,
}: {
  task: StudentFixedTask;
  // Only set from the "Bu Hafta" grid (see maxFixedSlots/fixedRows in
  // TaskBoard) -- the "Bugün" list below has just one day to show, so
  // nothing there needs to line up with a neighbor.
  innerRef?: (el: HTMLDivElement | null) => void;
  minHeight?: number;
}) {
  return (
    <div
      ref={innerRef}
      style={minHeight !== undefined ? { minHeight } : undefined}
      className="border-border/70 bg-muted/50 text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-xs"
    >
      {/* Time on its own top-right line -- sharing a row with the title (the old
          layout) squeezed the title/description into a narrow column and forced
          awkward line breaks. On its own line, the title below gets the card's
          full width. */}
      <div className="flex justify-end">
        <span className="shrink-0 tabular-nums">
          {task.start_time.slice(0, 5)}–{task.end_time.slice(0, 5)}
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <Lock className="mt-0.5 size-3 shrink-0" aria-label="Sabit, salt okunur" />
        {/* break-words, not truncate: a long title wraps across lines instead of
            being clipped to one with an ellipsis. */}
        <span className="min-w-0 flex-1 font-medium break-words">{task.title}</span>
      </div>
      {/* lines="all" -- this chip's own row height auto-measures to fit
          whatever renders (fixedRows in TaskBoard), so there's nothing to
          clip; a line-clamp here would only ever be an artificial cap
          adding a "…" to a description this box already has room for. */}
      <TaskDescription text={task.description} lines="all" className="mt-1 pl-[18px] text-[11px]" />
    </div>
  );
}

function formatWeekRangeLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${start.getUTCDate()} ${MONTH_LABELS_SHORT[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTH_LABELS_SHORT[end.getUTCMonth()]}`;
}

function byOrder(a: StudentTask, b: StudentTask) {
  return a.order_index - b.order_index;
}

function formatMinutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} dk`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

export function TaskBoard({
  today,
  weekDays: initialWeekDays,
  initialTasks,
  fixedTasks,
  allTimeTrackedMinutes,
  todayLocked,
  progressLockedAt,
  initialRoutineRowHeights,
  initialTaskRowHeights,
  examType = "YKS",
}: {
  today: string;
  weekDays: { date: string; label: string }[];
  initialTasks: StudentTask[];
  // "Sabit Görevler" -- week-independent (no per-week refetch, same as
  // the coach's own ScheduleBoard), read-only here. Managed only by the
  // coach, on the Program tab.
  fixedTasks: StudentFixedTask[];
  // All-time sum of tracked_duration_seconds across every task this
  // student has ever had -- unlike the Günlük/Haftalık totals below
  // (DybTotalCard), this doesn't depend on `tasks` (only the current
  // week/today is ever loaded client-side) so it's computed once,
  // server-side, and passed straight through rather than derived here.
  allTimeTrackedMinutes: number;
  todayLocked: boolean;
  // When the coach locked the current week's schedule (null = not locked):
  // where the progress bar starts counting.
  progressLockedAt: string | null;
  // The student's own profiles.schedule_routine_row_heights_px /
  // schedule_task_row_heights_px, fetched server-side by
  // app/student/page.tsx so the very first render already matches their
  // last drag, with no flash of the wrong heights while a client fetch
  // resolves. Only ever affects the "Bu Hafta" grid -- the "Bugün" list
  // (SortableTaskCard) isn't a grid, so there's no alignment concern to
  // adjust for there.
  initialRoutineRowHeights: number[];
  initialTaskRowHeights: number[];
  // The student's cohort -- picks which subjects Ek Çalışma Ekle and the
  // task modal offer; the board itself is identical for both.
  examType?: ExamType;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  // The progress bar is always about the CURRENT week, however far the grid below
  // is browsed (loadWeek swaps `tasks` for the browsed week's) -- so it reads its
  // own copy, kept in step with every save/create/delete.
  const [progressTasks, setProgressTasks] = useState(initialTasks);
  const [weekDays, setWeekDays] = useState(initialWeekDays);
  // The initial week IS the current week, so its lock state is exactly
  // todayLocked -- reused here instead of re-deriving it, since navigating
  // away is the only thing that ever needs a fresh fetch.
  const [weekLocked, setWeekLocked] = useState(todayLocked);
  const [weekLoading, setWeekLoading] = useState(false);
  const [view, setView] = useState<ViewMode>("today");
  const [activeTask, setActiveTask] = useState<StudentTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("form");
  const [modalOpenKey, setModalOpenKey] = useState(0);
  // Independent per-row height for each lane -- a strict, Excel-like grid
  // across the whole "Bu Hafta" board, mirroring the coach's own
  // schedule-board.tsx exactly (see useRowHeights for the shared drag/
  // persist mechanics). The two lanes are entirely independent row-index
  // spaces from each other.
  const routineRows = useRowHeights(
    initialRoutineRowHeights,
    MIN_CELL_HEIGHT_PX,
    DEFAULT_CELL_HEIGHT_PX,
    updateScheduleRoutineRowHeights,
    (message) => toast.error(message),
  );
  const taskRows = useRowHeights(
    initialTaskRowHeights,
    MIN_CELL_HEIGHT_PX,
    DEFAULT_CELL_HEIGHT_PX,
    updateScheduleTaskRowHeights,
    (message) => toast.error(message),
  );
  // Widest "Sabit Görevler" lane across the currently-loaded 7-day window
  // (same "pad every day to the busiest one" convention as maxRoutineSlots/
  // maxGorevSlots below) -- rendered for every day, real chip or empty
  // placeholder, so a day with no fixed tasks doesn't let Rutinler start
  // higher than a neighbor's. Fixed tasks aren't draggable, so unlike
  // routineRows/taskRows each row's height here is auto-measured from its
  // real content rather than dragged (see useAutoRowHeights). A hook call,
  // so it has to live at this top level, not inside the per-day render below.
  const maxFixedSlots = Math.max(0, ...weekDays.map((day) => fixedTasks.filter((t) => t.day_of_week === dayOfWeekOf(day.date)).length));
  const fixedRows = useAutoRowHeights(
    maxFixedSlots,
    weekDays.map(
      (day) =>
        `${day.date}:${fixedTasks
          .filter((t) => t.day_of_week === dayOfWeekOf(day.date))
          .map((t) => `${t.id}:${t.title}:${t.description ?? ""}`)
          .join(",")}`,
    ),
  );

  const isCurrentWeek = weekDays.some((d) => d.date === today);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function openTask(task: StudentTask, step: ModalStep = "form") {
    setActiveTask(task);
    setModalStep(step);
    setModalOpenKey((k) => k + 1);
    setModalOpen(true);
  }

  function handleSaved(updated: StudentTask) {
    // Merged onto the existing row, not a wholesale replacement: `updated`
    // comes straight back from a plain `select("*")` in actions.ts, which
    // (like week_locked already did) doesn't include resource_names --
    // that's joined once, up front, in fetchHomeData (page.tsx) and never
    // changes via any of these save paths, so keeping whatever the task
    // already had is exactly correct, not stale.
    const before = tasks.find((t) => t.id === updated.id);
    if (updated.evidence_review_status === "pending" && before?.evidence_review_status !== "pending") {
      toast.info("Fotoğraflı görev koçun onayına gönderildi.");
    }
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    setProgressTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  }

  function handleCreated(task: StudentTask) {
    setTasks((prev) => [...prev, task]);
    setProgressTasks((prev) => [...prev, task]);
  }

  async function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setProgressTasks((prev) => prev.filter((t) => t.id !== taskId));
    await deleteCustomTask(taskId);
  }

  // Fetches a different week's tasks for the grid, without ever losing
  // today's own tasks (the "Bugün" tab stays pinned to the real today
  // regardless of which week the grid is browsing) or any pending-analysis
  // task from elsewhere (PendingAnalysisAlert, below, is meant to persist
  // across navigation too). Everything else belonging to whichever week
  // was previously loaded gets replaced by the new one.
  async function loadWeek(newWeekDays: { date: string; label: string }[]) {
    setWeekLoading(true);
    try {
      const { tasks: rows, weekLocked: locked } = await getTasksForWeek(newWeekDays[0].date, newWeekDays[6].date);
      const rowIds = new Set(rows.map((r) => r.id));
      setTasks((prev) => [
        ...prev.filter((t) => (t.task_date === today || t.analysis_pending) && !rowIds.has(t.id)),
        ...(rows as StudentTask[]),
      ]);
      setWeekDays(newWeekDays);
      setWeekLocked(locked);
    } finally {
      setWeekLoading(false);
    }
  }

  function handleReorder(section: StudentTask[]) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = section.findIndex((t) => t.id === active.id);
      const newIndex = section.findIndex((t) => t.id === over.id);
      const reordered = arrayMove(section, oldIndex, newIndex);
      const updates = reordered.map((t, i) => ({ id: t.id, order_index: i }));
      const orderById = new Map(updates.map((u) => [u.id, u.order_index]));

      setTasks((prev) => prev.map((t) => (orderById.has(t.id) ? { ...t, order_index: orderById.get(t.id)! } : t)));
      updateTaskOrder(updates);
    };
  }

  const todayTasks = tasks.filter((t) => t.task_date === today);
  const coachTasks = todayTasks.filter((t) => t.is_coach_assigned).sort(byOrder);
  const customTasks = todayTasks.filter((t) => !t.is_coach_assigned).sort(byOrder);
  const todayFixedTasks = fixedTasks.filter((t) => t.day_of_week === dayOfWeekOf(today));
  // Same split as the coach's own schedule board (Rutinler vs Görevler,
  // routed purely by course_id -- see isRoutineCourseId) so a student
  // sees their day grouped exactly the way the coach assigned it.
  const routineTasks = coachTasks.filter((t) => isRoutineCourseId(t.course_id));
  const regularTasks = coachTasks.filter((t) => !isRoutineCourseId(t.course_id));

  return (
    <div className="space-y-6">
      <PendingAnalysisAlert tasks={tasks} onOpenTask={(t) => openTask(t, "analysis")} />

      {/* Same bar/calculation either way (progressTasks/progressLockedAt,
          always about the current week regardless of which week the grid
          below is browsing) -- only the heading framing switches with the
          view, see WeekProgressBar's own comment. */}
      <WeekProgressBar tasks={progressTasks} today={today} lockedAt={progressLockedAt} variant={view} />

      {/* Always visible regardless of Bugün/Bu Hafta -- unlike Günlük/
          Haftalık Toplam below, this doesn't reset when switching views or
          navigating weeks, so it lives here instead of inside either
          view's own footer. */}
      <div className="border-border bg-muted/30 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
        <CalendarClock className="text-muted-foreground size-4 shrink-0" />
        <span className="text-muted-foreground">Tüm Zamanlar Toplam Süre:</span>
        <span className="text-foreground font-semibold tabular-nums">{formatMinutesLabel(allTimeTrackedMinutes)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-secondary inline-flex w-fit rounded-lg p-1">
          {(["today", "week"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                view === mode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "today" ? "Bugün" : "Bu Hafta"}
            </button>
          ))}
        </div>

        {/* Day-by-day navigation -- only meaningful once "Bu Hafta" is
            showing. Shifts the rolling 7-day window by exactly 1 day
            (not a whole week), mirroring the coach's own schedule-board.tsx
            exactly -- a student previously had no way to reach a past
            (and possibly locked) week at all once it scrolled off the
            default view; this also lets them nudge the window a single
            day at a time instead of only ever jumping by 7. */}
        {view === "week" && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, -1)))}
              aria-label="Bir gün geri"
              disabled={weekLoading}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <input
              type="date"
              value={weekDays[0].date}
              onChange={(e) => e.target.value && loadWeek(getWeekDays(e.target.value))}
              disabled={weekLoading}
              aria-label="Belirli bir tarihten başlayan 7 günlük görünüme git"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, 1)))}
              aria-label="Bir gün ileri"
              disabled={weekLoading}
            >
              <ChevronRight className="size-4" />
            </Button>
            <span className="text-foreground text-sm font-medium">
              {weekDays[0].label} – {weekDays[6].label}
            </span>
            {!isCurrentWeek && (
              <Button type="button" variant="ghost" size="sm" onClick={() => loadWeek(getWeekDays(today))} disabled={weekLoading}>
                Bu Hafta
              </Button>
            )}
            <PastWeeksDropdown currentWeekStart={weekDays[0].date} onSelectWeek={(date) => loadWeek(getWeekDays(date))} />
          </>
        )}
      </div>


      {view === "week" && weekLocked && (
        <div className="border-border bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Lock className="size-4 shrink-0" />
          Bu hafta koçun tarafından kilitlendi -- sadece görüntüleyebilirsin.
        </div>
      )}

      {view === "today" ? (
        <>
          {todayFixedTasks.length > 0 && (
            <div>
              <span className="text-muted-foreground mb-1.5 block text-[10px] font-semibold tracking-wide uppercase">Sabit Görevler</span>
              <div className="space-y-1.5">
                {todayFixedTasks.map((t) => (
                  <FixedTaskChip key={t.id} task={t} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-foreground mb-3 text-base font-semibold">Bugünün Programı</h2>
            {coachTasks.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Bugün için koçun tarafından atanmış bir görev yok."
                description="Koçun yeni bir program hazırladığında burada görünecek. Bu arada aşağıdan kendi ekstra çalışmanı ekleyebilirsin."
              />
            ) : (
              <div className="space-y-5">
                {routineTasks.length > 0 && (
                  <div>
                    <span className="text-primary mb-1.5 block text-[10px] font-semibold tracking-wide uppercase">Rutinler</span>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder(routineTasks)}>
                      <SortableContext items={routineTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {routineTasks.map((task) => (
                            <SortableTaskCard key={task.id} task={task} onClick={() => openTask(task)} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {regularTasks.length > 0 && (
                  <div>
                    {routineTasks.length > 0 && (
                      <span className="text-muted-foreground mb-1.5 block text-[10px] font-semibold tracking-wide uppercase">Görevler</span>
                    )}
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder(regularTasks)}>
                      <SortableContext items={regularTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {regularTasks.map((task) => (
                            <SortableTaskCard key={task.id} task={task} onClick={() => openTask(task)} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-foreground text-base font-semibold">Diğer / Ekstra Çalışmalarım</h2>
              <AddCustomTaskDialog taskDate={today} onCreated={handleCreated} disabled={todayLocked} examType={examType} />
            </div>
            {customTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">Henüz ekstra bir çalışma eklemedin.</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleReorder(customTasks)}
              >
                <SortableContext items={customTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {customTasks.map((task) => (
                      <SortableTaskCard
                        key={task.id}
                        task={task}
                        onClick={() => openTask(task)}
                        trailing={
                          // Branch exams are coach/admin-delete-only, same
                          // as resource tracking -- RLS already rejects
                          // this for a student (student_tasks_student_
                          // delete_custom, 0050), so the button doesn't
                          // even render one to try.
                          task.task_type === "branch_exam" ? undefined : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                              onClick={() => handleDelete(task.id)}
                              disabled={task.week_locked}
                              aria-label="Çalışmayı sil"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <TodayDybTotal tasks={todayTasks} />
        </>
      ) : (
        <>
        <div className="overflow-x-auto pb-2">
          {/* items-start (not the grid default of stretch) -- each day
              column should only be as tall as its own content, so a
              light day doesn't get stretched to match a packed one.
              Sizing matches the coach's schedule board (schedule-board.tsx)
              for visual parity between panels. */}
          <div className="grid min-w-[1260px] grid-cols-7 items-start gap-3">
            {(() => {
              // The widest lane across the currently-loaded 7-day window,
              // one for each of the two independent row-index spaces (see
              // routineRows/taskRows) -- every day pads its own lane out to
              // this many slots (real cells, then empty per-row-height
              // placeholders) so every row -- Rutinler AND Görevler alike
              // -- lines up at the same Y in every column. Mirrors the
              // coach's own schedule-board.tsx (maxRoutineSlots/
              // maxGorevSlots) exactly; ported rather than shared, per this
              // app's per-panel duplication convention.
              const maxRoutineSlots = Math.max(
                0,
                ...weekDays.map((day) => tasks.filter((t) => t.task_date === day.date && isRoutineCourseId(t.course_id)).length),
              );
              const maxGorevSlots = Math.max(
                0,
                ...weekDays.map((day) => tasks.filter((t) => t.task_date === day.date && !isRoutineCourseId(t.course_id)).length),
              );
              return weekDays.map((day) => {
              const dayTasks = tasks.filter((t) => t.task_date === day.date).sort(byOrder);
              // Same Rutinler/Görevler split as the "Bugün" view and the
              // coach's own schedule board (isRoutineCourseId), applied
              // per day here.
              const dayRoutineTasks = dayTasks.filter((t) => isRoutineCourseId(t.course_id));
              const dayRegularTasks = dayTasks.filter((t) => !isRoutineCourseId(t.course_id));
              const dayFixedTasks = fixedTasks.filter((t) => t.day_of_week === dayOfWeekOf(day.date));
              const isToday = day.date === today;
              return (
                <div
                  key={day.date}
                  className={cn(
                    "flex flex-col rounded-lg border",
                    isToday ? "border-primary/40 bg-primary/5" : "border-border bg-card/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-1 px-2 pt-2">
                    <h3 className={cn("truncate text-sm leading-tight font-semibold", isToday ? "text-primary" : "text-foreground")}>
                      {day.label}
                    </h3>
                    {isToday && <span className="text-primary/70 shrink-0 text-[10px] font-normal">Bugün</span>}
                  </div>

                  {/* Section 0: Sabit Görevler -- injected read-only, rendered
                      for every day once ANY day in the week has at least one
                      (maxFixedSlots), each day padded to that count with an
                      invisible same-height placeholder and every row sized to
                      the tallest real chip found at that row across all 7
                      days (fixedRows, auto-measured) -- see FixedTaskChip's
                      own comment. Mirrors the coach's own schedule-board.tsx
                      injection exactly. */}
                  {maxFixedSlots > 0 && (
                    <div className="border-border/60 mx-2 mt-2 space-y-1.5 border-b pb-2">
                      <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Sabit Görevler</span>
                      <div className="space-y-1.5">
                        {Array.from({ length: maxFixedSlots }).map((_, rowIndex) => {
                          const t = dayFixedTasks[rowIndex];
                          if (!t) {
                            return (
                              <div
                                key={`fixed-placeholder-${rowIndex}`}
                                aria-hidden
                                style={{ minHeight: fixedRows.heights[rowIndex] ?? 0 }}
                              />
                            );
                          }
                          return (
                            <FixedTaskChip
                              key={t.id}
                              task={t}
                              innerRef={fixedRows.registerRef(rowIndex, day.date)}
                              minHeight={fixedRows.heights[rowIndex] ?? 0}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Section 1: Rutinler -- persistent chrome even when
                      empty, matching the coach's schedule board. Padded out
                      to maxRoutineSlots (real cells, then empty fixed-height
                      placeholders) so Section 2 starts at the same Y in
                      every column. */}
                  <div className="border-border/60 mx-2 mt-2 space-y-1.5 border-b pb-2">
                    <span className="text-primary text-[10px] font-semibold tracking-wide uppercase">Rutinler</span>
                    {maxRoutineSlots === 0 ? (
                      <p className="text-muted-foreground py-1.5 text-center text-[10px]">—</p>
                    ) : (
                      <div className="space-y-1.5">
                        {dayRoutineTasks.map((task, i) => (
                          <WeekTaskCell
                            key={task.id}
                            task={task}
                            onClick={() => openTask(task)}
                            height={routineRows.heightOf(i)}
                            onResize={(deltaY) => routineRows.onResize(i, deltaY)}
                            onResizeEnd={() => routineRows.onResizeEnd(i, maxRoutineSlots)}
                          />
                        ))}
                        {Array.from({ length: maxRoutineSlots - dayRoutineTasks.length }).map((_, j) => {
                          const rowIndex = dayRoutineTasks.length + j;
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

                  {/* Section 2: Görevler -- everything else. Padded out to
                      maxGorevSlots exactly like the Rutinler lane above --
                      a strict grid across the whole board, not just the
                      routine lane. */}
                  <div className="flex flex-col gap-1.5 p-2">
                    <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Görevler</span>
                    {maxGorevSlots === 0 ? (
                      <p className="text-muted-foreground flex min-h-[80px] items-center justify-center rounded-md border border-dashed py-6 text-center text-xs">
                        —
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {dayRegularTasks.map((task, i) => (
                          <WeekTaskCell
                            key={task.id}
                            task={task}
                            onClick={() => openTask(task)}
                            height={taskRows.heightOf(i)}
                            onResize={(deltaY) => taskRows.onResize(i, deltaY)}
                            onResizeEnd={() => taskRows.onResizeEnd(i, maxGorevSlots)}
                          />
                        ))}
                        {Array.from({ length: maxGorevSlots - dayRegularTasks.length }).map((_, j) => {
                          const rowIndex = dayRegularTasks.length + j;
                          return (
                            <div
                              key={`gorev-placeholder-${rowIndex}`}
                              aria-hidden
                              style={{ height: taskRows.heightOf(rowIndex) }}
                              className="border-border/40 rounded-md border border-dashed"
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <DybFooter tasks={dayTasks} />
                </div>
              );
              });
            })()}
          </div>
        </div>

        <WeeklyDybTotal tasks={tasks} />
        </>
      )}

      <TaskModal
        task={activeTask}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={handleSaved}
        initialStep={modalStep}
        openKey={modalOpenKey}
        examType={examType}
      />
    </div>
  );
}

// D/Y/B for everything scored in this day -- mirrors the coach's own
// DybFooter (schedule-board.tsx) exactly; ported rather than shared, per
// this app's per-panel duplication convention. sumTaskCounts itself is
// shared (lib/scoring.ts) since a drifted copy of that formula would
// show different totals to coach and student for identical data.
function DybFooter({ tasks }: { tasks: StudentTask[] }) {
  const { correct, wrong, empty } = sumTaskCounts(tasks);
  const minutes = sumTaskDuration(tasks);
  return (
    <div className="border-border/60 text-muted-foreground border-t px-2 py-1.5 text-[11px] tabular-nums">
      <div className="flex items-center justify-center gap-2">
        <span className="text-emerald-700">D:{correct}</span>
        <span className="text-rose-700">Y:{wrong}</span>
        <span className="text-amber-700">B:{empty}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-center">
        <span>Süre: {formatMinutesLabel(minutes)}</span>
      </div>
    </div>
  );
}

// Shared two-row shape for both the per-view grand totals below (today's
// and the week's) -- D/Y/B on top (unchanged from before), Toplam Süre
// underneath as its own row, per this app's "second row, not a separate
// disconnected card" convention for this kind of summary.
function DybTotalCard({ label, tasks }: { label: string; tasks: StudentTask[] }) {
  const { correct, wrong, empty } = sumTaskCounts(tasks);
  const minutes = sumTaskDuration(tasks);
  return (
    <div className="mt-3 flex justify-center">
      <div className="border-border bg-muted/30 flex flex-col items-center gap-1.5 rounded-2xl border px-5 py-3 text-sm font-medium">
        <div className="flex items-center gap-4 tabular-nums">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</span>
          <span className="text-emerald-700">D:{correct}</span>
          <span className="text-rose-700">Y:{wrong}</span>
          <span className="text-amber-700">B:{empty}</span>
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
          <span className="font-semibold tracking-wide uppercase">Toplam Süre</span>
          <span>{formatMinutesLabel(minutes)}</span>
        </div>
      </div>
    </div>
  );
}

// Grand total across today's tasks (coach-assigned + custom/extra).
function TodayDybTotal({ tasks }: { tasks: StudentTask[] }) {
  return <DybTotalCard label="Günlük Toplam" tasks={tasks} />;
}

// Grand total across all 7 days.
function WeeklyDybTotal({ tasks }: { tasks: StudentTask[] }) {
  return <DybTotalCard label="Haftalık Toplam" tasks={tasks} />;
}

// "Geçmiş Programlar" archive -- every past week that actually has
// assigned tasks, fetched on open rather than pre-loaded so it can't go
// stale within a long session. Mirrors the coach's own PastWeeksDropdown
// (app/coach/students/[id]/schedule/schedule-board.tsx) exactly; ported
// rather than shared, per this app's per-panel duplication convention.
function PastWeeksDropdown({
  currentWeekStart,
  onSelectWeek,
}: {
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
        setWeeks(await getPastWeeksForStudent());
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
