"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { autoCalcMissingField, countsAreConsistent } from "@/lib/count-fields";
import { EXAM_SCORES_REQUIRED, isBlankScore } from "@/lib/exam-results-validation";
import { AYT_COURSES_BY_TRACK, BRANCH_EXAM_MACRO_COURSES, isBranchExamMacroCourseId, LGS_COURSES, TYT_COURSES, topicOptionsForCourse, type Course } from "@/lib/curriculum";
import { lgsCourseOptions } from "@/lib/curriculum/subject-groups";
import type { ExamType } from "@/lib/exam-type";
import { addOwnBranchExamResource, addResource } from "../../kaynak-takibi/actions";
import { createRichCustomTask, getMyResourcesForCourse, type RichTaskType } from "../../actions";
import { ResourceCombobox, type ResourceOption } from "./resource-combobox";
import { SmartCombobox } from "./smart-combobox";
import type { StudentTask } from "./types";

// Atomic TYT/AYT courses only -- deliberately NOT Paragraf/Problem's
// routine pseudo-courses (which already have their own dedicated page).
// Branş Denemesi is the one exception: its Ders picker also offers the
// macro groupings ("TYT Fen" etc, BRANCH_EXAM_MACRO_COURSES below), same
// as the coach's own assignment form -- these feed the exam/trial
// analysis features as their own saved data points, so a student's own
// branch exam needs the same macro option a coach-assigned one already
// has, even though it means that task won't show up under any single
// atomic tab in the student's own Kaynak Takibi.
const ALL_COURSES: Course[] = [...TYT_COURSES, ...AYT_COURSES_BY_TRACK.sayisal, ...AYT_COURSES_BY_TRACK.ea, ...AYT_COURSES_BY_TRACK.sozel];

// Macro branch-exam courses ("TYT Fen") already carry their full display
// name -- unlike every atomic course, which stores a bare name ("Fizik")
// and relies on this prefix. Prefixing a macro course's name too would
// double up ("TYT TYT Fen").
function courseLabel(course: Course) {
  if (isBranchExamMacroCourseId(course.id)) return course.name;
  return `${course.id.startsWith("tyt-") ? "TYT " : course.id.startsWith("ayt-") ? "AYT " : ""}${course.name}`;
}

const TASK_TYPE_OPTIONS: { value: RichTaskType; label: string }[] = [
  { value: "question_bank", label: "Soru Çözümü" },
  { value: "topic_study", label: "Konu Çalışması" },
  { value: "branch_exam", label: "Branş Denemesi" },
  { value: "general_exam", label: "Genel Deneme" },
  { value: "reading", label: "Kitap Okuma" },
  { value: "extra_custom", label: "Diğer / Serbest" },
];

const GENERAL_EXAM_TRACK_OPTIONS = [
  { value: "tyt", label: "TYT" },
  { value: "ayt", label: "AYT" },
] as const;

type ResourceRow = { resourceId: string; resourceName: string; addToLibrary: boolean };

function emptyResourceRow(): ResourceRow {
  return { resourceId: "", resourceName: "", addToLibrary: true };
}

type FormState = {
  taskType: RichTaskType;
  courseId: string;
  topicId: string;
  // Any number of rows, same shape as the coach's own assignment form
  // (TaskFormFields' resources) -- a student can cite more than one
  // Kaynak for the same task just like a coach can.
  resources: ResourceRow[];
  totalCount: string;
  correctCount: string;
  wrongCount: string;
  emptyCount: string;
  durationMinutes: string;
  // "Soru Çözümü"/"Branş Denemesi" only -- "Bu çalışmayı tamamladın mı?".
  // Defaults to false (a future goal, like every other task type already
  // defaults to) rather than guessing "yes" just because it's the first
  // type selected.
  isCompleted: boolean;
  generalExamTrack: "tyt" | "ayt" | "lgs";
  generalExamPublisher: string;
  freeTitle: string;
  freeDescription: string;
  // "Kitap Okuma" only -- the book's name IS the title, no course/topic
  // involved (same "lives only on the row" shape as freeTitle above).
  bookTitle: string;
};

function initialFormState(examType: ExamType): FormState {
  return {
    taskType: "question_bank",
    courseId: examType === "LGS" ? LGS_COURSES[0].id : ALL_COURSES[0].id,
    topicId: "",
    resources: [],
    totalCount: "",
    correctCount: "",
    wrongCount: "",
    emptyCount: "",
    durationMinutes: "",
    isCompleted: false,
    generalExamTrack: examType === "LGS" ? "lgs" : "tyt",
    generalExamPublisher: "",
    freeTitle: "",
    freeDescription: "",
    bookTitle: "",
  };
}

function toNumberOrNull(v: string) {
  return v.trim() === "" ? null : Number(v);
}

// The browser's own `min={0}` on a number input only blocks the spinner
// arrows, not direct keyboard entry (a student can still type "-5") --
// stripping anything but digits on every keystroke is a stronger
// guarantee than relying on the input's own min/type alone, and matches
// what "a non-negative count" actually means (no minus sign, no decimal
// point) rather than merely hinting at it.
function sanitizeDigits(v: string) {
  return v.replace(/[^0-9]/g, "");
}

function CountField({
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
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(sanitizeDigits(e.target.value))}
        aria-invalid={invalid || undefined}
        className={cn("bg-background", invalid && "border-destructive focus-visible:ring-destructive/30")}
      />
    </div>
  );
}

// Rich "Ek Çalışma Ekle" dialog -- replaces the old bare title/
// description form. Mirrors the coach's own task-assignment form
// (app/coach/students/[id]/_components/kanban/task-form-fields.tsx) in
// course/topic/resource selection (including any number of Kaynak rows),
// plus TaskModal's own Toplam/Doğru/Yanlış/Boş block (autoCalcMissingField
// + countsAreConsistent) for the two types that can declare themselves
// already done -- "Soru Çözümü" and "Branş Denemesi" -- via the "Bu
// çalışmayı tamamladın mı?" toggle, since a student adding "extra study"
// might be logging something already done (e.g. at school) just as often
// as setting a future goal. See createRichCustomTask (../../actions.ts)
// for the full scope rationale (atomic courses only).
export function AddCustomTaskDialog({
  taskDate,
  onCreated,
  disabled,
  examType = "YKS",
}: {
  taskDate: string;
  onCreated: (task: StudentTask) => void;
  // Which cohort's subjects the Ders picker offers (LGS: its six subjects,
  // grouped SÖZEL / SAYISAL); everything else here is identical.
  examType?: ExamType;
  // The RLS insert policy already rejects this once the day's week is
  // locked (student_tasks_student_insert_custom, migration 0037) -- this
  // just keeps the button from opening a dialog that can only ever fail.
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isLgs = examType === "LGS";
  const [value, setValue] = useState<FormState>(() => initialFormState(examType));
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMissingScores, setShowMissingScores] = useState(false);

  const isBranchExam = value.taskType === "branch_exam";
  const isGeneralExam = value.taskType === "general_exam";
  const isFree = value.taskType === "extra_custom";
  const isReading = value.taskType === "reading";
  const isQuestionBank = value.taskType === "question_bank";
  // "Bu çalışmayı tamamladın mı?" applies to both types that have real
  // Doğru/Yanlış/Boş results to log -- a solved question set or an
  // already-taken trial exam.
  const hasCompletedToggle = isQuestionBank || isBranchExam;
  const isCompletedWithToggle = hasCompletedToggle && value.isCompleted;
  const showCourse = !isGeneralExam && !isFree && !isReading;
  const showTopic = value.taskType === "question_bank" || value.taskType === "topic_study";
  const showResource = value.taskType === "question_bank" || value.taskType === "topic_study" || isBranchExam;
  // "Evet" is what unlocks the full Toplam/Doğru/Yanlış/Boş entry --
  // otherwise (including each type's own default, "Hayır") it's just a
  // target, same as every other type below.
  const showFullCounts = isCompletedWithToggle;
  // Reading reuses the same single-field "target, filled in later via the
  // card" shape topic_study already has -- Okunan Sayfa is logged
  // afterward through TaskModal, same as its own D/Y/B results. A
  // not-yet-completed Soru Çözümü/Branş Denemesi joins this same group --
  // Soru Sayısı/Kaç Adet is its target too, until "tamamladım" says
  // otherwise.
  const showTotalOnly = value.taskType === "topic_study" || isReading || (hasCompletedToggle && !isCompletedWithToggle);
  // Already-completed work never takes a manual duration -- there's
  // nothing left to time.
  const showDuration = !isGeneralExam && !isFree && !isCompletedWithToggle;

  // Branş Denemesi's Ders picker leads with the macro groupings, same
  // order the coach's own form uses -- every other type stays atomic-only.
  // LGS has no macro subjects (its branş denemeleri are per single subject)
  // and its own six-course list, offered SÖZEL first then SAYISAL.
  const courseList: Course[] = isLgs ? LGS_COURSES : isBranchExam ? [...BRANCH_EXAM_MACRO_COURSES, ...ALL_COURSES] : ALL_COURSES;
  const courseOptions: { id: string; label: string; group?: string }[] = isLgs
    ? lgsCourseOptions()
    : courseList.map((c) => ({ id: c.id, label: courseLabel(c) }));
  const course = courseList.find((c) => c.id === value.courseId) ?? courseList[0];
  const topicOptions = topicOptionsForCourse(course);

  function set(patch: Partial<FormState>) {
    setValue((v) => ({ ...v, ...patch }));
  }

  // Fetches on-demand (not eagerly on dashboard load) whenever the
  // resource picker's course or kind actually changes -- mirrors the
  // coach form's courseResourceData, just fetched lazily here instead of
  // preloaded for every course up front.
  useEffect(() => {
    if (!showResource || !open) return;
    let cancelled = false;
    getMyResourcesForCourse(value.courseId, isBranchExam ? "branch_exam" : "study").then((rows) => {
      if (!cancelled) setResourceOptions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, showResource, value.courseId, isBranchExam]);

  function handleTaskTypeChange(taskType: RichTaskType) {
    set({
      taskType,
      topicId: "",
      // Branş Denemesi seeds one empty row up front, same as the coach's
      // own form does -- it's the only field this type asks for besides
      // Ders, so it should be visible immediately rather than behind an
      // extra "Kaynak Ekle" click.
      resources: taskType === "branch_exam" ? [emptyResourceRow()] : [],
      totalCount: "",
      correctCount: "",
      wrongCount: "",
      emptyCount: "",
      durationMinutes: "",
      isCompleted: false,
      bookTitle: "",
    });
  }

  // Switching "Bu çalışmayı tamamladın mı?" also clears whichever fields
  // the new answer hides -- Doğru/Yanlış/Boş/Süre don't silently carry
  // over as stale, invisible values the student never meant to submit.
  function handleCompletedChange(isCompleted: boolean) {
    set({
      isCompleted,
      correctCount: "",
      wrongCount: "",
      emptyCount: "",
      durationMinutes: "",
      // Kaç Adet (trial copy count) and Toplam (this exam's own question
      // count once results are logged) are different scales for Branş
      // Denemesi specifically -- carrying one over as the other would be
      // actively misleading, unlike Soru Çözümü where both slots mean the
      // same "how many questions" either way.
      totalCount: isBranchExam ? "" : value.totalCount,
    });
  }

  function handleCourseChange(courseId: string) {
    set({ courseId, topicId: "", resources: [] });
  }

  function addResourceRow() {
    set({ resources: [...value.resources, emptyResourceRow()] });
  }

  function updateResourceRow(i: number, next: ResourceRow) {
    set({ resources: value.resources.map((r, idx) => (idx === i ? next : r)) });
  }

  function removeResourceRow(i: number) {
    set({ resources: value.resources.filter((_, idx) => idx !== i) });
  }

  // Same auto-calc-the-4th-field behavior as TaskModal's own count
  // fields -- if exactly 3 of Toplam/Doğru/Yanlış/Boş are filled, the
  // last one fills itself in.
  function handleCountFieldChange(field: "total" | "correct" | "wrong" | "empty", fieldValue: string) {
    const next = {
      total: field === "total" ? fieldValue : value.totalCount,
      correct: field === "correct" ? fieldValue : value.correctCount,
      wrong: field === "wrong" ? fieldValue : value.wrongCount,
      empty: field === "empty" ? fieldValue : value.emptyCount,
    };
    const derived = autoCalcMissingField({
      total: toNumberOrNull(next.total),
      correct: toNumberOrNull(next.correct),
      wrong: toNumberOrNull(next.wrong),
      empty: toNumberOrNull(next.empty),
    });
    set({
      totalCount: derived.total !== undefined ? String(derived.total) : next.total,
      correctCount: derived.correct !== undefined ? String(derived.correct) : next.correct,
      wrongCount: derived.wrong !== undefined ? String(derived.wrong) : next.wrong,
      emptyCount: derived.empty !== undefined ? String(derived.empty) : next.empty,
    });
  }

  const totalMismatch =
    showFullCounts &&
    !countsAreConsistent({
      total: toNumberOrNull(value.totalCount),
      correct: toNumberOrNull(value.correctCount),
      wrong: toNumberOrNull(value.wrongCount),
      empty: toNumberOrNull(value.emptyCount),
    });

  const canSave = isFree ? !!value.freeTitle.trim() : isReading ? !!value.bookTitle.trim() : !totalMismatch;

  // A typed-but-not-yet-created resource name is made into a real
  // student_resources row first (if "add to library" is checked) so the
  // task can link to a real id -- same order-preserving pattern as the
  // coach drawer's own resolveResourceIds, generalized here to any number
  // of rows the same way.
  async function resolveResourceIds(): Promise<{ id: string; name: string }[]> {
    if (!showResource) return [];
    const resolved = await Promise.all(
      value.resources.map(async (r): Promise<{ id: string; name: string } | null> => {
        if (r.resourceId) return { id: r.resourceId, name: r.resourceName.trim() };
        const name = r.resourceName.trim();
        if (!name || !r.addToLibrary) return null;
        const created = isBranchExam
          ? await addOwnBranchExamResource(value.courseId, name, 1, 1)
          : await addResource(value.courseId, name);
        return { id: created.id, name };
      }),
    );
    return resolved.filter((r): r is { id: string; name: string } => r !== null);
  }

  // A Branş Denemesi declared already completed must carry its Doğru/Yanlış/
  // Boş -- 0 for what wasn't solved. (Soru Çözümü keeps its looser rule: a
  // partly solved set is a legitimate "Yarım Yapıldı".) createRichCustomTask
  // re-checks this on the server.
  const branchScoresMissing =
    showFullCounts &&
    isBranchExam &&
    (isBlankScore(value.correctCount) || isBlankScore(value.wrongCount) || isBlankScore(value.emptyCount));

  async function handleCreate() {
    if (branchScoresMissing) {
      setShowMissingScores(true);
      setError(EXAM_SCORES_REQUIRED);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const resolvedResources = await resolveResourceIds();
      const task = await createRichCustomTask({
        taskDate,
        taskType: value.taskType,
        courseId: showCourse ? value.courseId : null,
        topicId: showTopic ? value.topicId : null,
        resourceIds: resolvedResources.map((r) => r.id),
        totalCount: showFullCounts || showTotalOnly ? toNumberOrNull(value.totalCount) : null,
        correctCount: showFullCounts ? toNumberOrNull(value.correctCount) : null,
        wrongCount: showFullCounts ? toNumberOrNull(value.wrongCount) : null,
        emptyCount: showFullCounts ? toNumberOrNull(value.emptyCount) : null,
        durationMinutes: showDuration ? toNumberOrNull(value.durationMinutes) : null,
        isCompleted: hasCompletedToggle ? value.isCompleted : null,
        generalExamTrack: isGeneralExam ? value.generalExamTrack : null,
        generalExamPublisher: isGeneralExam ? value.generalExamPublisher : null,
        // Single source of truth for a branch exam's publisher -- the
        // "Kaynak" field below IS the publisher for this task type (see
        // its own comment), so there's no separate free-text input to
        // read from anymore. Joined with " + " for the (less common)
        // multi-resource case, matching the coach form's own
        // taskFormValueToPayload convention.
        branchExamPublisher: isBranchExam
          ? resolvedResources
              .map((r) => r.name)
              .filter(Boolean)
              .join(" + ") || null
          : null,
        freeTitle: isFree ? value.freeTitle : null,
        freeDescription: isFree ? value.freeDescription : null,
        bookTitle: isReading ? value.bookTitle : null,
      });
      // createRichCustomTask's own return only carries resource_ids (see
      // its own comment) -- filled in client-side here from what this
      // dialog already knows, rather than a second round trip just to
      // read back the names it was just given. Branch exams excluded: for
      // that type this same field is the exam's PUBLISHER, already
      // embedded in the task's title (branchExamPublisher above) --
      // repeating it as a "Kaynak: X" line would just be a duplicate.
      const resourceNames = isBranchExam ? [] : resolvedResources.map((r) => r.name).filter(Boolean);
      onCreated({ ...task, resource_names: resourceNames } as StudentTask);
      setValue(initialFormState(examType));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setValue(initialFormState(examType));
      setError(null);
    }
    setOpen(next);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)} disabled={disabled}>
        <Plus className="size-4" />
        Ek Çalışma Ekle
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ek Çalışma Ekle</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rich-task-type">Görev Türü</Label>
              <select
                id="rich-task-type"
                className="border-input bg-background flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                value={value.taskType}
                onChange={(e) => handleTaskTypeChange(e.target.value as RichTaskType)}
              >
                {TASK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* "Soru Çözümü"/"Branş Denemesi" only -- every other type
                already has its own fixed pending-or-full-results shape
                below, so this toggle would have nothing to actually
                change for them. */}
            {hasCompletedToggle && (
              <div className="space-y-1.5">
                <Label>Bu çalışmayı tamamladın mı?</Label>
                <div className="flex gap-1.5">
                  {(
                    [
                      { value: false, label: "Hayır, hedef olarak ekle" },
                      { value: true, label: "Evet, tamamladım" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      aria-pressed={value.isCompleted === opt.value}
                      onClick={() => handleCompletedChange(opt.value)}
                      className={cn(
                        "flex-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        value.isCompleted === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isFree && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="rich-task-free-title">Başlık</Label>
                  <Input
                    id="rich-task-free-title"
                    placeholder="Örn: Kimya tekrar notları"
                    value={value.freeTitle}
                    onChange={(e) => set({ freeTitle: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rich-task-free-description">Açıklama (opsiyonel)</Label>
                  <Textarea id="rich-task-free-description" value={value.freeDescription} onChange={(e) => set({ freeDescription: e.target.value })} />
                </div>
              </>
            )}

            {isReading && (
              <div className="space-y-1.5">
                <Label htmlFor="rich-task-book-title">Kitap Adı</Label>
                <Input
                  id="rich-task-book-title"
                  placeholder="Örn: Fatih Harbiye"
                  value={value.bookTitle}
                  onChange={(e) => set({ bookTitle: e.target.value })}
                />
              </div>
            )}

            {isGeneralExam && (
              <div className={cn("grid grid-cols-1 gap-3", !isLgs && "sm:grid-cols-2")}>
                {/* LGS has exactly one general exam format -- no TYT/AYT-style
                    Sınav Türü to choose between. */}
                {!isLgs && (
                <div className="space-y-1.5">
                  <Label>Sınav Türü</Label>
                  <div className="flex gap-1.5">
                    {GENERAL_EXAM_TRACK_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={value.generalExamTrack === opt.value}
                        onClick={() => set({ generalExamTrack: opt.value })}
                        className={cn(
                          "flex-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                          value.generalExamTrack === opt.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-card text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="rich-task-general-publisher">Yayınevi</Label>
                  <Input
                    id="rich-task-general-publisher"
                    value={value.generalExamPublisher}
                    onChange={(e) => set({ generalExamPublisher: e.target.value })}
                    placeholder="Örn: 3D Yayınları"
                  />
                </div>
              </div>
            )}

            {(showCourse || showTopic) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {showCourse && (
                  <div className="space-y-1.5">
                    <Label>Ders</Label>
                    <SmartCombobox
                      options={courseOptions}
                      value={value.courseId}
                      onChange={handleCourseChange}
                      placeholder="Ders ara..."
                      ariaLabel="Ders seç"
                    />
                  </div>
                )}
                {showTopic && (
                  <div className="space-y-1.5">
                    <Label>Konu</Label>
                    <SmartCombobox
                      options={topicOptions}
                      value={value.topicId}
                      onChange={(topicId) => set({ topicId })}
                      placeholder="Konu ara..."
                      ariaLabel="Konu seç"
                    />
                  </div>
                )}
              </div>
            )}

            {showResource && (
              <div className="space-y-2">
                {/* Branch exam's publisher field(s) -- double as an
                    optional link into the student's own Kaynak Takibi
                    inventory (kind='branch_exam'), so there's no separate
                    free-text "Yayınevi" input asking the same question
                    twice. Typing a name here (even without picking/saving
                    it as a tracked resource) is what ends up in the
                    task's title, exactly like the old dedicated field did.
                    Any number of rows, mirroring the coach's own
                    assignment form. */}
                <Label>{isBranchExam ? "Yayınevi / Kaynak" : "Kaynaklar (opsiyonel)"}</Label>
                {value.resources.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1">
                      <ResourceCombobox
                        resources={resourceOptions}
                        resourceId={r.resourceId}
                        resourceName={r.resourceName}
                        addToLibrary={r.addToLibrary}
                        onSelectExisting={(sel) => updateResourceRow(i, { ...r, resourceId: sel.id, resourceName: sel.name })}
                        onTypeNew={(name) => updateResourceRow(i, { ...r, resourceId: "", resourceName: name })}
                        onAddToLibraryChange={(v) => updateResourceRow(i, { ...r, addToLibrary: v })}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeResourceRow(i)} aria-label="Kaynağı kaldır">
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addResourceRow}>
                  <Plus className="size-3.5" />
                  Kaynak Ekle
                </Button>
              </div>
            )}

            {showFullCounts && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <CountField label="Toplam" value={value.totalCount} onChange={(v) => handleCountFieldChange("total", v)} />
                  <CountField
                    label="Doğru"
                    value={value.correctCount}
                    onChange={(v) => handleCountFieldChange("correct", v)}
                    invalid={showMissingScores && isBranchExam && isBlankScore(value.correctCount)}
                  />
                  <CountField
                    label="Yanlış"
                    value={value.wrongCount}
                    onChange={(v) => handleCountFieldChange("wrong", v)}
                    invalid={showMissingScores && isBranchExam && isBlankScore(value.wrongCount)}
                  />
                  <CountField
                    label="Boş"
                    value={value.emptyCount}
                    onChange={(v) => handleCountFieldChange("empty", v)}
                    invalid={showMissingScores && isBranchExam && isBlankScore(value.emptyCount)}
                  />
                </div>
                {totalMismatch && <p className="text-destructive text-xs">Toplam, Doğru + Yanlış + Boş toplamına eşit değil.</p>}
              </div>
            )}

            {showTotalOnly && (
              <div className="space-y-1.5">
                <Label htmlFor="rich-task-total-only" className="text-sm font-semibold">
                  {isBranchExam ? "Kaç Adet (opsiyonel)" : isReading ? "Sayfa Sayısı (opsiyonel)" : "Soru Sayısı (opsiyonel)"}
                </Label>
                <Input
                  id="rich-task-total-only"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={value.totalCount}
                  onChange={(e) => set({ totalCount: sanitizeDigits(e.target.value) })}
                  placeholder={isReading ? "Örn: 250" : "Örn: 40"}
                />
              </div>
            )}

            {showDuration && (
              <div className="space-y-1.5">
                <Label htmlFor="rich-task-duration" className="text-muted-foreground text-xs font-normal">
                  Süre (dk) — opsiyonel
                </Label>
                <Input
                  id="rich-task-duration"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={value.durationMinutes}
                  onChange={(e) => set({ durationMinutes: sanitizeDigits(e.target.value) })}
                  className="max-w-[140px]"
                />
              </div>
            )}

            {!isFree && (isGeneralExam || (hasCompletedToggle && !isCompletedWithToggle)) && (
              <p className="text-muted-foreground text-xs">
                Sonuçlarını (Doğru/Yanlış/Boş) girmek için görevi oluşturduktan sonra karttan aç.
              </p>
            )}
            {isReading && (
              <p className="text-muted-foreground text-xs">Okunan sayfa sayısını girmek için görevi oluşturduktan sonra karttan aç.</p>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              İptal
            </Button>
            <Button type="button" disabled={!canSave || saving} onClick={handleCreate}>
              {saving ? "Ekleniyor..." : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
