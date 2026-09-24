"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AYT_COURSES_BY_TRACK,
  BRANCH_EXAM_MACRO_COURSES,
  isBranchExamMacroCourseId,
  isLgsCourseId,
  LGS_COURSES,
  ROUTINE_COURSES,
  YENI_NESIL_MAT_DOZU_ID,
  TYT_COURSES,
  topicOptionsForCourse,
  type Course,
} from "@/lib/curriculum";
import { lgsCourseOptions } from "@/lib/curriculum/subject-groups";
import type { ExamType } from "@/lib/exam-type";
import { fetchYoutubeTitle, type AssignableTaskType } from "../../../../actions";
import type { DetailTask } from "../../types";
import type { CourseResourceData } from "../kaynak-takibi-tab";
import { ResourceCombobox } from "./resource-combobox";
import { SmartCombobox } from "./smart-combobox";

export const ALL_COURSES: Course[] = [
  ...TYT_COURSES,
  ...AYT_COURSES_BY_TRACK.sayisal,
  ...AYT_COURSES_BY_TRACK.ea,
  ...AYT_COURSES_BY_TRACK.sozel,
  ...LGS_COURSES,
  ...ROUTINE_COURSES,
  ...BRANCH_EXAM_MACRO_COURSES,
];

// Macro branch-exam courses ("TYT Fen") already carry their full display
// name -- unlike every atomic course, which stores a bare name ("Fizik")
// and relies on this prefix. Prefixing a macro course's name too would
// double up ("TYT TYT Fen").
export function courseLabel(course: Course) {
  if (isBranchExamMacroCourseId(course.id)) return course.name;
  return `${course.id.startsWith("tyt-") ? "TYT " : course.id.startsWith("ayt-") ? "AYT " : ""}${course.name}`;
}

// "Video İzleme" used to be its own selectable type; it's now folded
// into "Konu Çalışması" (see valueFromTask's legacy normalization below)
// since the two always shared the exact same field-visibility logic
// here anyway -- a topic study can optionally carry a video link, or
// several, or none.
export const TASK_TYPE_OPTIONS: { value: AssignableTaskType; label: string }[] = [
  { value: "question_bank", label: "Soru Çözümü" },
  { value: "topic_study", label: "Konu Çalışması / Video" },
  { value: "branch_exam", label: "Branş Denemesi" },
  { value: "general_exam", label: "Genel Deneme" },
];

const GENERAL_EXAM_TRACK_OPTIONS = [
  { value: "tyt", label: "TYT" },
  { value: "ayt", label: "AYT" },
] as const;

export type TaskFormVideoLink = { url: string; title: string };

// One row in the dynamic resource list -- a task can hold 0..N of these
// (e.g. "Soru Çözümü A", "Soru Çözümü B", ...), each independently
// either an existing student_resources row (resourceId set) or a
// not-yet-created name the coach is typing (resourceId empty).
export type TaskFormResource = {
  resourceId: string;
  resourceName: string;
  // Whether a brand-new resourceName (no matching resourceId) should be
  // persisted to student_resources at save time, or just left unlinked.
  addToLibrary: boolean;
};

export type TaskFormValue = {
  taskType: AssignableTaskType;
  courseId: string;
  topicId: string;
  resources: TaskFormResource[];
  totalCount: string;
  durationMinutes: string;
  videoLinks: TaskFormVideoLink[];
  // "Genel Deneme" only -- no course/topic exists for a general exam, so
  // these two live only in form state and get folded into the saved
  // title string (buildGeneralExamTitle in actions.ts), never persisted
  // as their own columns.
  generalExamTrack: "tyt" | "ayt" | "lgs";
  generalExamPublisher: string;
  // "Branş Denemesi" only -- same "lives only in the title, never its own
  // column" convention as generalExamPublisher above.
  branchExamPublisher: string;
  // "Kitap Okuma" only -- the book's name IS the title, entered directly
  // (no course/topic exists for this type, unlike branchExamPublisher
  // which suffixes onto a real course+topic title).
  bookTitle: string;
};

function emptyResourceRow(): TaskFormResource {
  return { resourceId: "", resourceName: "", addToLibrary: true };
}

// The Ders options a cohort is offered. LGS gets its own six subjects
// (SÖZEL first, then SAYISAL, grouped) plus the Paragraf / Kitap Okuma
// routine pseudo-courses -- never Problem, which is a YKS routine. YKS is
// exactly what it always was, minus the LGS courses now living in
// ALL_COURSES for lookups.
export function courseOptionsFor(examType: ExamType, isBranchExam: boolean): { id: string; label: string; group?: string }[] {
  if (examType === "LGS") {
    return [
      ...lgsCourseOptions(),
      ...ROUTINE_COURSES.filter((c) => c.id !== "problem").map((c) => ({ id: c.id, label: c.name })),
    ];
  }
  const atomic = ALL_COURSES.filter(
    (c) => !isBranchExamMacroCourseId(c.id) && !isLgsCourseId(c.id) && c.id !== YENI_NESIL_MAT_DOZU_ID,
  );
  return (isBranchExam ? [...BRANCH_EXAM_MACRO_COURSES, ...atomic] : atomic).map((c) => ({ id: c.id, label: courseLabel(c) }));
}

export function firstCourseIdFor(examType: ExamType): string {
  return examType === "LGS" ? LGS_COURSES[0].id : ALL_COURSES[0].id;
}

export function defaultTaskFormValue(examType: ExamType = "YKS"): TaskFormValue {
  return {
    taskType: "question_bank",
    courseId: firstCourseIdFor(examType),
    topicId: "",
    resources: [],
    totalCount: "",
    durationMinutes: "",
    videoLinks: [],
    generalExamTrack: examType === "LGS" ? "lgs" : "tyt",
    generalExamPublisher: "",
    branchExamPublisher: "",
    bookTitle: "",
  };
}

// Reverses buildGeneralExamTitle's "TYT Genel Deneme - Yayınevi" shape so
// editing an existing general-exam task pre-fills the track/publisher
// fields instead of showing them blank.
function parseGeneralExamTitle(title: string): { track: "tyt" | "ayt" | "lgs"; publisher: string } {
  const match = title.match(/^(TYT|AYT|LGS)\s+Genel Deneme(?:\s*-\s*(.*))?$/i);
  const track = match?.[1].toLowerCase();
  return { track: track === "ayt" ? "ayt" : track === "lgs" ? "lgs" : "tyt", publisher: match?.[2]?.trim() ?? "" };
}

// Reverses buildBranchExamTitle's " - Yayınevi" suffix (app/coach/actions.ts)
// so editing an existing branch-exam task pre-fills the publisher field.
// Course/topic themselves come straight from the task's own course_id/
// topic_id columns, not from the title text.
function parseBranchExamPublisher(title: string): string {
  const match = title.match(/ - ([^-]+)$/);
  return match?.[1]?.trim() ?? "";
}

function isAssignableType(t: string): t is AssignableTaskType {
  return (
    t === "question_bank" ||
    t === "topic_study" ||
    t === "branch_exam" ||
    t === "general_exam" ||
    t === "video" ||
    t === "reading"
  );
}

export function valueFromTask(task: DetailTask | null, courseResourceData?: CourseResourceData): TaskFormValue {
  if (!task) return defaultTaskFormValue();
  const courseId = task.course_id ?? ALL_COURSES[0].id;
  // Legacy rows saved before the video/topic_study merge: normalize to
  // topic_study on load so the (now single) dropdown option matches, and
  // any later save of this task naturally completes the migration.
  const rawTaskType = isAssignableType(task.task_type) ? task.task_type : "question_bank";
  const taskType = rawTaskType === "video" ? "topic_study" : rawTaskType;
  // Same kind split as the picker itself (0044) -- a branch_exam task's
  // linked resource_ids live in branchExamResources, never the plain
  // study pool, so looking the name up in the wrong one silently showed
  // an empty "Yayınevi / Kaynak" field for an already-linked branch exam
  // task the moment it's reopened for editing.
  const libraryResources =
    taskType === "branch_exam"
      ? (courseResourceData?.[courseId]?.branchExamResources ?? [])
      : (courseResourceData?.[courseId]?.resources ?? []);
  const resources: TaskFormResource[] = task.resource_ids.map((id) => ({
    resourceId: id,
    resourceName: libraryResources.find((r) => r.id === id)?.name ?? "",
    addToLibrary: true,
  }));
  const generalExam: { track: "tyt" | "ayt" | "lgs"; publisher: string } =
    taskType === "general_exam" ? parseGeneralExamTitle(task.title) : { track: "tyt", publisher: "" };
  const branchExamPublisher = taskType === "branch_exam" ? parseBranchExamPublisher(task.title) : "";
  // An older branch exam task saved before this field merged into Kaynak
  // (or one whose linked resource was later removed) has a publisher only
  // in its title text, no resource row to show it in -- seed one so it's
  // visible/editable instead of appearing blank, but addToLibrary false:
  // this row represents text that was never a real library link, and
  // re-saving without touching it shouldn't start silently creating one.
  const finalResources =
    taskType === "branch_exam" && resources.length === 0 && branchExamPublisher
      ? [{ resourceId: "", resourceName: branchExamPublisher, addToLibrary: false }]
      : resources;
  return {
    taskType,
    courseId,
    topicId: task.topic_id ?? "",
    resources: finalResources,
    totalCount: task.total_count?.toString() ?? "",
    durationMinutes: task.duration_minutes?.toString() ?? "",
    videoLinks: (task.video_links ?? []).map((v) => ({ url: v.url, title: v.title ?? "" })),
    generalExamTrack: generalExam.track,
    generalExamPublisher: generalExam.publisher,
    branchExamPublisher,
    // The book name IS the title, no suffix-parsing needed (unlike
    // branchExamPublisher above).
    bookTitle: taskType === "reading" ? task.title : "",
  };
}

function numberOrNull(s: string): number | null {
  return s.trim() ? Number(s) : null;
}

// Does not include resourceIds -- that requires resolving not-yet-created
// resource names into real ids first (async), which the caller does
// separately (see task-drawer.tsx's resolveResourceIds) and merges in.
export function taskFormValueToPayload(value: TaskFormValue) {
  if (value.taskType === "general_exam") {
    return {
      taskType: value.taskType,
      courseId: null,
      topicId: null,
      totalCount: null,
      durationMinutes: null,
      videoLinks: [],
      generalExamTrack: value.generalExamTrack,
      generalExamPublisher: value.generalExamPublisher.trim() || null,
    };
  }

  const videoLinks = value.videoLinks
    .filter((v) => v.url.trim())
    .map((v) => ({ url: v.url.trim(), title: v.title.trim() || null }));

  return {
    taskType: value.taskType,
    // Forced here too (not just server-side) so the drawer's own local
    // state (e.g. the resource picker's course-scoped pool) never reads a
    // stale courseId left over from whichever type was selected before
    // switching to Kitap Okuma.
    courseId: value.taskType === "reading" ? "kitap-okuma" : value.courseId || null,
    topicId: value.taskType === "reading" ? null : value.topicId || null,
    totalCount: numberOrNull(value.totalCount),
    durationMinutes: numberOrNull(value.durationMinutes),
    videoLinks,
    // No separate "Yayınevi" prompt anymore -- the coach already names the
    // publisher(s) in the Kaynak field just below (showResource's
    // "Yayınevi / Kaynak" section), so this derives straight from those
    // resource names instead of asking for the same thing twice. Joined
    // with " + " for the (less common) multi-resource case, same
    // convention resource_names.join(" + ") already uses elsewhere in this
    // app. Falls back to value.branchExamPublisher -- never shown as its
    // own input anymore, but still seeded by valueFromTask's title parse
    // when editing an older task -- so re-saving an existing branch exam
    // without touching its resources doesn't blank out a publisher that
    // was only ever recorded in the title text.
    branchExamPublisher:
      value.taskType === "branch_exam"
        ? value.resources
            .map((r) => r.resourceName.trim())
            .filter(Boolean)
            .join(" + ") || value.branchExamPublisher.trim() || null
        : null,
    bookTitle: value.taskType === "reading" ? value.bookTitle.trim() || null : null,
  };
}

function selectClassName() {
  return "border-input bg-background flex h-10 md:h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
}

function VideoLinkRow({
  link,
  onChange,
  onRemove,
}: {
  link: TaskFormVideoLink;
  onChange: (next: TaskFormVideoLink) => void;
  onRemove: () => void;
}) {
  const [fetching, setFetching] = useState(false);

  // Automatic, no extra click: fires when the coach pastes a link and
  // then moves on (blur). Guarded on a title already being resolved so
  // repeatedly tabbing through the field doesn't re-fetch every time --
  // onChange above always clears title back to "" the moment the url
  // text itself changes, so a non-empty title here reliably means "this
  // exact url was already fetched."
  async function handleBlur() {
    const url = link.url.trim();
    if (!url || link.title || fetching) return;
    setFetching(true);
    try {
      const title = await fetchYoutubeTitle(url);
      onChange({ url, title: title ?? "" });
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={link.url}
            onChange={(e) => onChange({ url: e.target.value, title: "" })}
            onBlur={handleBlur}
            placeholder="https://youtube.com/watch?v=..."
            className={fetching ? "pr-9" : undefined}
          />
          {fetching && (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Videoyu kaldır">
          <X className="size-4" />
        </Button>
      </div>
      {link.title && <p className="text-muted-foreground text-xs break-words">Başlık: {link.title}</p>}
    </div>
  );
}

// Shared field set for the "Smart Task Form" -- searchable course/topic
// comboboxes (topic list always includes "Karma"), question count front
// and center, duration de-emphasized/optional, and any number of YouTube
// smart links, each fetched independently. Reused by the drawer's create
// and edit modes -- only the surrounding chrome differs between them.
export function TaskFormFields({
  value,
  onChange,
  courseResourceData,
  hideCourseTopic,
  examType = "YKS",
}: {
  value: TaskFormValue;
  onChange: (next: TaskFormValue) => void;
  courseResourceData?: CourseResourceData;
  // The routine drawer already fixes the course to Paragraf/Problem
  // before this renders -- showing the Ders/Konu pickers again would
  // just invite the coach to accidentally pick something else.
  hideCourseTopic?: boolean;
  // Which cohort's subjects to offer (and whether a general exam asks for
  // a TYT/AYT choice at all) -- the rest of this form is cohort-agnostic.
  examType?: ExamType;
}) {
  const isLgs = examType === "LGS";
  const course = ALL_COURSES.find((c) => c.id === value.courseId) ?? ALL_COURSES.find((c) => c.id === firstCourseIdFor(examType)) ?? ALL_COURSES[0];
  const topicOptions = topicOptionsForCourse(course);
  const isGeneralExam = value.taskType === "general_exam";
  const isBranchExam = value.taskType === "branch_exam";
  const isReading = value.taskType === "reading";
  // Macro ("whole fruit") subjects lead the Ders picker, atomic ("sliced")
  // ones follow -- ALL_COURSES itself stays atomic-first (its [0] is the
  // universal fallback default for every OTHER task type), so the reorder
  // happens only here, in the branch_exam-only display list (see
  // courseOptionsFor). LGS has no macro subjects -- its branş denemeleri
  // are per single subject.
  const courseOptions = courseOptionsFor(examType, isBranchExam);
  // A course's resources are split by kind (0044) -- branch_exam tasks
  // only ever offer that course's branch-trial inventory, question_bank
  // tasks only ever offer its plain study resources. The two pools are
  // never mixed in one picker.
  const allResources = courseResourceData?.[value.courseId]?.resources ?? [];
  const branchExamResources = courseResourceData?.[value.courseId]?.branchExamResources ?? [];
  const resources = isBranchExam
    ? branchExamResources.map((r) => ({ id: r.id, name: r.name, is_active: true }))
    : allResources;
  // Shown for Paragraf/Problem too (hideCourseTopic no longer excludes
  // it) -- their resources live under course_id "paragraf"/"problem" in
  // student_resources, same lookup as any real course. Also shown for
  // "Konu Çalışması / Video" -- a study/video task can point the student
  // at specific books to solve questions from, same as a pure Soru
  // Bankası task.
  const showResource =
    (value.taskType === "question_bank" || value.taskType === "topic_study" || isBranchExam) && !!courseResourceData;

  // "Genel Deneme" has no course/topic/count/duration/video at all --
  // replaced by the Sınav Türü + Yayınevi fields below. The merged
  // "Konu Çalışması / Video" keeps everything (course/topic/count/
  // duration/video), all optional except course. "Branş Denemesi" never
  // asks for a topic (a trial isn't scoped to one topic) and repurposes
  // the count field as a trial-copy quantity instead of a question count.
  // "Kitap Okuma" has no course/topic/resource either (the book name IS
  // the title, see the dedicated Kitap Adı field below) -- Sayfa Sayısı
  // reuses the same count field question_bank's Soru Sayısı does.
  const showCourse = !hideCourseTopic && !isGeneralExam && !isReading;
  const showTopic = !hideCourseTopic && !isGeneralExam && !isBranchExam && !isReading;
  const showCount = !isGeneralExam;
  const showDuration = !isGeneralExam;
  const showVideoLinks = !isGeneralExam && !isReading;

  function set(patch: Partial<TaskFormValue>) {
    onChange({ ...value, ...patch });
  }

  function updateVideoLink(i: number, next: TaskFormVideoLink) {
    set({ videoLinks: value.videoLinks.map((v, idx) => (idx === i ? next : v)) });
  }

  function removeVideoLink(i: number) {
    set({ videoLinks: value.videoLinks.filter((_, idx) => idx !== i) });
  }

  function addVideoLink() {
    set({ videoLinks: [...value.videoLinks, { url: "", title: "" }] });
  }

  function addResourceRow() {
    set({ resources: [...value.resources, emptyResourceRow()] });
  }

  function updateResourceRow(i: number, next: TaskFormResource) {
    set({ resources: value.resources.map((r, idx) => (idx === i ? next : r)) });
  }

  function removeResourceRow(i: number) {
    set({ resources: value.resources.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-4">
      {/* Kitap Okuma has no sub-choice to make here -- picking the Rutin
          Türü pill (task-drawer.tsx) already fixes taskType to "reading"
          on its own, so this selector (and its now-absent "Kitap Okuma"
          option) would only show a stale/unmatched value underneath an
          already-decided pill. */}
      {!isReading && (
        <div className="space-y-1.5">
          <Label htmlFor="task-form-type">Görev Türü</Label>
          <select
            id="task-form-type"
            className={selectClassName()}
            value={value.taskType}
            onChange={(e) => {
              const taskType = e.target.value as AssignableTaskType;
              set({
                taskType,
                // Branş Denemesi seeds one empty row up front -- it's now
                // the only place the publisher gets typed (see the removed
                // standalone Yayınevi field below), so the field the coach
                // actually needs is visible immediately instead of behind
                // an extra "Kaynak Ekle" click.
                resources: taskType === "branch_exam" ? [emptyResourceRow()] : [],
                totalCount: taskType === "branch_exam" && !value.totalCount.trim() ? "1" : value.totalCount,
              });
            }}
          >
            {TASK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {isGeneralExam && (
        <div className={cn("grid grid-cols-1 gap-3", !isLgs && "sm:grid-cols-2")}>
          {/* LGS has exactly one general exam format, so there's no
              TYT/AYT-style Sınav Türü to choose between. */}
          {!isLgs && (
            <div className="space-y-1.5">
              <Label>Sınav Türü</Label>
              <div className="flex gap-1.5">
                {GENERAL_EXAM_TRACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
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
            <Label htmlFor="task-form-publisher">Yayınevi</Label>
            <Input
              id="task-form-publisher"
              value={value.generalExamPublisher}
              onChange={(e) => set({ generalExamPublisher: e.target.value })}
              placeholder="Örn: 3D Yayınları"
            />
          </div>
        </div>
      )}

      {isReading && (
        <div className="space-y-1.5">
          <Label htmlFor="task-form-book-title">Kitap Adı</Label>
          <Input
            id="task-form-book-title"
            value={value.bookTitle}
            onChange={(e) => set({ bookTitle: e.target.value })}
            placeholder="Örn: Fatih Harbiye"
          />
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
                onChange={(courseId) => set({ courseId, topicId: "", resources: [] })}
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
          {/* "Yayınevi / Kaynak" for a branch exam -- same label the
              Kaynak Takibi stock table already uses for this exact field
              (app/coach/students/[id]/_components/branch-exam-stock-table.tsx),
              now doing double duty as the publisher input too (see
              taskFormValueToPayload's branchExamPublisher derivation). */}
          <Label>{isBranchExam ? "Yayınevi / Kaynak" : "Kaynaklar (opsiyonel)"}</Label>
          {value.resources.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <ResourceCombobox
                  resources={resources}
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

      {showCount && (
        <div className="space-y-1.5">
          <Label htmlFor="task-form-count" className="text-sm font-semibold">
            {isBranchExam
              ? "Kaç Adet"
              : isReading
                ? "Sayfa Sayısı (opsiyonel)"
                : value.taskType === "topic_study"
                  ? "Soru Sayısı (opsiyonel)"
                  : "Soru Sayısı / Hedef"}
          </Label>
          <Input
            id="task-form-count"
            type="number"
            min={0}
            inputMode="numeric"
            value={value.totalCount}
            onChange={(e) => set({ totalCount: e.target.value })}
            placeholder={isReading ? "Örn: 250" : "Örn: 40"}
          />
        </div>
      )}

      {showDuration && (
        <div className="space-y-1.5">
          <Label htmlFor="task-form-duration" className="text-muted-foreground text-xs font-normal">
            Hedef Süre (dk) — opsiyonel
          </Label>
          <Input
            id="task-form-duration"
            type="number"
            min={0}
            inputMode="numeric"
            value={value.durationMinutes}
            onChange={(e) => set({ durationMinutes: e.target.value })}
            className="max-w-[140px]"
          />
        </div>
      )}

      {showVideoLinks && (
        <div className="space-y-2">
          <Label>Video Linkleri (opsiyonel)</Label>
          {value.videoLinks.map((link, i) => (
            <VideoLinkRow key={i} link={link} onChange={(next) => updateVideoLink(i, next)} onRemove={() => removeVideoLink(i)} />
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addVideoLink}>
            <Plus className="size-3.5" />
            Video Ekle
          </Button>
        </div>
      )}
    </div>
  );
}
