import { createClient } from "@/lib/supabase/server";
import { requireViewContext } from "@/lib/impersonation";
import { fetchStopwatchCompetitionRoster, fetchStudentGroups } from "../actions";
import { StopwatchRosterTable } from "./_components/stopwatch-roster-table";

export default async function CoachStopwatchPage() {
  const view = await requireViewContext("coach");
  const supabase = await createClient();

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const [roster, groups] = await Promise.all([
    fetchStopwatchCompetitionRoster(supabase, view.effectiveUserId, year, month),
    fetchStudentGroups(supabase, view.effectiveUserId),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Kronometre Yarışması</h1>
        <p className="text-muted-foreground text-sm">
          Öğrencilerinin günlük, haftalık ve aylık toplam çalışma sürelerini karşılaştır. Gruplar sadece sana görünür.
        </p>
      </header>

      <StopwatchRosterTable initialRoster={roster} initialGroups={groups} initialYear={year} initialMonth={month} />
    </div>
  );
}
