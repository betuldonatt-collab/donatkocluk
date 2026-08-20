import { createClient } from "@/lib/supabase/server";
import { KaynakKutuphanesiClient } from "./kaynak-kutuphanesi-client";

export type LibraryResource = { id: string; name: string; courseId: string };

export default async function KaynakKutuphanesiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = user
    ? await supabase
        .from("student_resources")
        .select("id, name, course_id")
        .eq("student_id", user.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const resources: LibraryResource[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    courseId: r.course_id,
  }));

  return <KaynakKutuphanesiClient initialResources={resources} />;
}
