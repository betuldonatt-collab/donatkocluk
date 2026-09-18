"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

import { cn } from "@/lib/utils";

export type ParentSession = {
  id: string;
  scheduled_at: string;
  outcome: "pending" | "completed" | "not_happened";
  is_paid: boolean;
};

const OUTCOME_LABELS: Record<ParentSession["outcome"], string> = {
  pending: "Planlanan",
  completed: "Görüşme Gerçekleşti",
  not_happened: "Gerçekleşmedi",
};

const OUTCOME_COLORS: Record<ParentSession["outcome"], string> = {
  pending: "bg-muted text-muted-foreground",
  completed: "bg-emerald-500/15 text-emerald-700",
  not_happened: "bg-rose-500/15 text-rose-700",
};

function monthGroupKey(iso: string) {
  return iso.slice(0, 7);
}

function formatMonthHeading(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

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

  const monthGroups = new Map<string, ParentSession[]>();
  for (const s of past) {
    const key = monthGroupKey(s.scheduled_at);
    const bucket = monthGroups.get(key) ?? [];
    bucket.push(s);
    monthGroups.set(key, bucket);
  }

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
              <span
                className={cn(
                  "mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                  upcoming.is_paid ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700",
                )}
              >
                {upcoming.is_paid ? "Ödemesi Yapıldı" : "Ödeme Bekliyor"}
              </span>
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

      {monthGroups.size > 0 && (
        <div className="space-y-4">
          {[...monthGroups.entries()].map(([monthKey, monthSessions]) => (
            <div key={monthKey}>
              <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                {formatMonthHeading(monthKey)}
              </p>
              <div className="border-border divide-border overflow-hidden rounded-xl border divide-y">
                {monthSessions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-foreground text-sm">{formatDate(s.scheduled_at)}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", OUTCOME_COLORS[s.outcome])}>
                        {OUTCOME_LABELS[s.outcome]}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          s.is_paid ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700",
                        )}
                      >
                        {s.is_paid ? "Ödemesi Yapıldı" : "Ödeme Bekliyor"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
