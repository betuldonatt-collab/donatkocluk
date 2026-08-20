import { createClient } from "@/lib/supabase/server";
import { OdevlerClient, type TaskState } from "./odevler-client";

export default async function OdevlerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = user
    ? await supabase
        .from("task_completions")
        .select("*")
        .eq("student_id", user.id)
    : { data: [] };

  const dailyState: Record<string, TaskState> = {};
  const weeklyState: Record<string, TaskState> = {};
  for (const row of rows ?? []) {
    const state: TaskState = { status: row.status, reason: row.reason ?? undefined, note: row.note ?? undefined };
    if (row.scope === "daily") dailyState[row.task_id] = state;
    else weeklyState[row.task_id] = state;
  }

  return <OdevlerClient initialDailyState={dailyState} initialWeeklyState={weeklyState} />;
}
