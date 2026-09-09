import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";
import { KarneListClient, type KarneListItem } from "./karne-client";

async function fetchKarneList(studentId: string): Promise<KarneListItem[]> {
  const supabase = await createClient();
  // RLS (student_report_cards_parent_read, 0064) already restricts this to
  // approved rows for a linked child -- repeated here defensively, not as
  // the actual security boundary, same convention as the student's own
  // equivalent query.
  const { data } = await supabase
    .from("student_report_cards")
    .select("id, cycle_number, range_start, range_end, approved_at")
    .eq("student_id", studentId)
    .eq("status", "approved")
    .order("cycle_number", { ascending: false });
  return (data ?? []) as KarneListItem[];
}

export default async function ParentKarnePage() {
  const studentId = await getActiveStudentId();
  const cycles = studentId ? await fetchKarneList(studentId) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <KarneListClient cycles={cycles} />
    </div>
  );
}
