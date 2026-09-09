"use client";

import { useState } from "react";

type Point = { date: string; value: number };

const VIEW_W = 480;
const VIEW_H = 180;
// top: 28, not 16 -- the last-point value label is drawn 10px above its
// point (see the <text> after the polyline); when that point is also the
// series max (yAt(max) === PAD.top), a 16px top pad left the label's own
// height with nowhere to go but above y=0, clipped by the viewBox.
const PAD = { top: 28, right: 16, bottom: 28, left: 32 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

// Single-metric trend line -- parent-panel copy of the student/coach
// LineChart (this repo duplicates small per-panel UI rather than
// cross-importing across panels).
export function LineChart({
  data,
  color = "var(--primary)",
  unit = "",
}: {
  data: Point[];
  color?: string;
  unit?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[180px] items-center justify-center text-sm">
        Henüz veri yok
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(0, ...values);
  const rawMax = Math.max(...values);
  const max = rawMax === min ? rawMax + 1 : rawMax;

  const xAt = (i: number) =>
    PAD.left + (data.length === 1 ? PLOT_W / 2 : (i / (data.length - 1)) * PLOT_W);
  const yAt = (v: number) => PAD.top + PLOT_H - ((v - min) / (max - min)) * PLOT_H;

  const linePoints = data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(" ");
  const gridValues = [min, (min + max) / 2, max];
  const last = data[data.length - 1];
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const vx = fraction * VIEW_W;
    const relative = (vx - PAD.left) / PLOT_W;
    const i = Math.round(relative * (data.length - 1));
    setHoverIndex(Math.min(data.length - 1, Math.max(0, i)));
  }

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverIndex(null)}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full">
        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={yAt(v)}
              y2={yAt(v)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={yAt(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={10}
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={VIEW_H - 8} className="fill-muted-foreground" fontSize={10}>
          {formatDate(data[0].date)}
        </text>
        <text
          x={VIEW_W - PAD.right}
          y={VIEW_H - 8}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={10}
        >
          {formatDate(last.date)}
        </text>

        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={xAt(data.length - 1)}
          cy={yAt(last.value)}
          r={4}
          fill={color}
          className="stroke-card"
          strokeWidth={2}
        />
        <text
          x={xAt(data.length - 1) - 8}
          y={yAt(last.value) - 10}
          textAnchor="end"
          className="fill-foreground font-semibold"
          fontSize={11}
        >
          {last.value}
          {unit}
        </text>

        {hovered && (
          <>
            <line
              x1={xAt(hoverIndex!)}
              x2={xAt(hoverIndex!)}
              y1={PAD.top}
              y2={VIEW_H - PAD.bottom}
              className="stroke-muted-foreground"
              strokeWidth={1}
            />
            <circle
              cx={xAt(hoverIndex!)}
              cy={yAt(hovered.value)}
              r={4}
              fill={color}
              className="stroke-card"
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="border-border bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md"
          style={{
            left: `${(xAt(hoverIndex!) / VIEW_W) * 100}%`,
            top: `${(yAt(hovered.value) / VIEW_H) * 100}%`,
            marginTop: -8,
          }}
        >
          <div className="text-muted-foreground">{formatDate(hovered.date)}</div>
          <div className="font-semibold">
            {hovered.value}
            {unit}
          </div>
        </div>
      )}
    </div>
  );
}
