import { createClient } from "@/lib/supabase/server";
import type { Resource } from "./_components/course-table";
import { KaynakTakibiClient, type CourseData } from "./kaynak-takibi-client";

export default async function KaynakTakibiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const courseData: Record<string, CourseData> = {};

  if (user) {
    const [{ data: resourceRows }, { data: progressRows }] = await Promise.all([
      supabase
        .from("student_resources")
        .select("id, name, course_id")
        .eq("student_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_resource_progress")
        .select("course_id, topic_id, resource_id, solved, reviewed")
        .eq("student_id", user.id),
    ]);

    for (const row of resourceRows ?? []) {
      const entry = (courseData[row.course_id] ??= { resources: [], progress: {} });
      const resource: Resource = { id: row.id, name: row.name };
      entry.resources.push(resource);
    }

    for (const row of progressRows ?? []) {
      const entry = (courseData[row.course_id] ??= { resources: [], progress: {} });
      const key = `${row.topic_id}::${row.resource_id}`;
      entry.progress[key] = { solved: row.solved, reviewed: row.reviewed };
    }
  }

  return <KaynakTakibiClient initialCourseData={courseData} />;
}
