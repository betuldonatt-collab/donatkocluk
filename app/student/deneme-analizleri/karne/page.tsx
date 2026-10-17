import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { KarneDocument } from "@/components/karne-document";
import { KarnePeriodPicker, type PeriodOption } from "@/components/karne-period-picker";
import { PrintButton } from "@/components/print-button";
import { loadKarneSummary } from "@/lib/karne-summary-data";
import { karneDocumentProps } from "@/lib/karne-view";
import { formatPeriod, parsePeriod, presetPeriods, type KarnePeriod } from "@/lib/karne-periods";

// "Karnelerim": the unified Karne. The student picks any period (presets, one of their approved report cards, or a custom range) and
// sees the live numbers for it; when the chosen period IS an approved report card, the coach's note and the "Koç onaylı" badge
// appear. The detailed analytics live in their own pages (Deneme Analizleri, Gelişim Haritası, ...) -- this is a standalone summary.

type CycleRow = {
  id: string;
  cycle_number: number;
  range_start: string;
  range_end: string;
  status: "draft" | "approved";
  approved_at: string | null;
  coach_notes: string | null;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KarnePage(props: PageProps<"/student/deneme-analizleri/karne">) {
  const sp = await props.searchParams;
  const view = await getViewContext("student");
  if (!view) return <p className="text-muted-foreground text-sm">Karne görüntülenemedi.</p>;

  const supabase = await createClient();
  const studentId = view.effectiveUserId;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: cycleRows }, { data: profile }] = await Promise.all([
    // RLS restricts the student role to approved rows; the admin preview additionally sees drafts, which are filtered out below.
    supabase
      .from("student_report_cards")
      .select("id, cycle_number, range_start, range_end, status, approved_at, coach_notes")
      .eq("student_id", studentId)
      .order("cycle_number", { ascending: false }),
    supabase.from("profiles").select("full_name, sinif_sube, exam_type").eq("id", studentId).maybeSingle(),
  ]);
  const cycles = ((cycleRows ?? []) as CycleRow[]).filter((c) => c.status === "approved");

  const presets = presetPeriods(today);
  const fallback: KarnePeriod = cycles[0] ? { from: cycles[0].range_start, to: cycles[0].range_end } : presets[0].period;
  const period = parsePeriod(first(sp.from), first(sp.to), today) ?? fallback;

  const options: PeriodOption[] = [
    ...cycles.slice(0, 6).map((c) => ({
      key: c.id,
      label: `${c.cycle_number}. Dönem`,
      hint: formatPeriod(c.range_start, c.range_end),
      period: { from: c.range_start, to: c.range_end },
    })),
    ...presets.map((p) => ({ key: p.key, label: p.label, period: p.period })),
  ];

  // The same numbers and the same document props as the coach's preview and the parent's view (lib/karne-view.ts).
  const loaded = await loadKarneSummary(supabase, studentId, period.from, period.to, { today });
  const matched = cycles.find((c) => c.range_start === period.from && c.range_end === period.to) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-foreground text-lg font-semibold">Karnelerim</h2>
          <p className="text-muted-foreground text-sm">İstediğin dönemin karnesini görüntüle, yazdır veya PDF olarak kaydet.</p>
        </div>
        <PrintButton />
      </div>

      <KarnePeriodPicker period={period} options={options} today={today} basePath="/student/deneme-analizleri/karne" />

      <KarneDocument
        {...karneDocumentProps({
          loaded,
          student: { fullName: profile?.full_name ?? null, sinifSube: profile?.sinif_sube ?? null, examType: profile?.exam_type ?? null },
          card: matched,
        })}
      />
    </div>
  );
}
