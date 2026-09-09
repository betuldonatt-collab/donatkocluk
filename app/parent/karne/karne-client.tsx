"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type KarneListItem = {
  id: string;
  cycle_number: number;
  range_start: string;
  range_end: string;
  approved_at: string | null;
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
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Karneler</h2>
        <p className="text-muted-foreground text-sm">Koçun onayladığı dönemsel karneler burada listelenir.</p>
      </div>

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
              <div>
                <p className="text-foreground text-sm font-semibold">{cycle.cycle_number}. Dönem</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(cycle.range_start)} – {formatDate(cycle.range_end)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cycle.approved_at && (
                  <span className="text-muted-foreground text-xs">{formatTimestamp(cycle.approved_at)} tarihinde onaylandı</span>
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
