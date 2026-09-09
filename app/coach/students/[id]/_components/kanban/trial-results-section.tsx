"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { getTaskTopicMistakesForCoach, saveCoachTrialResults } from "../../../../actions";
import type { DetailTask } from "../../types";
import { TopicMistakeSelector, type TopicMistake } from "./topic-mistake-selector";

// Mirrors task-modal.tsx's own parseGeneralExamTitle track-recovery
// (duplicated, not imported -- that lives under app/student).
function parseGeneralExamTrack(title: string): "tyt" | "ayt" {
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

function subjectGroupsFor(examTrack: "tyt" | "ayt", aytTrack: Track | null) {
  if (examTrack === "tyt") return TYT_SUBJECT_GROUPS;
  if (aytTrack) return AYT_SUBJECT_GROUPS_BY_TRACK[aytTrack];
  return [];
}

function coursesForActiveGroup(examTrack: "tyt" | "ayt", aytTrack: Track | null, key: string): Course[] {
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(sanitizeDigits(e.target.value))}
        className="h-8"
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

  const examTrack = task.task_type === "general_exam" ? parseGeneralExamTrack(task.title) : "tyt";
  const [aytTrack, setAytTrack] = useState<Track | null>(() => inferAytTrackFromScores(task.subject_scores));

  useEffect(() => {
    let cancelled = false;
    getTaskTopicMistakesForCoach(studentId, task.id)
      .then((rows) => {
        if (cancelled) return;
        setMistakes(rows.map((r) => ({ course_id: r.course_id, topic_id: r.topic_id, status: r.status })));
        setMistakesLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        // Without this, a fetch failure leaves mistakesLoaded stuck
        // false forever and the section shows "Yükleniyor..." with no
        // way out -- surface the error and unblock the UI with an empty
        // mistake list instead.
        setMistakesLoaded(true);
        toast.error(e instanceof Error ? e.message : "Konu hataları yüklenemedi.");
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
    setError(null);
    setSaving(true);
    try {
      const toNumOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
      const updated = await saveCoachTrialResults(studentId, task.id, {
        totalCount: toNumOrNull(totalCount),
        correctCount: toNumOrNull(correctCount),
        wrongCount: toNumOrNull(wrongCount),
        emptyCount: toNumOrNull(emptyCount),
        mistakes: mistakes.map((m) => ({ courseId: m.course_id, topicId: m.topic_id, status: m.status })),
      });
      onSaved(updated as DetailTask);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border space-y-3 rounded-lg border p-3">
      <p className="text-foreground text-sm font-semibold">Sonuçları Gir</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Toplam" value={totalCount} onChange={(v) => handleCountFieldChange("total", v)} />
        <Field label="Doğru" value={correctCount} onChange={(v) => handleCountFieldChange("correct", v)} />
        <Field label="Yanlış" value={wrongCount} onChange={(v) => handleCountFieldChange("wrong", v)} />
        <Field label="Boş" value={emptyCount} onChange={(v) => handleCountFieldChange("empty", v)} />
      </div>

      {totalMismatch && (
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

      <Button type="button" size="sm" onClick={handleSave} disabled={saving || trackNotChosen || totalMismatch}>
        {saving ? "Kaydediliyor..." : "Sonuçları Kaydet"}
      </Button>
    </div>
  );
}
