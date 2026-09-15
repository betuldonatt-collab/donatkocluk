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
import { weekDates } from "@/lib/date";
import { sumTaskCounts, sumTaskDuration } from "@/lib/scoring";
import { updateScheduleDensity, type ScheduleDensity } from "@/lib/schedule-density";
import { deleteCustomTask, getPastWeeksForStudent, getTasksForWeek, updateTaskOrder } from "../../actions";
import { AddCustomTaskDialog } from "./add-custom-task-dialog";
import { PendingAnalysisAlert } from "./pending-analysis-alert";
import { SortableTaskCard } from "./sortable-task-card";
import { TaskModal } from "./task-modal";
import type { StudentTask } from "./types";
import { WEEK_CELL_DENSITY_CONFIG, WeekTaskCell } from "./week-task-cell";

type ViewMode = "today" | "week";
type ModalStep = "form" | "analysis";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const MONTH_LABELS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function getWeekDays(referenceIso: string) {
  return weekDates(referenceIso).map((date, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `${DAY_LABELS[i]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

// "Görünüm" (card density) toggle options -- see the density state and
// WEEK_CELL_DENSITY_CONFIG (week-task-cell.tsx). Mirrors the coach panel's
// own DENSITY_OPTIONS (schedule-board.tsx) exactly; ported rather than
// shared, per this app's per-panel duplication convention.
const DENSITY_OPTIONS: { value: ScheduleDensity; label: string }[] = [
  { value: "compact", label: "Kompakt" },
  { value: "medium", label: "Orta" },
  { value: "comfortable", label: "Rahat" },
];

export function TaskBoard({
  today,
  weekDays: initialWeekDays,
  initialTasks,
  todayLocked,
  initialDensity,
}: {
  today: string;
  weekDays: { date: string; label: string }[];
  initialTasks: StudentTask[];
  todayLocked: boolean;
  // The student's own schedule_density (profiles), fetched server-side by
  // app/student/page.tsx so the very first render already matches their
  // last choice -- no flash of the wrong density while a client fetch
  // resolves. Only ever affects the "Bu Hafta" grid -- the "Bugün" list
  // (SortableTaskCard) isn't a grid, so there's no alignment concern to
  // adjust for there.
  initialDensity: ScheduleDensity;
}) {
  const [tasks, setTasks] = useState(initialTasks);
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
  // Persisted to profiles.schedule_density (see lib/schedule-density.ts)
  // so it follows the student across devices. Optimistic, reverted on
  // failure -- same shape as every other quick toggle in this app.
  const [density, setDensity] = useState<ScheduleDensity>(initialDensity);

  function handleDensityChange(next: ScheduleDensity) {
    const previous = density;
    setDensity(next);
    updateScheduleDensity(next).catch((e) => {
      setDensity(previous);
      toast.error(e instanceof Error ? e.message : "Görünüm tercihi kaydedilemedi.");
    });
  }

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
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleCreated(task: StudentTask) {
    setTasks((prev) => [...prev, task]);
  }

  async function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
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
  // Same split as the coach's own schedule board (Rutinler vs Görevler,
  // routed purely by course_id -- see isRoutineCourseId) so a student
  // sees their day grouped exactly the way the coach assigned it.
  const routineTasks = coachTasks.filter((t) => isRoutineCourseId(t.course_id));
  const regularTasks = coachTasks.filter((t) => !isRoutineCourseId(t.course_id));

  return (
    <div className="space-y-6">
      <PendingAnalysisAlert tasks={tasks} onOpenTask={(t) => openTask(t, "analysis")} />

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

        {/* Week navigation -- only meaningful once "Bu Hafta" is showing.
            A student previously had no way to reach a past (and possibly
            locked) week at all once it scrolled off the default view. */}
        {view === "week" && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, -7)))}
              aria-label="Önceki hafta"
              disabled={weekLoading}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <input
              type="date"
              value={weekDays[0].date}
              onChange={(e) => e.target.value && loadWeek(getWeekDays(e.target.value))}
              disabled={weekLoading}
              aria-label="Belirli bir haftaya git"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => loadWeek(getWeekDays(addDaysISO(weekDays[0].date, 7)))}
              aria-label="Sonraki hafta"
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

      {view === "week" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">Görünüm:</span>
          <div className="bg-secondary inline-flex w-fit rounded-lg p-1">
            {DENSITY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleDensityChange(value)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  density === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "week" && weekLocked && (
        <div className="border-border bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Lock className="size-4 shrink-0" />
          Bu hafta koçun tarafından kilitlendi -- sadece görüntüleyebilirsin.
        </div>
      )}

      {view === "today" ? (
        <>
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
              <AddCustomTaskDialog taskDate={today} onCreated={handleCreated} disabled={todayLocked} />
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
              // The widest Rutinler lane across the currently-loaded 7-day
              // window -- every day pads its own lane out to this many
              // slots (real cells, then empty fixed-height placeholders) so
              // the Görevler section starts at the same Y in every column.
              // Mirrors the coach's own schedule-board.tsx (maxRoutineSlots)
              // exactly; ported rather than shared, per this app's
              // per-panel duplication convention.
              const maxRoutineSlots = Math.max(
                0,
                ...weekDays.map((day) => tasks.filter((t) => t.task_date === day.date && isRoutineCourseId(t.course_id)).length),
              );
              return weekDays.map((day) => {
              const dayTasks = tasks.filter((t) => t.task_date === day.date).sort(byOrder);
              // Same Rutinler/Görevler split as the "Bugün" view and the
              // coach's own schedule board (isRoutineCourseId), applied
              // per day here.
              const dayRoutineTasks = dayTasks.filter((t) => isRoutineCourseId(t.course_id));
              const dayRegularTasks = dayTasks.filter((t) => !isRoutineCourseId(t.course_id));
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
                        {dayRoutineTasks.map((task) => (
                          <WeekTaskCell key={task.id} task={task} onClick={() => openTask(task)} density={density} />
                        ))}
                        {Array.from({ length: maxRoutineSlots - dayRoutineTasks.length }).map((_, i) => (
                          <div
                            key={`routine-placeholder-${i}`}
                            aria-hidden
                            className={cn(WEEK_CELL_DENSITY_CONFIG[density].heightClass, "border-border/40 rounded-md border border-dashed")}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Section 2: Görevler -- everything else. */}
                  <div className="flex flex-col gap-1.5 p-2">
                    <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Görevler</span>
                    {dayRegularTasks.length === 0 ? (
                      <p className="text-muted-foreground flex min-h-[80px] items-center justify-center rounded-md border border-dashed py-6 text-center text-xs">
                        —
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {dayRegularTasks.map((task) => (
                          <WeekTaskCell key={task.id} task={task} onClick={() => openTask(task)} density={density} />
                        ))}
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
