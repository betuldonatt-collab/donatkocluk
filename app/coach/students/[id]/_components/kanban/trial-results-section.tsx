"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LgsExamScoreGrid, emptyLgsInputs, lgsInputsIncomplete, lgsOverCapSubject } from "@/components/lgs-exam-score-grid";
import { autoCalcMissingField, countsAreConsistent } from "@/lib/count-fields";
import { EXAM_SCORES_REQUIRED, GENERAL_EXAM_SCORES_REQUIRED, isBlankScore } from "@/lib/exam-results-validation";
import { cn } from "@/lib/utils";
import { findCourseById, TRACK_LABELS, type Course, type Track } from "@/lib/curriculum";
import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  LGS_SUBJECT_GROUPS,
  TYT_SUBJECT_GROUPS,
  MAARIF9_EXAM_SUBJECTS,
  MAARIF10_EXAM_SUBJECTS,
  coursesForMaarif10ExamSubject,
  coursesForMaarif9ExamSubject,
  coursesForAytGroup,
  coursesForGroup,
  coursesForLgsGroup,
  inferAytTrackFromScores,
} from "@/lib/curriculum/subject-groups";
import { getTaskTopicMistakesForCoach, saveCoachTrialResults } from "../../../../actions";
import type { DetailTask } from "../../types";
import { TopicMistakeSelector, type TopicMistake } from "./topic-mistake-selector";

// saveCoachTrialResults/getTaskTopicMistakesForCoach now return a result
// object instead of throwing (root cause: a thrown message from a Server
// Action invoked directly -- not through useActionState -- gets stripped
// to a generic, redacted "Minified React error #441" in production, which
// is exactly what coaches were hitting on every failure path here,
// intentional or not; see app/coach/actions.ts's own comment on
// saveCoachTrialResults). So the code above only ever reaches this catch
// for something genuinely outside that function's own control -- the
// network request to invoke it failing outright, or a Server Action
// invoked from the *dashboard's* Analizi-öğrenci-yerine-yap flow tripping
// over Next re-rendering that page's layout mid-action (a cookie write --
// e.g. an auth token refresh -- from a Server Action does that). Same
// digest text either way if it happens; this keeps that from ever
// reaching the coach as raw framework output.
function friendlySaveError(e: unknown): string {
  if (e instanceof Error && !/minified react error/i.test(e.message)) return e.message;
  return "Kaydedilemedi ya da sonuç belirsiz kaldı. Listeye dönüp bu denemenin hâlâ \"Analiz Bekliyor\" durumunda olup olmadığını kontrol et, gerekirse tekrar dene.";
}

// Mirrors task-modal.tsx's own parseGeneralExamTitle track-recovery
// (duplicated, not imported -- that lives under app/student).
function parseGeneralExamTrack(title: string): "tyt" | "ayt" | "lgs" | "m9" | "m10" {
  if (/^9\.\s*SINIF\b/i.test(title)) return "m9";
  if (/^10\.\s*SINIF\b/i.test(title)) return "m10";
  if (/^LGS\b/i.test(title)) return "lgs";
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

function subjectGroupsFor(examTrack: "tyt" | "ayt" | "lgs" | "m9" | "m10", aytTrack: Track | null) {
  if (examTrack === "lgs") return LGS_SUBJECT_GROUPS;
  if (examTrack === "m9") return MAARIF9_EXAM_SUBJECTS;
  if (examTrack === "m10") return MAARIF10_EXAM_SUBJECTS;
  if (examTrack === "tyt") return TYT_SUBJECT_GROUPS;
  if (aytTrack) return AYT_SUBJECT_GROUPS_BY_TRACK[aytTrack];
  return [];
}

function coursesForActiveGroup(examTrack: "tyt" | "ayt" | "lgs" | "m9" | "m10", aytTrack: Track | null, key: string): Course[] {
  if (examTrack === "lgs") return coursesForLgsGroup(key);
  if (examTrack === "m9") return coursesForMaarif9ExamSubject(key);
  if (examTrack === "m10") return coursesForMaarif10ExamSubject(key);
  if (examTrack === "tyt") return coursesForGroup(key as (typeof TYT_SUBJECT_GROUPS)[number]["key"]);
  if (aytTrack) return coursesForAytGroup(aytTrack, key);
  return [];
}

// The browser's own `min={0}` on a number input only blocks the spinner
// arrows, not direct keyboard entry -- stripping anything but digits on
// every keystroke matches the same guard on the student-side equivalents
// (task-modal.tsx, add-custom-task-dialog.tsx).
function sanitizeDigits(v: string) {
  return v.replace(/[^0-9]/g, "");
}

function Field({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  // A required box left empty after a refused save -- red outline.
  invalid?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(sanitizeDigits(e.target.value))}
        aria-invalid={invalid || undefined}
        className={cn("h-8", invalid && "border-destructive focus-visible:ring-destructive/30")}
      />
    </div>
  );
}

// Coach's quick trial-result entry -- only rendered when editing an
// existing branch_exam/general_exam task (see task-drawer.tsx). Own save
// action (saveCoachTrialResults), deliberately separate from the
// assignment-editing "Kaydet" flow above it in the drawer -- recording an
// outcome is a different action than editing the assignment. Simpler
// than the student's own general_exam flow (task-modal.tsx): one overall
// Doğru/Yanlış/Boş, no per-subject breakdown -- a quick entry point, not
// full parity.
export function TrialResultsSection({
  studentId,
  task,
  onSaved,
}: {
  studentId: string;
  task: DetailTask;
  onSaved: (task: DetailTask) => void;
}) {
  const [totalCount, setTotalCount] = useState(task.total_count?.toString() ?? "");
  const [correctCount, setCorrectCount] = useState(task.correct_count?.toString() ?? "");
  const [wrongCount, setWrongCount] = useState(task.wrong_count?.toString() ?? "");
  const [emptyCount, setEmptyCount] = useState(task.empty_count?.toString() ?? "");
  const [mistakes, setMistakes] = useState<TopicMistake[]>([]);
  const [mistakesLoaded, setMistakesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a save was refused for a blank Doğru/Yanlış/Boş box.
  const [showMissingScores, setShowMissingScores] = useState(false);

  const examTrack = task.task_type === "general_exam" ? parseGeneralExamTrack(task.title) : "tyt";
  // LGS Genel Deneme gets the same per-subject form as the student's
  // (LgsExamScoreGrid); every other exam keeps the one overall D/Y/B entry.
  const isLgsGeneral = task.task_type === "general_exam" && examTrack === "lgs";
  const [lgsInputs, setLgsInputs] = useState(() => emptyLgsInputs(task.subject_scores));
  const [aytTrack, setAytTrack] = useState<Track | null>(() => inferAytTrackFromScores(task.subject_scores));

  useEffect(() => {
    let cancelled = false;
    getTaskTopicMistakesForCoach(studentId, task.id).then((result) => {
      if (cancelled) return;
      // Without this, a fetch failure leaves mistakesLoaded stuck false
      // forever and the section shows "Yükleniyor..." with no way out --
      // surface the error and unblock the UI with an empty mistake list
      // instead.
      setMistakesLoaded(true);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMistakes(result.mistakes.map((r) => ({ course_id: r.course_id, topic_id: r.topic_id, status: r.status })));
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, task.id]);

  const branchCourse = task.task_type === "branch_exam" ? findCourseById(task.course_id) : null;
  const activeGroups = task.task_type === "general_exam" ? subjectGroupsFor(examTrack, aytTrack) : [];

  const analysisGroups: { label: string; courses: Course[] }[] =
    task.task_type === "general_exam"
      ? activeGroups
          .map((g) => ({ label: g.label, courses: coursesForActiveGroup(examTrack, aytTrack, g.key) }))
          .filter((g) => g.courses.length > 0)
      : branchCourse
        ? [{ label: branchCourse.name, courses: [branchCourse] }]
        : [];

  const trackNotChosen = task.task_type === "general_exam" && examTrack === "ayt" && !aytTrack;

  // True only once all 4 fields are filled and manually overridden to not
  // add up -- auto-calc below already keeps the exactly-3-filled case
  // consistent by construction, so this only ever catches a genuine,
  // fully-entered mismatch that needs to block saving.
  const totalMismatch = !countsAreConsistent({
    total: totalCount.trim() === "" ? null : Number(totalCount),
    correct: correctCount.trim() === "" ? null : Number(correctCount),
    wrong: wrongCount.trim() === "" ? null : Number(wrongCount),
    empty: emptyCount.trim() === "" ? null : Number(emptyCount),
  });

  // If exactly 3 of Toplam/Doğru/Yanlış/Boş are filled, auto-fills the 4th
  // (lib/count-fields.ts) so the coach doesn't have to do the arithmetic.
  function handleCountFieldChange(field: "total" | "correct" | "wrong" | "empty", value: string) {
    const toNumOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
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
      total: toNumOrNull(next.total),
      correct: toNumOrNull(next.correct),
      wrong: toNumOrNull(next.wrong),
      empty: toNumOrNull(next.empty),
    });
    if (derived.total !== undefined) setTotalCount(String(derived.total));
    if (derived.correct !== undefined) setCorrectCount(String(derived.correct));
    if (derived.wrong !== undefined) setWrongCount(String(derived.wrong));
    if (derived.empty !== undefined) setEmptyCount(String(derived.empty));
  }

  async function handleSave() {
    if (isLgsGeneral) {
      if (lgsInputsIncomplete(lgsInputs)) {
        setShowMissingScores(true);
        setError(GENERAL_EXAM_SCORES_REQUIRED);
        return;
      }
      const over = lgsOverCapSubject(lgsInputs);
      if (over) {
        setError(`${over.label} için Doğru + Yanlış en fazla ${over.questions} olabilir.`);
        return;
      }
      setError(null);
      setSaving(true);
      try {
        const rows = Object.fromEntries(
          Object.entries(lgsInputs).map(([key, v]) => [key, { correct: Number(v.correct), wrong: Number(v.wrong), empty: Number(v.empty) }]),
        );
        const sum = (f: "correct" | "wrong" | "empty") => Object.values(rows).reduce((n, r) => n + r[f], 0);
        const result = await saveCoachTrialResults(studentId, task.id, {
          totalCount: sum("correct") + sum("wrong") + sum("empty"),
          correctCount: sum("correct"),
          wrongCount: sum("wrong"),
          emptyCount: sum("empty"),
          subjectScores: rows,
          mistakes: mistakes.map((m) => ({ courseId: m.course_id, topicId: m.topic_id, status: m.status })),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSaved(result.data as DetailTask);
      } catch (e) {
        setError(friendlySaveError(e));
      } finally {
        setSaving(false);
      }
      return;
    }
    // Doğru / Yanlış / Boş are all required (0 for what wasn't solved);
    // Toplam is derived by the server if left blank.
    if (isBlankScore(correctCount) || isBlankScore(wrongCount) || isBlankScore(emptyCount)) {
      setShowMissingScores(true);
      setError(EXAM_SCORES_REQUIRED);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const toNumOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
      const result = await saveCoachTrialResults(studentId, task.id, {
        totalCount: toNumOrNull(totalCount),
        correctCount: toNumOrNull(correctCount),
        wrongCount: toNumOrNull(wrongCount),
        emptyCount: toNumOrNull(emptyCount),
        mistakes: mistakes.map((m) => ({ courseId: m.course_id, topicId: m.topic_id, status: m.status })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.data as DetailTask);
    } catch (e) {
      setError(friendlySaveError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border space-y-3 rounded-lg border p-3">
      <p className="text-foreground text-sm font-semibold">Sonuçları Gir</p>

      {isLgsGeneral && <LgsExamScoreGrid inputs={lgsInputs} onChange={setLgsInputs} showMissing={showMissingScores} />}

      {!isLgsGeneral && (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Toplam" value={totalCount} onChange={(v) => handleCountFieldChange("total", v)} />
        <Field
          label="Doğru"
          value={correctCount}
          onChange={(v) => handleCountFieldChange("correct", v)}
          invalid={showMissingScores && isBlankScore(correctCount)}
        />
        <Field
          label="Yanlış"
          value={wrongCount}
          onChange={(v) => handleCountFieldChange("wrong", v)}
          invalid={showMissingScores && isBlankScore(wrongCount)}
        />
        <Field
          label="Boş"
          value={emptyCount}
          onChange={(v) => handleCountFieldChange("empty", v)}
          invalid={showMissingScores && isBlankScore(emptyCount)}
        />
      </div>
      )}

      {totalMismatch && !isLgsGeneral && (
        <div className="bg-destructive/10 text-destructive flex items-center gap-2 rounded-md px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          Toplam, Doğru + Yanlış + Boş toplamına eşit değil.
        </div>
      )}

      {task.task_type === "general_exam" && examTrack === "ayt" && !aytTrack && (
        <div className="space-y-1.5">
          <p className="text-foreground text-xs font-medium">Alan Seç</p>
          <div className="bg-secondary inline-flex w-fit rounded-lg p-1">
            {(Object.keys(TRACK_LABELS) as Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAytTrack(t)}
                className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1 text-xs font-medium transition-colors"
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-foreground text-xs font-medium">Hatalı veya Boş Bırakılan Konular (opsiyonel)</p>
        {!mistakesLoaded ? (
          <p className="text-muted-foreground text-xs">Yükleniyor...</p>
        ) : analysisGroups.length === 0 ? (
          <p className="text-muted-foreground text-xs">Konu listesi için önce Alan seçilmeli.</p>
        ) : (
          <TopicMistakeSelector groups={analysisGroups} selected={mistakes} onChange={setMistakes} />
        )}
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      <Button type="button" size="sm" onClick={handleSave} disabled={saving || trackNotChosen || (totalMismatch && !isLgsGeneral)}>
        {saving ? "Kaydediliyor..." : "Sonuçları Kaydet"}
      </Button>
    </div>
  );
}
