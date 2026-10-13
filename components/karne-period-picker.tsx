"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPeriod, parsePeriod, samePeriod, type KarnePeriod } from "@/lib/karne-periods";

export type PeriodOption = { key: string; label: string; hint?: string; period: KarnePeriod };

// The date / period filter at the top of the Karne (hidden when printing). Quick choices are chips (presets and the report-card
// periods); the custom range is two date inputs. Pages navigate with `hrefFor` (the range lives in the URL, so a period can be
// shared and survives a refresh) -- `basePath` is the page's own path, the picker adds ?from=&to=; the coach's tab, which is not a page
// of its own, listens with `onSelect`.
export function KarnePeriodPicker({
  period,
  options,
  today,
  basePath,
  onSelect,
  disabled = false,
}: {
  period: KarnePeriod;
  options: PeriodOption[];
  today: string;
  basePath?: string;
  onSelect?: (period: KarnePeriod) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const hrefFor = basePath ? (p: KarnePeriod) => `${basePath}?from=${p.from}&to=${p.to}` : undefined;
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [error, setError] = useState<string | null>(null);

  function choose(next: KarnePeriod) {
    setFrom(next.from);
    setTo(next.to);
    setError(null);
    if (onSelect) onSelect(next);
    else if (hrefFor) router.push(hrefFor(next));
  }

  function applyCustom() {
    const parsed = parsePeriod(from, to, today);
    if (!parsed) {
      setError("Geçerli bir tarih aralığı seç (başlangıç bitişten önce olmalı, en fazla 1 yıl).");
      return;
    }
    choose(parsed);
  }

  return (
    <section aria-label="Dönem seçimi" className="border-border bg-card space-y-3 rounded-lg border p-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="text-muted-foreground size-4" aria-hidden="true" />
        <span className="text-foreground text-sm font-semibold">Dönem</span>
        <span className="text-muted-foreground text-xs">{formatPeriod(period.from, period.to)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = samePeriod(o.period, period);
          const className = cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
            disabled && "pointer-events-none opacity-60",
          );
          const content = (
            <>
              {o.label}
              {o.hint && <span className={cn("ml-1.5", active ? "opacity-80" : "text-muted-foreground/80")}>· {o.hint}</span>}
            </>
          );
          return hrefFor && !onSelect ? (
            <Link key={o.key} href={hrefFor(o.period)} className={className} aria-current={active ? "true" : undefined}>
              {content}
            </Link>
          ) : (
            <button key={o.key} type="button" className={className} aria-pressed={active} disabled={disabled} onClick={() => choose(o.period)}>
              {content}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-muted-foreground flex flex-col gap-1 text-xs">
          Başlangıç
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </label>
        <label className="text-muted-foreground flex flex-col gap-1 text-xs">
          Bitiş
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={applyCustom}>
          Göster
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </section>
  );
}
