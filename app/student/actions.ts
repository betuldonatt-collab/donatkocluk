"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { countsAreConsistent } from "@/lib/count-fields";
import { dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { mondayOf } from "@/lib/date";
import { findCourseById, findTopicById } from "@/lib/curriculum";
import { EXAMS_PAGE_SIZE } from "./constants";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return user;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih.");

export type TaskProgressPatch = Partial<{
  total_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  empty_count: number | null;
  duration_minutes: number | null;
  tracked_duration_minutes: number;
  subject_scores: Record<string, { correct: number | null; wrong: number | null; empty: number | null }> | null;
  completed: boolean;
  analysis_pending: boolean;
  status: "pending" | "done" | "half_done" | "not_done";
  reason: string | null;
  note: string | null;
}>;

const SCORE_FIELDS = ["total_count", "correct_count", "wrong_count", "empty_count"] as const;

// Recomputes one (student, course, topic) bucket in student_topic_stats
// (migration 0072) from scratch -- called after any write that could
// change a task's contribution to it. Mirrors recomputeDailyStats' own
// call-site-driven, self-healing idiom, one level up. A null courseId
// (e.g. a task with no curriculum course attached) has no bucket to
// recompute -- every call site below checks for that before calling this.
async function recomputeTopicStats(supabase: SupabaseClient, studentId: string, courseId: string, topicId: string | null) {
  const { error } = await supabase.rpc("recompute_student_topic_stats", {
    p_student_id: studentId,
    p_course_id: courseId,
    p_topic_id: topicId ?? "karma",
  });
  if (error) throw dbError(error);
}

const countField = z.number().int().min(0).max(10000).nullable().optional();
const subjectScoreSchema = z.object({
  correct: z.number().int().min(0).max(10000).nullable(),
  wrong: z.number().int().min(0).max(10000).nullable(),
  empty: z.number().int().min(0).max(10000).nullable(),
});
const taskProgressPatchSchema = z
  .object({
    total_count: countField,
    correct_count: countField,
    wrong_count: countField,
    empty_count: countField,
    duration_minutes: z.number().int().min(0).max(1440).nullable().optional(),
    tracked_duration_minutes: z.number().int().min(0).max(1440).optional(),
    subject_scores: z.record(z.string(), subjectScoreSchema).nullable().optional(),
    completed: z.boolean().optional(),
    analysis_pending: z.boolean().optional(),
    status: z.enum(["pending", "done", "half_done", "not_done"]).optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      countsAreConsistent({
        total: v.total_count ?? null,
        correct: v.correct_count ?? null,
        wrong: v.wrong_count ?? null,
        empty: v.empty_count ?? null,
      }),
    { message: "Toplam, Doğru + Yanlış + Boş toplamına eşit olmalıdır.", path: ["total_count"] },
  );

// Security Hardening Group 4 (double-layer authorization): student_tasks
// RLS (student_tasks_student_update) already restricts this update to
// student_id = auth.uid() -- but relying on that alone means a
// cross-account attempt would previously surface here as a confusing
// ".single()" crash (RLS filters the UPDATE to 0 matched rows, then
// .select().single() throws on "no rows returned"), not a clear rejection.
// Fetching the task's real owner first and comparing explicitly turns
// that into an intentional, immediate "not yours" error instead.
export async function updateTaskProgress(taskId: string, patch: TaskProgressPatch) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const patchV = parseInput(taskProgressPatchSchema, patch);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_tasks")
    .select("student_id")
    .eq("id", taskIdV)
    .maybeSingle();
  if (fetchError) throw dbError(fetchError);
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  const { data, error } = await supabase
    .from("student_tasks")
    .update({ ...patchV, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .select("*")
    .single();

  if (error) throw dbError(error);

  // Any task carrying a score (question_bank, branch_exam, ...) folds
  // straight into that day's student_daily_stats -- there's no separate
  // "log your grand total" step for the student to keep in sync by hand.
  if (SCORE_FIELDS.some((f) => f in patchV)) {
    await recomputeDailyStats(supabase, data.student_id, data.task_date);
  }
  // Counts AND status both affect this task's contribution to its topic
  // bucket (student_topic_stats, migration 0072) -- a status flip alone
  // (e.g. done -> not_done, with the same old counts still on the row)
  // must resync it just as much as a count edit does.
  if (data.course_id && (SCORE_FIELDS.some((f) => f in patchV) || "status" in patchV)) {
    await recomputeTopicStats(supabase, data.student_id, data.course_id, data.topic_id);
  }

  revalidatePath("/student");
  return data;
}

const setVideoLinkWatchedSchema = z.object({
  taskId: uuidSchema,
  url: z.string().trim().min(1).max(2000),
  watched: z.boolean(),
});

// Toggles ONE entry inside a task's video_links jsonb array by url (its
// natural key -- links don't carry a separate id) rather than by array
// index, since an index can silently point at the wrong entry if the
// array was ever reordered between page load and this click. Same
// double-layer ownership check as updateTaskProgress above. Doesn't touch
// total_count/status/course_id/topic_id, so unlike updateTaskProgress
// this never needs a student_daily_stats or student_topic_stats
// recompute -- watched is purely descriptive metadata on the link itself.
//
// Known limitation, not addressed here: a coach re-saving this task's
// video links via updateAssignedTask (app/coach/actions.ts) replaces the
// whole video_links array from their own form, which doesn't carry a
// watched flag -- any watched state a student had already set would be
// lost if a coach edits the same task's links afterward.
export async function setVideoLinkWatched(taskId: string, url: string, watched: boolean) {
  await assertNotImpersonating();
  const v = parseInput(setVideoLinkWatchedSchema, { taskId, url, watched });
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("student_tasks")
    .select("student_id, video_links")
    .eq("id", v.taskId)
    .maybeSingle();
  if (fetchError) throw dbError(fetchError);
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  const links = (existing.video_links ?? []) as { url: string; title: string | null; watched?: boolean }[];
  if (!links.some((link) => link.url === v.url)) {
    throw new Error("Video linki bulunamadı.");
  }
  const updatedLinks = links.map((link) => (link.url === v.url ? { ...link, watched: v.watched } : link));

  const { data, error } = await supabase
    .from("student_tasks")
    .update({ video_links: updatedLinks, updated_at: new Date().toISOString() })
    .eq("id", v.taskId)
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

const orderListSchema = z.array(z.object({ id: uuidSchema, order_index: z.number().int().min(0) }));

// Persists a drag-and-drop reorder within one day's task list. Runs as
// parallel per-row updates rather than a single query -- day lists are
// short (a handful of tasks), and Supabase's client has no multi-row
// "update different values per row" primitive short of an upsert (which
// would require sending every NOT NULL column, not just order_index).
// RLS (student_tasks_student_update) already scopes each individual
// update to the caller's own rows -- an id belonging to someone else
// just fails silently here (0 rows touched), which is fine for a
// best-effort reorder with no single-row response to crash on, unlike
// updateTaskProgress above.
export async function updateTaskOrder(orders: { id: string; order_index: number }[]) {
  await assertNotImpersonating();
  const ordersV = parseInput(orderListSchema, orders);
  const supabase = await createClient();
  const results = await Promise.all(
    ordersV.map(({ id, order_index }) =>
      supabase.from("student_tasks").update({ order_index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw dbError(failed.error);

  revalidatePath("/student");
}

export async function deleteCustomTask(taskId: string) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  // Fetched before the delete -- need student_id/task_date to resync
  // that day's stats afterward, and the row won't exist to read anymore
  // once it's gone. Doubles as the double-layer ownership check (Security
  // Hardening Group 4): student_tasks_student_delete_custom already
  // restricts this to the caller's own, not-coach-assigned rows, but
  // rejecting explicitly here means "not yours" instead of a silent no-op.
  const { data: existing } = await supabase
    .from("student_tasks")
    .select("student_id, task_date, total_count, course_id, topic_id")
    .eq("id", taskIdV)
    .maybeSingle();
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  const { error } = await supabase.from("student_tasks").delete().eq("id", taskIdV);
  if (error) throw dbError(error);

  if (existing.total_count !== null) {
    await recomputeDailyStats(supabase, existing.student_id, existing.task_date);
  }
  if (existing.course_id) {
    await recomputeTopicStats(supabase, existing.student_id, existing.course_id, existing.topic_id);
  }

  revalidatePath("/student");
}

const ratingSchema = z.object({
  sessionId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(2000).nullable(),
});

export async function submitSessionRating(sessionId: string, rating: number, feedback: string | null) {
  await assertNotImpersonating();
  const inputV = parseInput(ratingSchema, { sessionId, rating, feedback });
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: session } = await supabase
    .from("coaching_sessions")
    .select("student_id")
    .eq("id", inputV.sessionId)
    .maybeSingle();
  if (!session || session.student_id !== user.id) {
    throw new Error("Bu görüşme sana ait değil.");
  }

  const { data, error } = await supabase
    .from("coaching_sessions")
    .update({
      student_rating: inputV.rating,
      student_feedback: inputV.feedback,
      rated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inputV.sessionId)
    .select("*")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

// "Daha Fazla Yükle" on Deneme Analizleri (branş & genel) -- both pages'
// initial server fetch only loads the most recent EXAMS_PAGE_SIZE exams of
// that type. Shared helper since branş/genel differ only in task_type.
async function getMoreExams(taskType: "branch_exam" | "general_exam", offset: number) {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: examRows, error } = await supabase
    .from("student_tasks")
    .select("*")
    .eq("student_id", user.id)
    .eq("task_type", taskType)
    .order("task_date", { ascending: false })
    .range(offset, offset + EXAMS_PAGE_SIZE - 1);
  if (error) throw dbError(error);

  const exams = examRows ?? [];
  const examIds = exams.map((e) => e.id);
  const { data: mistakeRows } =
    examIds.length > 0
      ? await supabase.from("student_task_topic_mistakes").select("task_id, course_id, topic_id").in("task_id", examIds)
      : { data: [] };

  return { exams, mistakes: mistakeRows ?? [] };
}

export async function getMoreBransExams(offset: number) {
  return getMoreExams("branch_exam", offset);
}

export async function getMoreGenelExams(offset: number) {
  return getMoreExams("general_exam", offset);
}

export async function getTaskTopicMistakes(taskId: string) {
  const taskIdV = parseInput(uuidSchema, taskId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_task_topic_mistakes")
    .select("course_id, topic_id, status")
    .eq("task_id", taskIdV);

  if (error) throw dbError(error);
  return data as { course_id: string; topic_id: string; status: "wrong" | "blank" }[];
}

const mistakeSchema = z.object({
  course_id: z.string().trim().max(60),
  topic_id: z.string().trim().max(60),
  status: z.enum(["wrong", "blank"]),
});

// Replaces the full mistake-topic set for a task and resolves its
// analysis: `deferred` persists the counts only ("Analizi Sonra Yap"),
// leaving analysis_pending true and skipping the topic list entirely.
export async function saveTaskAnalysis(
  taskId: string,
  mistakes: { course_id: string; topic_id: string; status: "wrong" | "blank" }[],
  deferred: boolean,
) {
  await assertNotImpersonating();
  const taskIdV = parseInput(uuidSchema, taskId);
  const mistakesV = parseInput(z.array(mistakeSchema), mistakes);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: existing } = await supabase
    .from("student_tasks")
    .select("student_id")
    .eq("id", taskIdV)
    .maybeSingle();
  if (!existing || existing.student_id !== user.id) {
    throw new Error("Bu görev sana ait değil.");
  }

  if (!deferred) {
    const { error: deleteError } = await supabase
      .from("student_task_topic_mistakes")
      .delete()
      .eq("task_id", taskIdV);
    if (deleteError) throw dbError(deleteError);

    if (mistakesV.length > 0) {
      const { error: insertError } = await supabase
        .from("student_task_topic_mistakes")
        .insert(mistakesV.map((m) => ({ task_id: taskIdV, course_id: m.course_id, topic_id: m.topic_id, status: m.status })));
      if (insertError) throw dbError(insertError);
    }
  }

  const { data, error } = await supabase
    .from("student_tasks")
    .update({ analysis_pending: deferred, updated_at: new Date().toISOString() })
    .eq("id", taskIdV)
    .select("*")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

// --- Daily stats ("Günlük İstatistiklerim") -------------------------------

// Deliberately NOT a manual "type your grand total for the day" form --
// that was the original 0031 design, and it fought with the organic
// per-task numbers constantly (a student's typed total would drift from
// reality the moment they logged one more question bank result, and
// nothing reconciled the two). Instead this is a full resync: sum every
// one of the student's tasks for entry_date that actually carries a
// score, and overwrite the day's row with that sum. Recomputing from
// source beats incrementing -- an edit or delete on any task is reflected
// correctly for free, with no risk of double-counting or drift.
// Security audit hardening: this used to be a fetch-every-task-then-JS-
// sum-then-upsert round trip, relying on student_daily_stats_own being a
// FOR ALL RLS policy so this same anon-key client could write the
// result -- but that same policy let a student write ANY total directly
// via the Supabase client too, with zero validation, completely
// bypassing every Zod/countsAreConsistent guard built for student_tasks.
// Migration 0057 replaced that policy with SELECT-only and moved the
// aggregation into recompute_student_daily_stats(), a security definer
// RPC that resolves auth.uid() internally (never a caller-supplied id)
// and does the sum + upsert as one atomic SQL statement -- a student can
// now only ever trigger a trusted recompute from their own real task
// data, never supply the numbers themselves. `studentId` is kept as a
// parameter here purely so every call site still reads as "whose day is
// this," but the RPC itself ignores it and always resolves the caller.
async function recomputeDailyStats(
  supabase: SupabaseClient,
  studentId: string,
  entryDate: string,
) {
  void studentId;
  const { data, error } = await supabase.rpc("recompute_student_daily_stats", { p_entry_date: entryDate }).single();
  if (error) throw dbError(error);
  return data;
}

// Public entry point for the student's own resync (e.g. after deleting a
// custom task, where updateTaskProgress's own auto-recompute never runs).
export async function submitDailyStats(entryDate: string) {
  await assertNotImpersonating();
  const entryDateV = parseInput(dateSchema, entryDate);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const data = await recomputeDailyStats(supabase, user.id, entryDateV);
  revalidatePath("/student");
  return data;
}

// --- Week navigation ("Bu Hafta" history) ---------------------------------

// Lets the student's own "Bu Hafta" grid load ANY week, not just the
// current one -- RLS never actually blocked reading a past week
// (student_tasks_student_select has no date restriction, only the write
// policies do), the task board simply had no UI to ask for one. A locked
// week is exactly where this matters most: without it, a student loses
// all visibility into a program the moment their coach finalizes it.
export async function getTasksForWeek(weekStart: string, weekEnd: string) {
  const weekStartV = parseInput(dateSchema, weekStart);
  const weekEndV = parseInput(dateSchema, weekEnd);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const [{ data: taskRows, error }, { data: lockRow }] = await Promise.all([
    supabase
      .from("student_tasks")
      .select("*")
      .eq("student_id", user.id)
      .gte("task_date", weekStartV)
      .lte("task_date", weekEndV)
      .order("created_at", { ascending: true }),
    supabase.from("week_locks").select("id").eq("student_id", user.id).eq("week_start_date", weekStartV).maybeSingle(),
  ]);
  if (error) throw dbError(error);

  const weekLocked = lockRow !== null;
  return {
    tasks: (taskRows ?? []).map((t) => ({ ...t, week_locked: weekLocked })),
    weekLocked,
  };
}

// --- Announcements (RSVP) --------------------------------------------------

const rsvpSchema = z.object({
  announcementId: uuidSchema,
  response: z.enum(["attending", "not_attending"]),
  declineReason: z.string().trim().max(2000).nullable(),
});

// Upsert scoped to student_id = user.id -- matches the coach-notifications
// precedent (assertNotImpersonating + an explicit owner-id filter) rather
// than a requireXAccess helper, since this is a direct-ownership write with
// no cross-role relationship to check. announcement_rsvps' own check
// constraint (a decline needs a non-empty reason) is the DB-level backstop
// behind the client-side "required textarea" validation.
export async function submitAnnouncementRsvp(
  announcementId: string,
  response: "attending" | "not_attending",
  declineReason: string | null,
) {
  await assertNotImpersonating();
  const inputV = parseInput(rsvpSchema, { announcementId, response, declineReason });
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase
    .from("announcement_rsvps")
    .upsert(
      {
        announcement_id: inputV.announcementId,
        student_id: user.id,
        response: inputV.response,
        decline_reason: inputV.response === "not_attending" ? inputV.declineReason : null,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,student_id" },
    )
    .select("*")
    .single();
  if (error) throw dbError(error);

  revalidatePath("/student");
  return data;
}

// Powers the "Geçmiş Programlar" dropdown -- every past week (within the
// last 12 months) that has at least one task, newest first. Mirrors the
// coach's own getPastWeeksForStudent (app/coach/actions.ts) exactly,
// including this same rolling window -- older weeks still exist in the
// DB, they just drop out of this specific dropdown, so this table never
// grows into an all-time scan as task history accumulates over years.
function isoDateMonthsAgo(months: number) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export async function getPastWeeksForStudent(): Promise<{ weekStart: string; taskCount: number }[]> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data, error } = await supabase
    .from("student_tasks")
    .select("task_date")
    .eq("student_id", user.id)
    .gte("task_date", isoDateMonthsAgo(12));
  if (error) throw dbError(error);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const weekStart = mondayOf(row.task_date);
    counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([weekStart, taskCount]) => ({ weekStart, taskCount }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export type DailyStopwatchRanking = {
  myRank: number | null;
  myTotalMinutes: number | null;
  topStudentName: string | null;
  topStudentTotalMinutes: number | null;
  participantCount: number;
};

// Kronometre Yarışması widget -- calls the get_daily_stopwatch_ranking()
// security-definer function (migration 0054) rather than querying
// student_tasks/profiles directly, since RLS has no student-to-student
// read policy at all. The function itself resolves the caller's own
// coach and returns only these five scalars (never a per-student list),
// so there's nothing further to restrict here -- a student with no coach
// gets participantCount: 0 and every other field null, not an error.
export async function getDailyStopwatchRanking(): Promise<DailyStopwatchRanking> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { data, error } = await supabase.rpc("get_daily_stopwatch_ranking").single();
  if (error) throw dbError(error);

  const row = data as {
    my_rank: number | null;
    my_total_minutes: number | null;
    top_student_name: string | null;
    top_student_total_minutes: number | null;
    participant_count: number;
  };

  return {
    myRank: row.my_rank,
    myTotalMinutes: row.my_total_minutes,
    topStudentName: row.top_student_name,
    topStudentTotalMinutes: row.top_student_total_minutes,
    participantCount: row.participant_count,
  };
}

// "Anlık Çalışma Durumu" -- called every ~20s by FocusTimerModal while a
// session is actually running (see the onHeartbeat effect there), and
// once immediately on start/resume. Deliberately just a timestamp touch,
// not a toast-worthy action -- the caller swallows any failure, since a
// missed beat only means a coach sees a stale "Boşta" a little longer
// (see LIVE_STATUS_STALE_MS in lib/focus-live-status.ts), never a lost
// task update the way updateTaskProgress's own writes would be.
export async function sendFocusHeartbeat(): Promise<void> {
  const supabase = await createClient();
  await assertNotImpersonating();
  const user = await requireUser(supabase);
  await supabase.from("profiles").update({ active_focus_heartbeat_at: new Date().toISOString() }).eq("id", user.id);
}

// --- "Ek Çalışma Ekle" (rich self-logged task) --------------------------
//
// The old "Ekstra Çalışma Ekle" dialog only ever wrote a bare title/
// description with task_type "extra_custom" -- no course_id/topic_id, so
// a student's own practice could never show up in Kaynak Takibi or
// Gelişim Haritası the way a coach-assigned task does. This writes the
// exact same student_tasks columns a coach assignment does (see
// buildTaskRows in app/coach/actions.ts), with is_coach_assigned: false
// so it stays student-editable/deletable like any other self-added row
// (student_tasks_student_insert_custom/_delete_custom already allow any
// task_type/course_id/topic_id here -- no RLS change was needed for the
// student_tasks row itself, only for linking a resource to it, see
// migration 0056).
//
// Deliberately scoped narrower than the coach's own "Yeni Görev Ekle"
// form in two ways:
// - Course pickers only ever offer atomic TYT/AYT courses (never the
//   branch-exam macro groupings or Paragraf/Problem's routine pseudo-
//   courses) -- Kaynak Takibi's own tabs are atomic-only, so a task filed
//   under a macro course would silently be invisible there, and
//   Paragraf/Problem already has its own dedicated logging page.
// - Only "Soru Çözümü" gets full one-step result entry (Toplam/Doğru/
//   Yanlış/Boş) here, since that's the actual "I just did this, here's
//   what happened" case this feature is for. "Branş Denemesi"/"Genel
//   Deneme" are created pending, same as a coach assignment, and
//   completed afterward through the existing TaskModal (which already
//   has the full trial-results/subject-scores flow for those two types)
//   -- avoids re-building that considerably more complex UI a second
//   time here.
export type RichTaskType = "question_bank" | "topic_study" | "branch_exam" | "general_exam" | "extra_custom";

const richTaskCountField = z.number().int().min(0).max(10000).nullable().optional();

const createRichCustomTaskSchema = z
  .object({
    taskDate: dateSchema,
    taskType: z.enum(["question_bank", "topic_study", "branch_exam", "general_exam", "extra_custom"]),
    courseId: z.string().trim().max(60).nullable().optional(),
    topicId: z.string().trim().max(60).nullable().optional(),
    resourceIds: z.array(uuidSchema).optional(),
    totalCount: richTaskCountField,
    correctCount: richTaskCountField,
    wrongCount: richTaskCountField,
    emptyCount: richTaskCountField,
    durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    generalExamTrack: z.enum(["tyt", "ayt"]).nullable().optional(),
    generalExamPublisher: z.string().trim().max(200).nullable().optional(),
    branchExamPublisher: z.string().trim().max(200).nullable().optional(),
    freeTitle: z.string().trim().max(200).nullable().optional(),
    freeDescription: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.taskType !== "question_bank" ||
      countsAreConsistent({ total: v.totalCount ?? null, correct: v.correctCount ?? null, wrong: v.wrongCount ?? null, empty: v.emptyCount ?? null }),
    { message: "Toplam, Doğru + Yanlış + Boş toplamına eşit olmalıdır.", path: ["totalCount"] },
  )
  .refine((v) => v.taskType !== "extra_custom" || !!v.freeTitle?.trim(), { message: "Başlık zorunludur.", path: ["freeTitle"] });

export type CreateRichTaskInput = {
  taskDate: string;
  taskType: RichTaskType;
  courseId?: string | null;
  topicId?: string | null;
  resourceIds?: string[];
  totalCount?: number | null;
  correctCount?: number | null;
  wrongCount?: number | null;
  emptyCount?: number | null;
  durationMinutes?: number | null;
  generalExamTrack?: "tyt" | "ayt" | null;
  generalExamPublisher?: string | null;
  branchExamPublisher?: string | null;
  freeTitle?: string | null;
  freeDescription?: string | null;
};

// Mirrors buildTaskTitle/buildGeneralExamTitle/buildBranchExamTitle in
// app/coach/actions.ts (private there, so duplicated rather than
// cross-imported per this repo's panel convention) -- same title shape
// either side produces, so a self-logged and a coach-assigned task for
// the same course/topic read identically everywhere titles are shown.
function buildRichTaskTitle(v: z.infer<typeof createRichCustomTaskSchema>): string {
  if (v.taskType === "extra_custom") return v.freeTitle?.trim() || "Ekstra Çalışma";

  if (v.taskType === "general_exam") {
    const prefix = v.generalExamTrack === "ayt" ? "AYT" : "TYT";
    const pub = v.generalExamPublisher?.trim();
    return pub ? `${prefix} Genel Deneme - ${pub}` : `${prefix} Genel Deneme`;
  }

  const course = findCourseById(v.courseId);
  const prefix = v.courseId?.startsWith("tyt-") ? "TYT " : v.courseId?.startsWith("ayt-") ? "AYT " : "";
  const topic = v.taskType === "branch_exam" ? null : findTopicById(v.courseId, v.topicId);
  const base = !course ? "Görev" : topic ? `${prefix}${course.name} — ${topic.name}` : `${prefix}${course.name}`;

  if (v.taskType === "branch_exam") {
    const pub = v.branchExamPublisher?.trim();
    return pub ? `${base} - ${pub}` : base;
  }
  return base;
}

export async function createRichCustomTask(input: CreateRichTaskInput) {
  await assertNotImpersonating();
  const v = parseInput(createRichCustomTaskSchema, input);
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const title = buildRichTaskTitle(v);
  // Only "Soru Çözümü" gets to arrive already "done" -- every other type
  // (including a bare Toplam-only "Konu Çalışması" target) still needs
  // its own completion step, same as a coach-assigned one would.
  const hasFullResults = v.taskType === "question_bank" && v.totalCount != null;
  const takesCourseTopic = v.taskType === "question_bank" || v.taskType === "topic_study" || v.taskType === "branch_exam";
  const takesTotalCount = v.taskType !== "extra_custom" && v.taskType !== "general_exam";

  const { data, error } = await supabase
    .from("student_tasks")
    .insert({
      student_id: user.id,
      task_date: v.taskDate,
      task_type: v.taskType,
      title,
      description: v.taskType === "extra_custom" ? v.freeDescription?.trim() || null : null,
      course_id: takesCourseTopic ? v.courseId || null : null,
      topic_id: v.taskType === "question_bank" || v.taskType === "topic_study" ? v.topicId || null : null,
      total_count: takesTotalCount ? (v.totalCount ?? null) : null,
      correct_count: hasFullResults ? (v.correctCount ?? null) : null,
      wrong_count: hasFullResults ? (v.wrongCount ?? null) : null,
      empty_count: hasFullResults ? (v.emptyCount ?? null) : null,
      duration_minutes: v.durationMinutes ?? null,
      is_coach_assigned: false,
      status: hasFullResults ? "done" : "pending",
      completed: hasFullResults,
    })
    .select("*")
    .single();
  if (error) throw dbError(error);

  if (v.resourceIds && v.resourceIds.length > 0) {
    const rows = v.resourceIds.map((resourceId, orderIndex) => ({ task_id: data.id, resource_id: resourceId, order_index: orderIndex }));
    const { error: linkError } = await supabase.from("task_resources").insert(rows);
    if (linkError) throw dbError(linkError);
  }

  if (hasFullResults) {
    await recomputeDailyStats(supabase, data.student_id, data.task_date);
  }

  revalidatePath("/student");
  return { ...data, resource_ids: v.resourceIds ?? [] };
}

// On-demand resource list for the rich dialog's Kaynak picker -- fetched
// only when the dialog is open and the course/type actually needs it
// (see ResourceCombobox), not eagerly on every dashboard load the way
// Kaynak Takibi's own page.tsx loads every course's resources upfront.
export async function getMyResourcesForCourse(courseId: string, kind: "study" | "branch_exam" = "study") {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const courseIdV = parseInput(z.string().trim().max(60), courseId);

  const { data, error } = await supabase
    .from("student_resources")
    .select("id, name")
    .eq("student_id", user.id)
    .eq("course_id", courseIdV)
    .eq("kind", kind)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error);
  return data as { id: string; name: string }[];
}
