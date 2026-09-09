"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Lock } from "lucide-react";

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
import { autoCalcMissingField, countsAreConsistent } from "@/lib/count-fields";
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
  const needsWideModal =
    task?.task_type === "branch_exam" || task?.task_type === "general_exam" || task?.task_type === "question_bank";

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
  const [completed, setCompleted] = useState(task.completed);

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
  const showCounts = task.task_type === "question_bank" || task.task_type === "branch_exam";
  const showCompletedToggle =
    task.task_type === "video" || task.task_type === "topic_study" || task.task_type === "extra_custom";
  const showAnalysisFlow = task.task_type === "branch_exam" || task.task_type === "general_exam";

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

  // True only once all 4 fields are filled and manually overridden to not
  // add up -- auto-calc below already keeps the exactly-3-filled case
  // consistent by construction, so this only ever catches a genuine,
  // fully-entered mismatch that needs to block saving.
  const totalMismatch =
    showCounts &&
    !countsAreConsistent({
      total: toNumberOrNull(totalCount),
      correct: toNumberOrNull(correctCount),
      wrong: toNumberOrNull(wrongCount),
      empty: toNumberOrNull(emptyCount),
    });

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
    if (derived.total !== undefined) setTotalCount(String(derived.total));
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
    if (showCounts) {
      patch.total_count = toNumberOrNull(totalCount);
      patch.correct_count = toNumberOrNull(correctCount);
      patch.wrong_count = toNumberOrNull(wrongCount);
      patch.empty_count = toNumberOrNull(emptyCount);
      if (isTytBranchExam) patch.duration_minutes = toNumberOrNull(durationMinutes);
      patch.status = "done";
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
    if (showCompletedToggle) {
      patch.completed = completed;
      patch.status = completed ? "done" : "pending";
    }
    return patch;
  }

  async function handleSaveSimple() {
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

  // Explicit "I didn't do this" -- distinct from just leaving a task
  // untouched (still "pending"), so the coach can tell "forgotten" from
  // "consciously skipped" instead of both looking identical.
  async function handleMarkNotDone() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTaskProgress(task.id, { status: "not_done", completed: false });
      onSaved(updated as StudentTask);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  // "I did some of it" -- reuses whatever counts/subject-scores/completed
  // state is already filled in the form (same as a full save), just
  // marked half_done instead of done, so partial numbers aren't lost.
  async function handleMarkHalfDone() {
    setSaving(true);
    setError(null);
    try {
      const patch = buildCountsPatch();
      patch.status = "half_done";
      const updated = await updateTaskProgress(task.id, patch);
      onSaved(updated as StudentTask);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGoToAnalysis() {
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

          {showCounts && (
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

          {showCompletedToggle && (
            <p className="text-foreground text-sm">
              Durum: <span className="font-medium">{task.completed ? "Tamamlandı" : "Tamamlanmadı"}</span>
            </p>
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
        {showCounts && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Toplam" value={totalCount} onChange={(v) => handleCountFieldChange("total", v)} />
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

        {totalMismatch && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" />
            Toplam, Doğru + Yanlış + Boş toplamına eşit değil.
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

        {showCompletedToggle && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="task-completed"
              checked={completed}
              onCheckedChange={(v) => setCompleted(v === true)}
            />
            <Label htmlFor="task-completed">
              {task.task_type === "video"
                ? "İzledim"
                : task.task_type === "topic_study"
                  ? "Tamamladım"
                  : "Tamamlandı"}
            </Label>
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
          <Button
            type="button"
            variant="outline"
            onClick={handleMarkNotDone}
            disabled={saving}
            className="border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            Yapılmadı
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleMarkHalfDone}
            disabled={saving || totalMismatch}
            className="border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
          >
            Yarım Yapıldı
          </Button>
        </div>

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
              disabled={saving || trackNotChosen || totalMismatch}
              className={cn(missedCount === 0 && "invisible")}
            >
              Analizi Sonra Yap
            </Button>
          )}
          <Button
            type="button"
            onClick={showAnalysisFlow && missedCount > 0 ? handleGoToAnalysis : handleSaveSimple}
            disabled={saving || trackNotChosen || totalMismatch}
          >
            {saving ? "Kaydediliyor..." : showAnalysisFlow && missedCount > 0 ? "Devam Et: Konu Analizi" : "Kaydet"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
