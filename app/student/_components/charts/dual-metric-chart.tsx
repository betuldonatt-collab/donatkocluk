"use client";

import { useState } from "react";

type Point = { date: string; a: number; b: number };

const VIEW_W = 480;
const VIEW_H = 200;
const PAD = { top: 28, right: 36, bottom: 28, left: 36 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function scaleFor(values: number[]) {
  const min = Math.min(0, ...values);
  const rawMax = Math.max(...values);
  const max = rawMax === min ? rawMax + 1 : rawMax;
  return { min, max };
}

// Two metrics, two independent y-axes (left for A, right for B), one shared
// timeline -- e.g. Net (left) + Süre/Duration (right) on the same chart
// instead of two side-by-side single-metric charts.
export function DualMetricChart({
  data,
  labelA,
  labelB,
  unitA = "",
  unitB = "",
  colorA = "var(--primary)",
  colorB = "#f59e0b",
}: {
  data: Point[];
  labelA: string;
  labelB: string;
  unitA?: string;
  unitB?: string;
  colorA?: string;
  colorB?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
        Henüz veri yok
      </div>
    );
  }

  const scaleA = scaleFor(data.map((d) => d.a));
  const scaleB = scaleFor(data.map((d) => d.b));

  const xAt = (i: number) =>
    PAD.left + (data.length === 1 ? PLOT_W / 2 : (i / (data.length - 1)) * PLOT_W);
  const yAtA = (v: number) => PAD.top + PLOT_H - ((v - scaleA.min) / (scaleA.max - scaleA.min)) * PLOT_H;
  const yAtB = (v: number) => PAD.top + PLOT_H - ((v - scaleB.min) / (scaleB.max - scaleB.min)) * PLOT_H;

  const lineA = data.map((d, i) => `${xAt(i)},${yAtA(d.a)}`).join(" ");
  const lineB = data.map((d, i) => `${xAt(i)},${yAtB(d.b)}`).join(" ");
  const gridSteps = [0, 0.5, 1];
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
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colorA }} />
          <span className="text-foreground font-medium">{labelA}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colorB }} />
          <span className="text-foreground font-medium">{labelB}</span>
        </span>
      </div>

      <div
        className="relative w-full"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full">
          {gridSteps.map((t) => (
            <line
              key={t}
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={PAD.top + PLOT_H * (1 - t)}
              y2={PAD.top + PLOT_H * (1 - t)}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}

          {gridSteps.map((t) => (
            <text
              key={`a-${t}`}
              x={PAD.left - 6}
              y={PAD.top + PLOT_H * (1 - t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              style={{ fill: colorA }}
            >
              {Math.round(scaleA.min + (scaleA.max - scaleA.min) * t)}
            </text>
          ))}
          {gridSteps.map((t) => (
            <text
              key={`b-${t}`}
              x={VIEW_W - PAD.right + 6}
              y={PAD.top + PLOT_H * (1 - t)}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={10}
              style={{ fill: colorB }}
            >
              {Math.round(scaleB.min + (scaleB.max - scaleB.min) * t)}
            </text>
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

          <polyline points={lineA} fill="none" stroke={colorA} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={lineB} fill="none" stroke={colorB} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          <circle cx={xAt(data.length - 1)} cy={yAtA(last.a)} r={4} fill={colorA} className="stroke-card" strokeWidth={2} />
          <circle cx={xAt(data.length - 1)} cy={yAtB(last.b)} r={4} fill={colorB} className="stroke-card" strokeWidth={2} />

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
              <circle cx={xAt(hoverIndex!)} cy={yAtA(hovered.a)} r={4} fill={colorA} className="stroke-card" strokeWidth={2} />
              <circle cx={xAt(hoverIndex!)} cy={yAtB(hovered.b)} r={4} fill={colorB} className="stroke-card" strokeWidth={2} />
            </>
          )}
        </svg>

        {hovered && (
          <div
            className="border-border bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md"
            style={{
              left: `${(xAt(hoverIndex!) / VIEW_W) * 100}%`,
              top: `${(Math.min(yAtA(hovered.a), yAtB(hovered.b)) / VIEW_H) * 100}%`,
              marginTop: -8,
            }}
          >
            <div className="text-muted-foreground">{formatDate(hovered.date)}</div>
            <div className="font-semibold" style={{ color: colorA }}>
              {labelA}: {hovered.a}
              {unitA}
            </div>
            <div className="font-semibold" style={{ color: colorB }}>
              {labelB}: {hovered.b}
              {unitB}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
