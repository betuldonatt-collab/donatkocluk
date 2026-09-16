"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Lock, MinusCircle, PlayCircle, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { autoCalcMissingField, computeAutoTaskStatus, mergeDualTaskStatus, type DualPartStatus } from "@/lib/count-fields";
import { findCourseById, TRACK_LABELS, type Course, type Track } from "@/lib/curriculum";
import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  TYT_SUBJECT_GROUPS,
  coursesForAytGroup,
  coursesForGroup,
  inferAytTrackFromScores,
} from "@/lib/curriculum/subject-groups";
import { cn } from "@/lib/utils";
import {
  getTaskTopicMistakes,
  saveTaskAnalysis,
  setVideoLinkWatched,
  updateTaskProgress,
  type TaskProgressPatch,
} from "../../actions";
import { TASK_TYPE_LABELS, type StudentTask, type SubjectScore, type TopicMistake } from "./types";
import { TopicMistakeSelector } from "./topic-mistake-selector";

type Step = "form" | "analysis";

export function TaskModal({
  task,
  open,
  onOpenChange,
  onSaved,
  initialStep = "form",
  openKey,
}: {
  task: StudentTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (task: StudentTask) => void;
  initialStep?: Step;
  // Bumped by the caller on every explicit "open" action, so reopening the
  // *same* task (even mid-flow, e.g. after finishing the analysis step)
  // always starts from a clean slate instead of resuming stale local state.
  openKey?: number;
}) {
  // Any task type that renders the Toplam/Doğru/Yanlış/Boş (or per-subject)
  // count grids needs the wider container -- narrowing this to just
  // branch/general exam left question_bank's identical 4-column grid
  // squeezed into the default max-w-sm dialog, overflowing to the right.
  // A "dual" video/topic-study task (one that also carries a question-
  // count target, see isDual in TaskModalBody) renders that same grid
  // too, stacked below its manual status selector.
  const needsWideModal =
    task?.task_type === "branch_exam" ||
    task?.task_type === "general_exam" ||
    task?.task_type === "question_bank" ||
    ((task?.task_type === "video" || task?.task_type === "topic_study") && task?.total_count !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(needsWideModal && "sm:max-w-lg")}>
        {task && (
          <TaskModalBody
            key={`${task.id}:${initialStep}:${openKey ?? 0}`}
            task={task}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
            initialStep={initialStep}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// The browser's own `min={0}` on a number input only blocks the spinner
// arrows, not direct keyboard entry (a student can still type "-5") --
// stripping anything but digits on every keystroke is a stronger
// guarantee than relying on the input's own min/type alone.
function sanitizeDigits(v: string) {
  return v.replace(/[^0-9]/g, "");
}

function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(sanitizeDigits(e.target.value))}
        className="bg-background"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <p className="border-input bg-muted/30 flex h-9 items-center rounded-md border px-3 text-sm tabular-nums">
        {value ?? "—"}
      </p>
    </div>
  );
}

const STATUS_BUTTON_META: Record<
  DualPartStatus,
  { label: string; Icon: typeof CheckCircle2; selectedClass: string; idleClass: string }
> = {
  done: {
    label: "Yapıldı",
    Icon: CheckCircle2,
    selectedClass: "border-emerald-500 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700",
    idleClass: "border-emerald-300 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
  },
  half_done: {
    label: "Yarım Yapıldı",
    Icon: MinusCircle,
    selectedClass: "border-amber-500 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 hover:text-amber-700",
    idleClass: "border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700",
  },
  not_done: {
    label: "Yapılmadı",
    Icon: XCircle,
    selectedClass: "border-rose-500 bg-rose-500/10 text-rose-700 hover:bg-rose-500/10 hover:text-rose-700",
    idleClass: "border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700",
  },
};

const STATUS_BANNER_CLASS: Record<DualPartStatus, string> = {
  done: "bg-emerald-500/10 text-emerald-700",
  half_done: "bg-amber-500/10 text-amber-700",
  not_done: "bg-rose-500/10 text-rose-700",
};

// Used two ways: as an immediate one-click save action (single-part tasks
// -- video/topic-study with no question-count target, or a free-form
// extra task -- see handleMarkStatus, `selected` omitted so it never
// shows a persistent highlight) and as a persistent selector (a dual
// task's top section, `selected` reflects manualStatus) where clicking
// only stages the pick for the shared Kaydet button below.
function ManualStatusButton({
  status,
  selected,
  onClick,
  disabled,
}: {
  status: DualPartStatus;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { label, Icon, selectedClass, idleClass } = STATUS_BUTTON_META[status];
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className={cn("gap-1.5", selected ? selectedClass : idleClass)}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
}

const EMPTY_SUBJECT_SCORE: SubjectScore = { correct: null, wrong: null, empty: null };

function toNumberOrNull(v: string) {
  return v.trim() === "" ? null : Number(v);
}

// General-exam tasks have no course_id -- the TYT/AYT track lives only in
// the title text ("TYT Genel Deneme - ..." / "AYT Genel Deneme - ..."), the
// same convention the coach side uses to build/parse it.
function parseGeneralExamTrack(title: string): "tyt" | "ayt" {
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

function subjectGroupsFor(
  examTrack: "tyt" | "ayt",
  aytTrack: Track | null,
): { key: string; label: string; courseIds: string[] }[] {
  if (examTrack === "tyt") return TYT_SUBJECT_GROUPS;
  if (aytTrack) return AYT_SUBJECT_GROUPS_BY_TRACK[aytTrack];
  return [];
}

function coursesForActiveGroup(examTrack: "tyt" | "ayt", aytTrack: Track | null, key: string): Course[] {
  if (examTrack === "tyt") return coursesForGroup(key as (typeof TYT_SUBJECT_GROUPS)[number]["key"]);
  if (aytTrack) return coursesForAytGroup(aytTrack, key);
  return [];
}

function TaskModalBody({
  task,
  onOpenChange,
  onSaved,
  initialStep,
}: {
  task: StudentTask;
  onOpenChange: (open: boolean) => void;
  onSaved: (task: StudentTask) => void;
  initialStep: Step;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [totalCount, setTotalCount] = useState(task.total_count?.toString() ?? "");
  const [correctCount, setCorrectCount] = useState(task.correct_count?.toString() ?? "");
  const [wrongCount, setWrongCount] = useState(task.wrong_count?.toString() ?? "");
  const [emptyCount, setEmptyCount] = useState(task.empty_count?.toString() ?? "");
  const [durationMinutes, setDurationMinutes] = useState(task.duration_minutes?.toString() ?? "");
  // A video link created before this feature shipped has no `watched` key
  // at all in its stored jsonb -- normalized to false here so Checkbox
  // below always gets a real boolean, never undefined.
  const [videoLinks, setVideoLinks] = useState(() => task.video_links.map((l) => ({ ...l, watched: l.watched ?? false })));

  // Optimistic toggle, reverted on failure -- doesn't go through the
  // form's own saving/handleSaveSimple flow since it's an independent,
  // immediate write (setVideoLinkWatched), not part of this task's
  // counts/status being saved.
  async function handleToggleWatched(url: string, watched: boolean) {
    const previous = videoLinks;
    setVideoLinks((prev) => prev.map((l) => (l.url === url ? { ...l, watched } : l)));
    try {
      const updated = await setVideoLinkWatched(task.id, url, watched);
      onSaved(updated as StudentTask);
    } catch (e) {
      setVideoLinks(previous);
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    }
  }

  const showSubjectScores = task.task_type === "general_exam";
  const examTrack = task.task_type === "general_exam" ? parseGeneralExamTrack(task.title) : "tyt";

  const [aytTrack, setAytTrack] = useState<Track | null>(() => inferAytTrackFromScores(task.subject_scores));
  const activeGroups = showSubjectScores ? subjectGroupsFor(examTrack, aytTrack) : [];

  const [subjectInputs, setSubjectInputs] = useState<Record<string, { correct: string; wrong: string; empty: string }>>(
    () =>
      Object.fromEntries(
        activeGroups.map((g) => {
          const existing = task.subject_scores?.[g.key] ?? EMPTY_SUBJECT_SCORE;
          return [
            g.key,
            {
              correct: existing.correct?.toString() ?? "",
              wrong: existing.wrong?.toString() ?? "",
              empty: existing.empty?.toString() ?? "",
            },
          ];
        }),
      ),
  );

  function handleAytTrackChange(next: Track) {
    setAytTrack(next);
    setSubjectInputs(
      Object.fromEntries(
        AYT_SUBJECT_GROUPS_BY_TRACK[next].map((g) => [g.key, { correct: "", wrong: "", empty: "" }]),
      ),
    );
  }

  const [mistakes, setMistakes] = useState<TopicMistake[]>([]);
  const [mistakesLoaded, setMistakesLoaded] = useState(false);

  const isTytBranchExam = task.task_type === "branch_exam" && task.course_id?.startsWith("tyt-");
  const showAnalysisFlow = task.task_type === "branch_exam" || task.task_type === "general_exam";

  // Whether this video/topic-study task also carries a real question-count
  // target (set by the coach or the student at creation time -- see
  // task-form-fields.tsx / add-custom-task-dialog.tsx). If so, it's a
  // "dual" task: the student logs BOTH a manual video/topic-study status
  // AND question counts in this same modal, merged into one overall
  // status (mergeDualTaskStatus, lib/count-fields.ts).
  const isDual = (task.task_type === "video" || task.task_type === "topic_study") && task.total_count !== null;

  // A coach-assigned question_bank/branch_exam task with NO question-count
  // target at all -- a duration-only target, e.g. "Soru Çözümü · 60 dk".
  // computeAutoTaskStatus can never derive a status here (there's no
  // numeric target to compare counts against, and never will be -- Toplam
  // stays permanently null/coach-controlled), so per product decision this
  // must never auto-complete from counts: the student logs Doğru/Yanlış/
  // Boş freely, same as any question-count task, but declares the status
  // itself explicitly, same selector a dual task's manual half uses.
  const isDurationOnlyTarget =
    (task.task_type === "question_bank" || task.task_type === "branch_exam") &&
    task.is_coach_assigned &&
    task.total_count === null;

  // Pure question-count tasks (question_bank, branch_exam, general_exam)
  // are entirely score-driven -- their status is always computed from the
  // entered counts, so they never show the manual status buttons. A
  // duration-only target is the one exception (see above).
  const isPureCountType =
    (task.task_type === "question_bank" || task.task_type === "branch_exam" || task.task_type === "general_exam") &&
    !isDurationOnlyTarget;
  const showManualButtons = !isPureCountType;
  const showFlatCounts = task.task_type === "question_bank" || task.task_type === "branch_exam" || isDual;

  // Needs the persistent top selector + shared Kaydet flow (merged status,
  // required before saving) rather than the plain auto-status path or the
  // three single-part tasks' immediate-save buttons.
  const needsManualStatusSelector = isDual || isDurationOnlyTarget;

  const [manualStatus, setManualStatus] = useState<DualPartStatus | null>(() =>
    needsManualStatusSelector && (task.status === "done" || task.status === "half_done" || task.status === "not_done")
      ? task.status
      : null,
  );

  const branchCourse = task.task_type === "branch_exam" ? findCourseById(task.course_id) : null;

  const analysisGroups: { label: string; courses: Course[] }[] =
    task.task_type === "general_exam"
      ? activeGroups
          .map((g) => ({ label: g.label, courses: coursesForActiveGroup(examTrack, aytTrack, g.key) }))
          .filter((g) => g.courses.length > 0)
      : branchCourse
        ? [{ label: branchCourse.name, courses: [branchCourse] }]
        : [];

  const missedCount = showSubjectScores
    ? activeGroups.reduce((sum, g) => {
        const s = subjectInputs[g.key];
        if (!s) return sum;
        return sum + (Number(s.wrong) || 0) + (Number(s.empty) || 0);
      }, 0)
    : (Number(wrongCount) || 0) + (Number(emptyCount) || 0);

  const trackNotChosen = showSubjectScores && examTrack === "ayt" && !aytTrack;

  // Doğru+Yanlış+Boş no longer has to add up to Toplam -- that's exactly
  // what "partially completed" means now (see computeAutoTaskStatus,
  // lib/count-fields.ts), so unlike before, a student who's short of the
  // assigned total is never blocked from saving. Only shown once they've
  // actually entered something (not on a freshly-opened, untouched form),
  // and null whenever there's no known Toplam to compare against at all.
  const hasEnteredCounts = correctCount.trim() !== "" || wrongCount.trim() !== "" || emptyCount.trim() !== "";
  const countStatus =
    showFlatCounts && hasEnteredCounts
      ? computeAutoTaskStatus(toNumberOrNull(totalCount), Number(correctCount) || 0, Number(wrongCount) || 0, Number(emptyCount) || 0)
      : null;

  // What Kaydet will actually persist: for a dual task, the merge of the
  // manual (video/topic-study) pick above and the question-count result
  // (mergeDualTaskStatus) -- falls back to whichever half is known when
  // only one has been touched so far. A duration-only target task also
  // goes through this branch, but its countStatus is always null (no
  // numeric target to derive one from), so it simplifies to exactly
  // manualStatus -- never auto-completed from counts alone. Every other
  // type is just the plain count-based preview, unchanged from before.
  const overallStatusPreview: DualPartStatus | null = needsManualStatusSelector
    ? manualStatus && countStatus
      ? mergeDualTaskStatus(manualStatus, countStatus)
      : (manualStatus ?? countStatus)
    : countStatus;

  // If exactly 3 of Toplam/Doğru/Yanlış/Boş are filled, auto-fills the 4th
  // (lib/count-fields.ts) so the student doesn't have to do the arithmetic.
  function handleCountFieldChange(field: "total" | "correct" | "wrong" | "empty", value: string) {
    const next = {
      total: field === "total" ? value : totalCount,
      correct: field === "correct" ? value : correctCount,
      wrong: field === "wrong" ? value : wrongCount,
      empty: field === "empty" ? value : emptyCount,
    };
    setTotalCount(next.total);
    setCorrectCount(next.correct);
    setWrongCount(next.wrong);
    setEmptyCount(next.empty);
    const derived = autoCalcMissingField({
      total: toNumberOrNull(next.total),
      correct: toNumberOrNull(next.correct),
      wrong: toNumberOrNull(next.wrong),
      empty: toNumberOrNull(next.empty),
    });
    // Coach-assigned Toplam is never student-editable (it renders as
    // ReadOnlyField below, not Field) and must never silently change --
    // for a coach-assigned task with NO count target at all (a duration-
    // only target, e.g. "Soru Çözümü · 60 dk"), Toplam stays permanently
    // null/unfilled, so entering Doğru+Yanlış+Boş makes exactly 3 of 4
    // fields "filled" and this auto-calc used to derive and silently set
    // a Toplam here anyway -- invisible in the UI (it still shows the
    // real, unchanged "—" from task.total_count), but included in the
    // save payload, where the server correctly rejects it as an attempt
    // to change a coach-assigned total. That rejection is what surfaced
    // to the student as a hard crash (React error #441) instead of just
    // saving. See app/student/actions.ts's updateTaskProgress guard.
    if (!task.is_coach_assigned && derived.total !== undefined) setTotalCount(String(derived.total));
    if (derived.correct !== undefined) setCorrectCount(String(derived.correct));
    if (derived.wrong !== undefined) setWrongCount(String(derived.wrong));
    if (derived.empty !== undefined) setEmptyCount(String(derived.empty));
  }

  useEffect(() => {
    if (step !== "analysis" || mistakesLoaded) return;
    getTaskTopicMistakes(task.id).then((rows) => {
      setMistakes(rows.map((r) => ({ course_id: r.course_id, topic_id: r.topic_id, status: r.status })));
      setMistakesLoaded(true);
    });
  }, [step, mistakesLoaded, task.id]);

  function buildCountsPatch(): TaskProgressPatch {
    const patch: TaskProgressPatch = {};
    if (showFlatCounts) {
      patch.total_count = toNumberOrNull(totalCount);
      patch.correct_count = toNumberOrNull(correctCount);
      patch.wrong_count = toNumberOrNull(wrongCount);
      patch.empty_count = toNumberOrNull(emptyCount);
      if (isTytBranchExam) patch.duration_minutes = toNumberOrNull(durationMinutes);
      // No explicit status here for a pure count type -- updateTaskProgress
      // computes it itself from these same counts (computeAutoTaskStatus),
      // the same rule the live hint below previews. A task that needs the
      // manual selector (dual, or a duration-only target) DOES set
      // patch.status below; the server merges/respects it instead of
      // overwriting it with an auto-computed one.
    }
    if (showSubjectScores) {
      const perSubject = activeGroups.map((g) => ({
        correct: toNumberOrNull(subjectInputs[g.key].correct),
        wrong: toNumberOrNull(subjectInputs[g.key].wrong),
        empty: toNumberOrNull(subjectInputs[g.key].empty),
      }));
      patch.subject_scores = Object.fromEntries(activeGroups.map((g, i) => [g.key, perSubject[i]]));
      // Also roll the per-subject numbers up into the same flat total/
      // correct/wrong/empty columns question_bank/branch_exam use --
      // otherwise a student-entered general exam has no D/Y/B a coach's
      // own kanban card (which reads total_count, not subject_scores) can
      // ever show, while a coach-entered one (saveCoachTrialResults writes
      // only the flat columns) would look equally blank on the student's
      // own dashboard card. Always self-consistent by construction (total
      // is the sum of the other three), so this can never trip the
      // server's own countsAreConsistent refine.
      patch.total_count = perSubject.reduce((sum, s) => sum + (s.correct ?? 0) + (s.wrong ?? 0) + (s.empty ?? 0), 0);
      patch.correct_count = perSubject.reduce((sum, s) => sum + (s.correct ?? 0), 0);
      patch.wrong_count = perSubject.reduce((sum, s) => sum + (s.wrong ?? 0), 0);
      patch.empty_count = perSubject.reduce((sum, s) => sum + (s.empty ?? 0), 0);
      patch.status = "done";
    }
    if (needsManualStatusSelector) {
      // Guaranteed non-null here -- every save path first calls
      // blockedWithoutManualStatus(), which refuses to proceed at all
      // while manualStatus is still unset.
      patch.status = manualStatus!;
    }
    return patch;
  }

  // Shared guard for every save path that ends up calling
  // buildCountsPatch() (Kaydet, "Devam Et: Konu Analizi", "Analizi Sonra
  // Yap") -- a dual task or a duration-only target task both require an
  // explicit manual status pick before any of them can proceed, not just
  // the plain Kaydet button.
  function blockedWithoutManualStatus(): boolean {
    if (needsManualStatusSelector && manualStatus === null) {
      setError("Kaydetmeden önce yukarıdan görev durumunu seç.");
      return true;
    }
    return false;
  }

  async function handleSaveSimple() {
    if (blockedWithoutManualStatus()) return;
    setSaving(true);
    setError(null);
    try {
      const patch = buildCountsPatch();
      if (showAnalysisFlow) patch.analysis_pending = false;
      const updated = await updateTaskProgress(task.id, patch);
      onSaved(updated as StudentTask);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  // Single-part tasks (video/topic-study with no question-count target, or
  // a free-form extra task) have no counts to derive a status from -- these
  // three buttons are the student's only, direct way to set one. Each is
  // an immediate save (unlike a dual task's top selector, which only
  // stages a pick for the shared Kaydet button), matching the one-click
  // "I didn't do this" action this replaces -- distinct from just leaving
  // a task untouched (still "pending"), so the coach can tell "forgotten"
  // from "consciously reported" instead of both looking identical.
  async function handleMarkStatus(status: DualPartStatus) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTaskProgress(task.id, { status, completed: status === "done" });
      onSaved(updated as StudentTask);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }


  async function handleGoToAnalysis() {
    if (blockedWithoutManualStatus()) return;
    setSaving(true);
    setError(null);
    try {
      const patch = buildCountsPatch();
      patch.analysis_pending = true;
      const updated = await updateTaskProgress(task.id, patch);
      onSaved(updated as StudentTask);
      setStep("analysis");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeferAnalysis() {
    if (blockedWithoutManualStatus()) return;
    setSaving(true);
    setError(null);
    try {
      const patch = buildCountsPatch();
      patch.analysis_pending = true;
      const updated = await updateTaskProgress(task.id, patch);
      onSaved(updated as StudentTask);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAnalysis() {
    setSaving(true);
    setError(null);
    try {
      const updated = await saveTaskAnalysis(task.id, mistakes, false);
      onSaved(updated as StudentTask);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeferFromAnalysisStep() {
    setSaving(true);
    setError(null);
    try {
      const updated = await saveTaskAnalysis(task.id, mistakes, true);
      onSaved(updated as StudentTask);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  // The week this task belongs to has been locked by the coach -- render
  // strictly read-only regardless of which step/type this task is. RLS
  // (student_tasks_student_update/insert_custom/delete_custom, migration
  // 0037) already rejects the underlying writes; this is purely so the
  // student sees WHY nothing here is editable instead of clicks silently
  // doing nothing.
  if (task.week_locked) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            {TASK_TYPE_LABELS[task.task_type]}
            {task.description ? ` — ${task.description}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            <Lock className="size-3.5 shrink-0" />
            Bu haftanın görevleri koçun tarafından kilitlendi. Sadece görüntüleyebilirsin.
          </div>

          {(task.resource_names.length > 0 || task.duration_minutes !== null) && (
            <div className="space-y-1 text-sm">
              {task.resource_names.length > 0 && (
                <p className="text-foreground">
                  <span className="text-muted-foreground">Kaynak: </span>
                  {task.resource_names.join(" + ")}
                </p>
              )}
              {task.duration_minutes !== null && (
                <p className="text-foreground">
                  <span className="text-muted-foreground">Süre: </span>
                  {task.duration_minutes} dk
                </p>
              )}
            </div>
          )}

          {task.video_links.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-foreground text-sm font-medium">Video Linkleri</p>
              {task.video_links.map((link, i) => (
                <div key={link.url + i} className="border-border flex items-center gap-2 rounded-md border px-2.5 py-2">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", link.watched ? "bg-emerald-500" : "bg-muted-foreground/30")}
                    aria-label={link.watched ? "İzlendi" : "İzlenmedi"}
                  />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline"
                  >
                    {link.title || "Video"}
                  </a>
                </div>
              ))}
            </div>
          )}

          {showFlatCounts && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ReadOnlyField label="Toplam" value={task.total_count} />
              <ReadOnlyField label="Doğru" value={task.correct_count} />
              <ReadOnlyField label="Yanlış" value={task.wrong_count} />
              <ReadOnlyField label="Boş" value={task.empty_count} />
            </div>
          )}

          {showSubjectScores && task.subject_scores && (
            <div className="space-y-3">
              {Object.entries(task.subject_scores).map(([key, score]) => (
                <div key={key} className="space-y-1.5">
                  <p className="text-foreground text-sm font-medium">{key}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <ReadOnlyField label="Doğru" value={score.correct} />
                    <ReadOnlyField label="Yanlış" value={score.wrong} />
                    <ReadOnlyField label="Boş" value={score.empty} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-foreground text-sm">
            Görev Durumu:{" "}
            <span className="font-medium">
              {task.status === "done"
                ? "Yapıldı"
                : task.status === "half_done"
                  ? "Yarım Yapıldı"
                  : task.status === "not_done"
                    ? "Yapılmadı"
                    : "Bekliyor"}
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (step === "analysis") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{task.title} — Konu Analizi</DialogTitle>
          <DialogDescription>Hata yaptığın veya boş bıraktığın soruların konularını işaretle.</DialogDescription>
        </DialogHeader>

        {!mistakesLoaded ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Yükleniyor...</p>
        ) : analysisGroups.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Bu görev için konu listesi bulunamadı.
          </p>
        ) : (
          <TopicMistakeSelector groups={analysisGroups} selected={mistakes} onChange={setMistakes} />
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter className="items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep("form")}
            className="text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Geri
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleDeferFromAnalysisStep} disabled={saving}>
              Analizi Sonra Yap
            </Button>
            <Button type="button" onClick={handleSaveAnalysis} disabled={saving}>
              {saving ? "Kaydediliyor..." : "Analizi Kaydet"}
            </Button>
          </div>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{task.title}</DialogTitle>
        <DialogDescription>
          {TASK_TYPE_LABELS[task.task_type]}
          {task.description ? ` — ${task.description}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Kaynak (which book/resource the coach linked, if any) and the
            target/recorded süre -- previously invisible everywhere in the
            student panel, not just the compact card, not even here in the
            full detail view. isTytBranchExam is excluded: for that type
            duration_minutes is the student's OWN editable field further
            down (recording actual time taken), not a read-only coach
            target, so showing it twice here would be redundant/confusing. */}
        {(task.resource_names.length > 0 || (task.duration_minutes !== null && !isTytBranchExam)) && (
          <div className="space-y-1 text-sm">
            {task.resource_names.length > 0 && (
              <p className="text-foreground">
                <span className="text-muted-foreground">Kaynak: </span>
                {task.resource_names.join(" + ")}
              </p>
            )}
            {task.duration_minutes !== null && !isTytBranchExam && (
              <p className="text-foreground">
                <span className="text-muted-foreground">Süre: </span>
                {task.duration_minutes} dk
              </p>
            )}
          </div>
        )}

        {videoLinks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-foreground text-sm font-medium">Video Linkleri</p>
            {videoLinks.map((link, i) => (
              <div key={link.url + i} className="border-border flex items-center gap-2 rounded-md border px-2.5 py-2">
                <Checkbox
                  id={`video-watched-${i}`}
                  checked={link.watched}
                  onCheckedChange={(v) => handleToggleWatched(link.url, v === true)}
                />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary flex min-w-0 flex-1 items-center gap-1 truncate text-sm underline-offset-2 hover:underline"
                >
                  <PlayCircle className="size-3.5 shrink-0" />
                  <span className="truncate">{link.title || "Video"}</span>
                </a>
                {link.watched && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground size-7 shrink-0"
                    aria-label="İzlemedim olarak işaretle"
                    title="İzlemedim"
                    onClick={() => handleToggleWatched(link.url, false)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Persistent selector (not an immediate save -- Kaydet below
            saves this together with the counts): a dual task's video/
            topic-study half, or a duration-only target's own status,
            declared explicitly since there's no count target to ever
            auto-derive one from. */}
        {needsManualStatusSelector && (
          <div className="space-y-1.5">
            <Label>
              {task.task_type === "video"
                ? "Video Durumu"
                : task.task_type === "topic_study"
                  ? "Konu Çalışması Durumu"
                  : "Görev Durumu"}
            </Label>
            <div className="flex flex-wrap gap-2">
              <ManualStatusButton
                status="not_done"
                selected={manualStatus === "not_done"}
                onClick={() => setManualStatus("not_done")}
              />
              <ManualStatusButton
                status="half_done"
                selected={manualStatus === "half_done"}
                onClick={() => setManualStatus("half_done")}
              />
              <ManualStatusButton
                status="done"
                selected={manualStatus === "done"}
                onClick={() => setManualStatus("done")}
              />
            </div>
          </div>
        )}

        {showFlatCounts && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Coach-assigned Toplam is the coach's own call -- not
                editable here (mirrored server-side in updateTaskProgress
                and at the DB level, migration 0077). A self-created
                task's own Toplam stays editable, same as before. */}
            {task.is_coach_assigned ? (
              <ReadOnlyField label="Toplam" value={task.total_count} />
            ) : (
              <Field label="Toplam" value={totalCount} onChange={(v) => handleCountFieldChange("total", v)} />
            )}
            <Field label="Doğru" value={correctCount} onChange={(v) => handleCountFieldChange("correct", v)} />
            <Field label="Yanlış" value={wrongCount} onChange={(v) => handleCountFieldChange("wrong", v)} />
            <Field label="Boş" value={emptyCount} onChange={(v) => handleCountFieldChange("empty", v)} />
            {isTytBranchExam && (
              <Field
                label="Süre (dk)"
                value={durationMinutes}
                onChange={setDurationMinutes}
                className="col-span-2 sm:col-span-4"
              />
            )}
          </div>
        )}

        {/* Live preview of the status Kaydet will actually persist -- for
            a dual task this is the MERGE of the top selection and the
            counts above (mergeDualTaskStatus), not just the counts in
            isolation, so the hint never disagrees with what gets saved. */}
        {overallStatusPreview && (
          <div className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-xs", STATUS_BANNER_CLASS[overallStatusPreview])}>
            {(() => {
              const Icon = STATUS_BUTTON_META[overallStatusPreview].Icon;
              return <Icon className="size-3.5 shrink-0" />;
            })()}
            Bu haliyle görev <strong>{STATUS_BUTTON_META[overallStatusPreview].label}</strong> olarak işaretlenecek.
          </div>
        )}

        {showSubjectScores && (
          // Fixed min-h floor so the AYT track picker -> subject fields
          // swap doesn't collapse this region to 0 height between renders
          // (the picker unmounts the instant a track is chosen, the field
          // group mounts in the same tick).
          <div className="min-h-[52px]">
            {examTrack === "ayt" && !aytTrack && (
              <div className="space-y-1.5">
                <p className="text-foreground text-sm font-medium">Alan Seç</p>
                <div className="bg-secondary inline-flex w-fit rounded-lg p-1">
                  {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleAytTrackChange(t)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {TRACK_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeGroups.length > 0 && (
              <div className="space-y-3">
                {activeGroups.map((g) => (
                  <div key={g.key} className="space-y-1.5">
                    <p className="text-foreground text-sm font-medium">{g.label}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Field
                        label="Doğru"
                        value={subjectInputs[g.key].correct}
                        onChange={(v) =>
                          setSubjectInputs((prev) => ({ ...prev, [g.key]: { ...prev[g.key], correct: v } }))
                        }
                      />
                      <Field
                        label="Yanlış"
                        value={subjectInputs[g.key].wrong}
                        onChange={(v) =>
                          setSubjectInputs((prev) => ({ ...prev, [g.key]: { ...prev[g.key], wrong: v } }))
                        }
                      />
                      <Field
                        label="Boş"
                        value={subjectInputs[g.key].empty}
                        onChange={(v) =>
                          setSubjectInputs((prev) => ({ ...prev, [g.key]: { ...prev[g.key], empty: v } }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showAnalysisFlow && task.analysis_pending && (
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
            <AlertTriangle className="size-3.5 shrink-0" />
            Bu görevin konu analizi henüz tamamlanmadı.
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      {/* Forced flex-col at every breakpoint (overriding the shared
          DialogFooter's sm:flex-row) -- sm: is a VIEWPORT media query, not
          a container query, so it was firing on any normal-width desktop
          window regardless of this dialog's own max-w-lg cap, cramming all
          5 buttons into one un-wrapped row that burst past the dialog's
          right edge. Two explicit flex-wrap rows below keep each button
          group contained to the dialog's actual width, wrapping onto a
          second line if it ever gets tight instead of overflowing. */}
      <DialogFooter className="flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">
            İptal
          </Button>
          {/* Single-part tasks (not dual, not a duration-only target, not
              pure question-count) have no Kaydet row at all below -- these
              three ARE the save action, each an immediate mark-and-close
              (handleMarkStatus). */}
          {showManualButtons && !needsManualStatusSelector && (
            <>
              <ManualStatusButton status="not_done" onClick={() => handleMarkStatus("not_done")} disabled={saving} />
              <ManualStatusButton status="half_done" onClick={() => handleMarkStatus("half_done")} disabled={saving} />
              <ManualStatusButton status="done" onClick={() => handleMarkStatus("done")} disabled={saving} />
            </>
          )}
        </div>

        {/* Pure question-count tasks and tasks needing the manual selector
            (dual, or a duration-only target) both save via Kaydet (the
            manual half/status was already picked above, in the body -- see
            blockedWithoutManualStatus) -- single-part tasks have nothing
            left to Kaydet once the three buttons above cover the save. */}
        {!(showManualButtons && !needsManualStatusSelector) && (
          <div className="flex flex-wrap justify-end gap-2">
            {/* "Analizi Sonra Yap" stays mounted at all times for
                analysis-flow tasks -- only its visibility toggles with
                missedCount, so this row's button count (and therefore its
                height) never changes while the student is mid-keystroke in
                the Yanlış/Boş fields above. Removing/adding the button here
                would resize the footer and re-center the whole dialog under
                the focused input. */}
            {showAnalysisFlow && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeferAnalysis}
                disabled={saving || trackNotChosen}
                className={cn(missedCount === 0 && "invisible")}
              >
                Analizi Sonra Yap
              </Button>
            )}
            <Button
              type="button"
              onClick={showAnalysisFlow && missedCount > 0 ? handleGoToAnalysis : handleSaveSimple}
              disabled={saving || trackNotChosen}
            >
              {saving ? "Kaydediliyor..." : showAnalysisFlow && missedCount > 0 ? "Devam Et: Konu Analizi" : "Kaydet"}
            </Button>
          </div>
        )}
      </DialogFooter>
    </>
  );
}
