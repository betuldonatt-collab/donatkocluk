import { createClient } from "@/lib/supabase/server";
import { pastQuestionKey, type PastQuestionMap } from "./_lib/shared";
import { CikmisSorularClient } from "./cikmis-sorular-client";

export default async function CikmisSorularPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = user
    ? await supabase
        .from("past_question_progress")
        .select("course_id, topic_id, year, solved")
        .eq("student_id", user.id)
    : { data: [] };

  const progressByCourse: Record<string, PastQuestionMap> = {};
  for (const row of rows ?? []) {
    const map = (progressByCourse[row.course_id] ??= {});
    map[pastQuestionKey(row.topic_id, row.year)] = row.solved;
  }

  return <CikmisSorularClient initialProgressByCourse={progressByCourse} />;
}
