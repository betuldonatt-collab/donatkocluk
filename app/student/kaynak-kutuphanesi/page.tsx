import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { KaynakKutuphanesiClient } from "./kaynak-kutuphanesi-client";

export type LibraryResource = { id: string; name: string; courseId: string };

export default async function KaynakKutuphanesiPage() {
  const view = await getViewContext("student");
  const supabase = await createClient();

  const { data: rows } = view
    ? await supabase
        .from("student_resources")
        .select("id, name, course_id")
        .eq("student_id", view.effectiveUserId)
        .order("created_at", { ascending: true })
    : { data: [] };

  const resources: LibraryResource[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    courseId: r.course_id,
  }));

  return <KaynakKutuphanesiClient initialResources={resources} />;
}
