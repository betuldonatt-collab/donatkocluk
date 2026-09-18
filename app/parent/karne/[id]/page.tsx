import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";
import type { KarneTopicRow, NetSummary } from "@/lib/karne";
import { KarneDetailClient } from "./karne-detail-client";

async function fetchReportCard(studentId: string, id: string) {
  const supabase = await createClient();
  // RLS (student_report_cards_parent_read, 0064) re-enforces linked-child +
  // approved-only -- this query is just narrowing to one row, same
  // convention as the student's own equivalent page.
  const { data } = await supabase
    .from("student_report_cards")
    .select("id, cycle_number, range_start, range_end, coach_notes, stats, topic_mistakes, approved_at")
    .eq("student_id", studentId)
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();
  return data;
}

export default async function ParentKarneDetailPage(props: PageProps<"/parent/karne/[id]">) {
  const { id } = await props.params;
  const studentId = await getActiveStudentId();
  const cycle = studentId ? await fetchReportCard(studentId, id) : null;

  if (!cycle) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link href="/parent/karne" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" />
          Karneler
        </Link>
        <p className="text-muted-foreground text-sm">Karne bulunamadı.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <KarneDetailClient
        cycleNumber={cycle.cycle_number}
        rangeStart={cycle.range_start}
        rangeEnd={cycle.range_end}
        approvedAt={cycle.approved_at}
        coachNotes={cycle.coach_notes}
        stats={cycle.stats as NetSummary}
        topicRows={cycle.topic_mistakes as KarneTopicRow[]}
      />
    </div>
  );
}
