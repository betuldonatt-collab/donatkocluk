import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { KarneListClient, type KarneListItem } from "./karne-client";

async function fetchKarneList(studentId: string): Promise<KarneListItem[]> {
  const supabase = await createClient();
  // RLS already restricts this to approved rows for the student role; the
  // admin-preview role additionally sees drafts, matching how impersonation
  // works everywhere else in this app.
  const { data } = await supabase
    .from("student_report_cards")
    .select("id, cycle_number, range_start, range_end, approved_at")
    .eq("student_id", studentId)
    .order("cycle_number", { ascending: false });
  return (data ?? []) as KarneListItem[];
}

export default async function KarnePage() {
  const view = await getViewContext("student");
  const cycles = view ? await fetchKarneList(view.effectiveUserId) : [];

  return <KarneListClient cycles={cycles} />;
}
