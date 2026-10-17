"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { KarneDocument } from "@/components/karne-document";
import { KarnePeriodPicker, type PeriodOption } from "@/components/karne-period-picker";
import { karneDocumentProps } from "@/lib/karne-view";
import { PrintButton } from "@/components/print-button";
import { formatPeriod, presetPeriods, samePeriod, type KarnePeriod } from "@/lib/karne-periods";
import type { KarneSummary } from "@/lib/karne-summary";
import type { CoachReportCardRow } from "../../../actions";
import { getKarneSummary } from "../karne-summary-actions";

// What the coach's action returned for the chosen period (see getKarneSummary).
type LoadedKarne = { summary: KarneSummary; frozen: boolean; sinifSube: string | null; examType: string | null };

// The unified Karne in the coach's "Karneler" tab: any period, live (report-card periods and presets are chips, a custom range is a
// date pair). When the period is one of the student's report cards, that card's note and status show with it -- the note itself is
// written and approved in the cycle list below, exactly as before.
export function KarneLiveSection({
  studentId,
  studentName,
  today,
  cycles,
}: {
  studentId: string;
  studentName: string | null;
  today: string;
  cycles: CoachReportCardRow[];
}) {
  const presets = presetPeriods(today);
  const latest = cycles[0];
  const [period, setPeriod] = useState<KarnePeriod>(latest ? { from: latest.range_start, to: latest.range_end } : presets[0].period);
  const [loaded, setLoaded] = useState<LoadedKarne | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load(next: KarnePeriod) {
    startTransition(async () => {
      const result = await getKarneSummary(studentId, next.from, next.to);
      if (result.ok) {
        setLoaded({ summary: result.summary, frozen: result.frozen, sinifSube: result.sinifSube, examType: result.examType });
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  // first load (the transition's callback sets state only after the await)
  useEffect(() => {
    load(period);
    // only once: later loads are started by the picker
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(next: KarnePeriod) {
    setPeriod(next);
    load(next);
  }

  const options: PeriodOption[] = [
    ...cycles.slice(0, 6).map((c) => ({
      key: c.id,
      label: `${c.cycle_number}. Dönem`,
      hint: c.status === "approved" ? "onaylı" : "taslak",
      period: { from: c.range_start, to: c.range_end },
    })),
    ...presets.map((p) => ({ key: p.key, label: p.label, period: p.period })),
  ];
  const matched = cycles.find((c) => samePeriod({ from: c.range_start, to: c.range_end }, period)) ?? null;

  return (
    <section className="space-y-3" aria-label="Karne">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h3 className="text-foreground text-base font-semibold">Karne</h3>
          <p className="text-muted-foreground text-sm">Öğrencinin seçtiğin dönemdeki özet karnesi — güncel kayıtlardan hesaplanır.</p>
        </div>
        <PrintButton />
      </div>

      <KarnePeriodPicker period={period} options={options} today={today} onSelect={select} disabled={pending} />

      {matched && matched.status === "draft" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 print:hidden">
          {matched.cycle_number}. dönem karnesi taslak: öğrenci ve veli onaylayana kadar bunu göremez. Notu ve onayı aşağıdaki dönem listesinden verebilirsin.
        </p>
      )}
      {error && <p className="text-destructive text-sm print:hidden">{error}</p>}
      {pending && !loaded && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm print:hidden">
          <Loader2 className="size-4 animate-spin" /> Karne hazırlanıyor…
        </p>
      )}

      {loaded && (
        <div className={pending ? "opacity-60 transition-opacity" : undefined} aria-busy={pending}>
          {/* Exactly what the student and the parent are shown for this period: same numbers, header, note and badge (lib/karne-view.ts). */}
          <KarneDocument
            {...karneDocumentProps({
              loaded: { summary: loaded.summary, frozen: loaded.frozen },
              student: { fullName: studentName, sinifSube: loaded.sinifSube, examType: loaded.examType },
              card: matched
                ? { status: matched.status, cycle_number: matched.cycle_number, approved_at: matched.approved_at, coach_notes: matched.coach_notes }
                : null,
              includeDraftNote: true,
            })}
          />
        </div>
      )}
      <p className="text-muted-foreground text-[11px] print:hidden">Seçili dönem: {formatPeriod(period.from, period.to)}</p>
    </section>
  );
}
