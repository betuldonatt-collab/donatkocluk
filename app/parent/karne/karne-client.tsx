"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { NetSummary } from "@/lib/karne";
import { LineChart } from "../_components/line-chart";

export type KarneListItem = {
  id: string;
  cycle_number: number;
  range_start: string;
  range_end: string;
  approved_at: string | null;
  stats: NetSummary;
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// approved_at is a full timestamptz (unlike the date-only range_start/range_end),
// so it must not get a second "T00:00:00" appended.
function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

// Read-only mirror of the student's own KarneListClient (app/student/
// deneme-analizleri/karne/karne-client.tsx), duplicated per this
// codebase's per-panel UI convention -- same card/list design, only the
// destination links point into /parent/karne instead.
export function KarneListClient({ cycles }: { cycles: KarneListItem[] }) {
  // Oldest-first for a left-to-right timeline. Each track's own null
  // cycles (no exam of that type that period) are skipped independently
  // rather than coerced to 0, so a missing AYT period doesn't read as a
  // crash to zero on the chart. `cycles` is already status='approved'-only
  // (see page.tsx's own query).
  const cyclesAsc = cycles.slice().reverse();
  const tytTrend = cyclesAsc.filter((c) => c.stats.tyt.current !== null).map((c) => ({ date: c.range_start, value: c.stats.tyt.current! }));
  const aytTrend = cyclesAsc.filter((c) => c.stats.ayt.current !== null).map((c) => ({ date: c.range_start, value: c.stats.ayt.current! }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Karneler</h2>
        <p className="text-muted-foreground text-sm">Koçun onayladığı dönemsel karneler burada listelenir.</p>
      </div>

      {cycles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border-border bg-card rounded-lg border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">TYT Net Gelişimi</p>
            <LineChart data={tytTrend} />
          </div>
          <div className="border-border bg-card rounded-lg border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">AYT Net Gelişimi</p>
            <LineChart data={aytTrend} color="#f59e0b" />
          </div>
        </div>
      )}

      {cycles.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz onaylanmış bir karne yok.</p>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => (
            <Link
              key={cycle.id}
              href={`/parent/karne/${cycle.id}`}
              className="border-border bg-card hover:bg-accent/40 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-foreground text-sm font-semibold">{cycle.cycle_number}. Dönem</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(cycle.range_start)} – {formatDate(cycle.range_end)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Hidden below sm, not just wrapped -- the chevron already
                    signals "tap to open," and this full Turkish phrase
                    ("18 Eylül 2026 tarihinde onaylandı") next to the left
                    title block was wide enough to push a ~375px viewport
                    wider than the screen. */}
                {cycle.approved_at && (
                  <span className="text-muted-foreground hidden text-xs sm:inline">
                    {formatTimestamp(cycle.approved_at)} tarihinde onaylandı
                  </span>
                )}
                <ChevronRight className="text-muted-foreground size-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
