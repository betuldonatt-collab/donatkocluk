"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

import { cn } from "@/lib/utils";

export type ParentSession = {
  id: string;
  scheduled_at: string;
  outcome: "pending" | "completed" | "not_happened";
};

function formatCountdown(ms: number) {
  if (ms <= 0) return "Şimdi";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days} gün ${pad(hours)} saat`;
  return `${pad(hours)}:${pad(minutes)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionCalendar({ sessions }: { sessions: ParentSession[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const upcoming = sessions
    .filter((s) => s.outcome === "pending")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  const past = sessions
    .filter((s) => s.id !== upcoming?.id)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  return (
    <div className="space-y-4">
      {upcoming ? (
        <div className="border-border from-primary/10 via-primary/5 flex flex-col gap-3 rounded-xl border bg-gradient-to-r to-transparent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/15 flex size-11 shrink-0 items-center justify-center rounded-full">
              <Calendar className="text-primary size-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Yaklaşan Görüşme
              </p>
              <p className="text-foreground text-sm font-medium">{formatDate(upcoming.scheduled_at)}</p>
            </div>
          </div>
          <div className="text-foreground text-xl font-semibold tabular-nums sm:text-2xl">
            {formatCountdown(new Date(upcoming.scheduled_at).getTime() - now)}
          </div>
        </div>
      ) : (
        <div className="border-border bg-card flex items-center gap-3 rounded-xl border px-5 py-4">
          <Calendar className="text-muted-foreground size-5 shrink-0" />
          <p className="text-muted-foreground text-sm">Şu an planlanmış bir görüşme yok.</p>
        </div>
      )}

      {past.length > 0 && (
        <div className="border-border divide-border overflow-hidden rounded-xl border divide-y">
          {past.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-foreground text-sm">{formatDate(s.scheduled_at)}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  s.outcome === "completed" ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700",
                )}
              >
                {s.outcome === "completed" ? "Tamamlandı" : "Yapılmadı"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
