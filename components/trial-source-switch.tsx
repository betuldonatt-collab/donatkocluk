"use client";

import { cn } from "@/lib/utils";
import type { GelisimHaritasiRow, TrialSource } from "@/lib/gelisim-haritasi";

// The Tümü / Genel / Branş switch of the Gelişim Haritası (both panels): which exams a course's map is built from. Tümü is the
// one merged view and the default; the other two narrow the SAME map to one kind of exam.
const OPTIONS: { value: TrialSource; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "general", label: "Genel Deneme" },
  { value: "branch", label: "Branş Denemesi" },
];

export function TrialSourceSwitch({ value, onChange }: { value: TrialSource; onChange: (next: TrialSource) => void }) {
  return (
    <div role="radiogroup" aria-label="Deneme türü" className="bg-secondary inline-flex rounded-lg p-1" data-slot="trial-source-switch">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// "Son 8 deneme: 3 Genel Deneme, 3 TYT Fizik Branş, 2 TYT Fen Branş" -- what the course's window is made of (same for every row of the course).
export function TrialBreakdownLine({ rows }: { rows: GelisimHaritasiRow[] }) {
  const first = rows[0];
  if (!first) return null;
  if (first.windowSize === 0) {
    return <p className="text-muted-foreground text-xs">Bu ders için henüz değerlendirilecek deneme yok.</p>;
  }
  return (
    <p className="text-muted-foreground text-xs" data-slot="trial-breakdown">
      Son {first.windowSize} deneme: {first.breakdown.map((b) => `${b.count} ${b.label}`).join(", ")}.
    </p>
  );
}
