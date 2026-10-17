import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";
import { KarneDocument } from "@/components/karne-document";
import { PrintButton } from "@/components/print-button";
import { loadKarneSummary } from "@/lib/karne-summary-data";
import { karneDocumentProps } from "@/lib/karne-view";
import { formatPeriod } from "@/lib/karne-periods";
import { cn } from "@/lib/utils";

// The parent's Karne: ONLY coach-approved periods (RLS gives a parent nothing else), shown from the snapshot the coach's approval
// stored -- so the numbers never change after the parent has read them. A card approved before snapshots existed has none and is
// computed from the current records instead (and is labelled as such).

type CardRow = {
  id: string;
  cycle_number: number;
  range_start: string;
  range_end: string;
  approved_at: string | null;
  coach_notes: string | null;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ParentKarnePage(props: PageProps<"/parent/karne">) {
  const sp = await props.searchParams;
  const studentId = await getActiveStudentId();
  if (!studentId) return <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6"><p className="text-muted-foreground text-sm">Karne görüntülenemedi.</p></div>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_report_cards")
    .select("id, cycle_number, range_start, range_end, approved_at, coach_notes")
    .eq("student_id", studentId)
    .eq("status", "approved")
    .order("cycle_number", { ascending: false });
  const cards = (data ?? []) as CardRow[];

  // The same profile fields the student's own page reads (a linked parent may read them, profiles_select_by_parent).
  const { data: profile } = await supabase.from("profiles").select("full_name, sinif_sube, exam_type").eq("id", studentId).maybeSingle();

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-2 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h2 className="text-foreground text-lg font-semibold">Karneler</h2>
        <p className="text-muted-foreground text-sm">Henüz onaylanmış bir karne yok.</p>
      </div>
    );
  }

  const selected = cards.find((c) => c.id === first(sp.card)) ?? cards[0];
  // The snapshot the coach's approval stored -- the very figures the coach and the student see for this period (lib/karne-summary-data.ts).
  const loaded = await loadKarneSummary(supabase, studentId, selected.range_start, selected.range_end);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-foreground text-lg font-semibold">Karneler</h2>
          <p className="text-muted-foreground text-sm">Koçun onayladığı dönemsel karneler.</p>
        </div>
        <PrintButton />
      </div>

      <nav aria-label="Karne dönemleri" className="flex flex-wrap gap-2 print:hidden">
        {cards.map((c) => {
          const active = c.id === selected.id;
          return (
            <Link
              key={c.id}
              href={`/parent/karne?card=${c.id}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
              )}
            >
              {c.cycle_number}. Dönem <span className={active ? "opacity-80" : "text-muted-foreground/80"}>· {formatPeriod(c.range_start, c.range_end)}</span>
            </Link>
          );
        })}
      </nav>

      <KarneDocument
        {...karneDocumentProps({
          loaded,
          student: { fullName: profile?.full_name ?? null, sinifSube: profile?.sinif_sube ?? null, examType: profile?.exam_type ?? null },
          card: { status: "approved", cycle_number: selected.cycle_number, approved_at: selected.approved_at, coach_notes: selected.coach_notes },
        })}
      />
    </div>
  );
}
