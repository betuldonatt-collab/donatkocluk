import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";

// The old detailed report-card page is retired: a report card now has ONE printable version -- the unified Karne the coach previews and
// prints and the parent reads (components/karne-document.tsx). A link to an old card lands on that same document, for that card's period.
export default async function KarneDetailPage(props: PageProps<"/student/deneme-analizleri/karne/[id]">) {
  const { id } = await props.params;
  const view = await getViewContext("student");
  if (view) {
    const supabase = await createClient();
    // RLS restricts the student role to approved rows.
    const { data } = await supabase
      .from("student_report_cards")
      .select("range_start, range_end, status")
      .eq("student_id", view.effectiveUserId)
      .eq("id", id)
      .eq("status", "approved")
      .maybeSingle();
    if (data) redirect(`/student/deneme-analizleri/karne?from=${data.range_start}&to=${data.range_end}`);
  }
  redirect("/student/deneme-analizleri/karne");
}
