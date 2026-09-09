"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { autoCalcMissingField, countsAreConsistent } from "@/lib/count-fields";
import { AYT_COURSES_BY_TRACK, TYT_COURSES, topicsForCourse, type Course } from "@/lib/curriculum";
import { addOwnBranchExamResource, addResource } from "../../kaynak-takibi/actions";
import { createRichCustomTask, getMyResourcesForCourse, type RichTaskType } from "../../actions";
import { ResourceCombobox, type ResourceOption } from "./resource-combobox";
import { SmartCombobox } from "./smart-combobox";
import type { StudentTask } from "./types";

// Atomic TYT/AYT courses only -- deliberately NOT the branch-exam macro
// groupings or Paragraf/Problem's routine pseudo-courses (see the
// createRichCustomTask comment in ../../actions.ts for why: Kaynak
// Takibi's own tabs are atomic-only, and Paragraf/Problem already has
// its own dedicated page).
const ALL_COURSES: Course[] = [...TYT_COURSES, ...AYT_COURSES_BY_TRACK.sayisal, ...AYT_COURSES_BY_TRACK.ea, ...AYT_COURSES_BY_TRACK.sozel];

function courseLabel(course: Course) {
  return `${course.id.startsWith("tyt-") ? "TYT " : course.id.startsWith("ayt-") ? "AYT " : ""}${course.name}`;
}

const TASK_TYPE_OPTIONS: { value: RichTaskType; label: string }[] = [
  { value: "question_bank", label: "Soru Çözümü" },
  { value: "topic_study", label: "Konu Çalışması" },
  { value: "branch_exam", label: "Branş Denemesi" },
  { value: "general_exam", label: "Genel Deneme" },
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
  resource: ResourceRow;
  totalCount: string;
  correctCount: string;
  wrongCount: string;
  emptyCount: string;
  durationMinutes: string;
  generalExamTrack: "tyt" | "ayt";
  generalExamPublisher: string;
  freeTitle: string;
  freeDescription: string;
};

function initialFormState(): FormState {
  return {
    taskType: "question_bank",
    courseId: ALL_COURSES[0].id,
    topicId: "",
    resource: emptyResourceRow(),
    totalCount: "",
    correctCount: "",
    wrongCount: "",
    emptyCount: "",
    durationMinutes: "",
    generalExamTrack: "tyt",
    generalExamPublisher: "",
    freeTitle: "",
    freeDescription: "",
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

function CountField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="min-w-0 space-y-1.5">
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

// Rich "Ek Çalışma Ekle" dialog -- replaces the old bare title/
// description form. Reuses the same course/topic/resource picker shape
// as the coach's own task-assignment form (app/coach/students/[id]/
// _components/kanban/task-form-fields.tsx) plus TaskModal's own Toplam/
// Doğru/Yanlış/Boş block (autoCalcMissingField + countsAreConsistent),
// merged into one step since a student adding "extra study" is logging
// something already done, not assigning future work to complete later.
// See createRichCustomTask (../../actions.ts) for the full scope
// rationale (atomic courses only, "Soru Çözümü" is the only type with
// inline results entry).
export function AddCustomTaskDialog({
  taskDate,
  onCreated,
  disabled,
}: {
  taskDate: string;
  onCreated: (task: StudentTask) => void;
  // The RLS insert policy already rejects this once the day's week is
  // locked (student_tasks_student_insert_custom, migration 0037) -- this
  // just keeps the button from opening a dialog that can only ever fail.
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<FormState>(initialFormState);
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBranchExam = value.taskType === "branch_exam";
  const isGeneralExam = value.taskType === "general_exam";
  const isFree = value.taskType === "extra_custom";
  const showCourse = !isGeneralExam && !isFree;
  const showTopic = value.taskType === "question_bank" || value.taskType === "topic_study";
  const showResource = value.taskType === "question_bank" || value.taskType === "topic_study" || isBranchExam;
  const showFullCounts = value.taskType === "question_bank";
  const showTotalOnly = value.taskType === "topic_study" || isBranchExam;
  const showDuration = !isGeneralExam && !isFree;

  const course = ALL_COURSES.find((c) => c.id === value.courseId) ?? ALL_COURSES[0];
  const topics = topicsForCourse(course);

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
    set({ taskType, topicId: "", resource: emptyResourceRow(), totalCount: "", correctCount: "", wrongCount: "", emptyCount: "" });
  }

  function handleCourseChange(courseId: string) {
    set({ courseId, topicId: "", resource: emptyResourceRow() });
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

  const canSave = isFree ? !!value.freeTitle.trim() : !totalMismatch;

  // A typed-but-not-yet-created resource name is made into a real
  // student_resources row first (if "add to library" is checked) so the
  // task can link to a real id -- same order-preserving pattern as the
  // coach drawer's own resolveResourceIds, just capped at one row here.
  async function resolveResourceId(): Promise<string | null> {
    if (!showResource) return null;
    if (value.resource.resourceId) return value.resource.resourceId;
    const name = value.resource.resourceName.trim();
    if (!name || !value.resource.addToLibrary) return null;
    const created = isBranchExam
      ? await addOwnBranchExamResource(value.courseId, name, 1, 1)
      : await addResource(value.courseId, name);
    return created.id;
  }

  async function handleCreate() {
    setError(null);
    setSaving(true);
    try {
      const resourceId = await resolveResourceId();
      const task = await createRichCustomTask({
        taskDate,
        taskType: value.taskType,
        courseId: showCourse ? value.courseId : null,
        topicId: showTopic ? value.topicId : null,
        resourceIds: resourceId ? [resourceId] : [],
        totalCount: showFullCounts || showTotalOnly ? toNumberOrNull(value.totalCount) : null,
        correctCount: showFullCounts ? toNumberOrNull(value.correctCount) : null,
        wrongCount: showFullCounts ? toNumberOrNull(value.wrongCount) : null,
        emptyCount: showFullCounts ? toNumberOrNull(value.emptyCount) : null,
        durationMinutes: showDuration ? toNumberOrNull(value.durationMinutes) : null,
        generalExamTrack: isGeneralExam ? value.generalExamTrack : null,
        generalExamPublisher: isGeneralExam ? value.generalExamPublisher : null,
        // Single source of truth for a branch exam's publisher -- the
        // "Kaynak" field below IS the publisher for this task type (see
        // its own comment), so there's no separate free-text input to
        // read from anymore.
        branchExamPublisher: isBranchExam ? value.resource.resourceName.trim() || null : null,
        freeTitle: isFree ? value.freeTitle : null,
        freeDescription: isFree ? value.freeDescription : null,
      });
      onCreated(task as StudentTask);
      setValue(initialFormState());
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setValue(initialFormState());
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

            {isGeneralExam && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      options={ALL_COURSES.map((c) => ({ id: c.id, label: courseLabel(c) }))}
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
                      options={topics.map((t) => ({ id: t.id, label: t.name }))}
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
              <div className="space-y-1.5">
                {/* Branch exam's single publisher field -- doubles as an
                    optional link into the student's own Kaynak Takibi
                    inventory (kind='branch_exam'), so there's no separate
                    free-text "Yayınevi" input asking the same question
                    twice. Typing a name here (even without picking/saving
                    it as a tracked resource) is what ends up in the
                    task's title, exactly like the old dedicated field did. */}
                <Label>{isBranchExam ? "Yayınevi (opsiyonel)" : "Kaynak (opsiyonel)"}</Label>
                <ResourceCombobox
                  resources={resourceOptions}
                  resourceId={value.resource.resourceId}
                  resourceName={value.resource.resourceName}
                  addToLibrary={value.resource.addToLibrary}
                  onSelectExisting={(sel) => set({ resource: { resourceId: sel.id, resourceName: sel.name, addToLibrary: true } })}
                  onTypeNew={(name) => set({ resource: { resourceId: "", resourceName: name, addToLibrary: value.resource.addToLibrary } })}
                  onAddToLibraryChange={(v) => set({ resource: { ...value.resource, addToLibrary: v } })}
                />
              </div>
            )}

            {showFullCounts && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <CountField label="Toplam" value={value.totalCount} onChange={(v) => handleCountFieldChange("total", v)} />
                  <CountField label="Doğru" value={value.correctCount} onChange={(v) => handleCountFieldChange("correct", v)} />
                  <CountField label="Yanlış" value={value.wrongCount} onChange={(v) => handleCountFieldChange("wrong", v)} />
                  <CountField label="Boş" value={value.emptyCount} onChange={(v) => handleCountFieldChange("empty", v)} />
                </div>
                {totalMismatch && <p className="text-destructive text-xs">Toplam, Doğru + Yanlış + Boş toplamına eşit değil.</p>}
              </div>
            )}

            {showTotalOnly && (
              <div className="space-y-1.5">
                <Label htmlFor="rich-task-total-only" className="text-sm font-semibold">
                  {isBranchExam ? "Kaç Adet (opsiyonel)" : "Soru Sayısı (opsiyonel)"}
                </Label>
                <Input
                  id="rich-task-total-only"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={value.totalCount}
                  onChange={(e) => set({ totalCount: sanitizeDigits(e.target.value) })}
                  placeholder="Örn: 40"
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

            {!isFree && (isBranchExam || isGeneralExam) && (
              <p className="text-muted-foreground text-xs">
                Sonuçlarını (Doğru/Yanlış/Boş) girmek için görevi oluşturduktan sonra karttan aç.
              </p>
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
