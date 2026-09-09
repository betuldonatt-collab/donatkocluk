import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import type { KarneTopicRow, NetSummary } from "@/lib/karne";
import { KarneDetailClient } from "./karne-detail-client";

async function fetchReportCard(studentId: string, id: string) {
  const supabase = await createClient();
  // RLS re-enforces ownership + approved-only for the student role, same as
  // the list page -- this query is just narrowing to one row.
  const { data } = await supabase
    .from("student_report_cards")
    .select("id, cycle_number, range_start, range_end, coach_notes, stats, topic_mistakes, approved_at")
    .eq("student_id", studentId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

export default async function KarneDetailPage(props: PageProps<"/student/deneme-analizleri/karne/[id]">) {
  const { id } = await props.params;
  const view = await getViewContext("student");
  const cycle = view ? await fetchReportCard(view.effectiveUserId, id) : null;

  if (!cycle) {
    return (
      <div className="space-y-4">
        <Link
          href="/student/deneme-analizleri/karne"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          Karnelerim
        </Link>
        <p className="text-muted-foreground text-sm">Karne bulunamadı.</p>
      </div>
    );
  }

  return (
    <KarneDetailClient
      cycleNumber={cycle.cycle_number}
      rangeStart={cycle.range_start}
      rangeEnd={cycle.range_end}
      approvedAt={cycle.approved_at}
      coachNotes={cycle.coach_notes}
      stats={cycle.stats as NetSummary}
      topicRows={cycle.topic_mistakes as KarneTopicRow[]}
    />
  );
}
