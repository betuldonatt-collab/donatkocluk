"use client";

import { useState } from "react";

export type StackedSeries = { key: string; label: string; color: string };
export type StackedPoint = { date: string; values: Record<string, number> };

const VIEW_W = 480;
const VIEW_H = 220;
const PAD = { top: 20, right: 16, bottom: 28, left: 32 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

// Stacked-bar breakdown -- e.g. Genel Deneme's total net split into its
// per-subject-group contributions, so the coach sees exactly where the
// total is coming from instead of one opaque sum. Negative group nets
// (heavy wrong answers can push a group below zero) stack downward from
// the zero line separately so a bad subject can't silently eat into
// another's segment height.
export function StackedBarChart({ data, series }: { data: StackedPoint[]; series: StackedSeries[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        Henüz veri yok
      </div>
    );
  }

  const posTotals = data.map((d) => series.reduce((sum, s) => sum + Math.max(0, d.values[s.key] ?? 0), 0));
  const negTotals = data.map((d) => series.reduce((sum, s) => sum + Math.min(0, d.values[s.key] ?? 0), 0));
  const maxTotal = Math.max(0, ...posTotals);
  const minTotal = Math.min(0, ...negTotals);
  const range = maxTotal - minTotal || 1;

  const yAt = (v: number) => PAD.top + PLOT_H - ((v - minTotal) / range) * PLOT_H;
  const zeroY = yAt(0);

  const barSlot = PLOT_W / data.length;
  const barWidth = Math.min(40, barSlot * 0.6);
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const vx = fraction * VIEW_W;
    const i = Math.floor((vx - PAD.left) / barSlot);
    setHoverIndex(Math.min(data.length - 1, Math.max(0, i)));
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-foreground font-medium">{s.label}</span>
          </span>
        ))}
      </div>

      <div
        className="relative w-full"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full">
          <line x1={PAD.left} x2={VIEW_W - PAD.right} y1={zeroY} y2={zeroY} className="stroke-border" strokeWidth={1} />

          {data.map((d, i) => {
            const cx = PAD.left + barSlot * (i + 0.5);
            let posCursor = 0;
            let negCursor = 0;
            return (
              <g key={d.date}>
                {series.map((s) => {
                  const v = d.values[s.key] ?? 0;
                  let y0: number;
                  let y1: number;
                  if (v >= 0) {
                    y0 = yAt(posCursor);
                    posCursor += v;
                    y1 = yAt(posCursor);
                  } else {
                    y1 = yAt(negCursor);
                    negCursor += v;
                    y0 = yAt(negCursor);
                  }
                  return (
                    <rect
                      key={s.key}
                      x={cx - barWidth / 2}
                      y={Math.min(y0, y1)}
                      width={barWidth}
                      height={Math.max(1, Math.abs(y1 - y0))}
                      fill={s.color}
                      opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.35}
                      rx={1}
                    />
                  );
                })}
                <text x={cx} y={VIEW_H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                  {formatDate(d.date)}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div
            className="border-border bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
            style={{ left: `${((PAD.left + barSlot * (hoverIndex! + 0.5)) / VIEW_W) * 100}%`, top: `${(PAD.top / VIEW_H) * 100}%` }}
          >
            <div className="text-muted-foreground mb-1">{formatDate(hovered.date)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3" style={{ color: s.color }}>
                <span className="font-medium">{s.label}</span>
                <span className="tabular-nums font-semibold">{(hovered.values[s.key] ?? 0).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-border text-foreground mt-1 flex items-center justify-between gap-3 border-t pt-1 font-semibold">
              <span>Toplam</span>
              <span className="tabular-nums">{series.reduce((sum, s) => sum + (hovered.values[s.key] ?? 0), 0).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
