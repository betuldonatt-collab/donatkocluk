"use client";

import { useEffect, useState } from "react";
import { Calendar, Video } from "lucide-react";

import { Button } from "@/components/ui/button";

function formatCountdown(ms: number) {
  if (ms <= 0) return "Şimdi";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days} gün ${pad(hours)} saat`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Full-width banner at the top of Ana Sayfa — the join button stays
// disabled until the exact scheduled_at instant, no early lead window.
export function NextSessionCard({
  scheduledAt,
  meetingUrl,
}: {
  scheduledAt: string | null;
  meetingUrl: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!scheduledAt) {
    return (
      <div className="border-border bg-card flex items-center gap-3 rounded-xl border px-5 py-4">
        <Calendar className="text-muted-foreground size-5 shrink-0" />
        <p className="text-muted-foreground text-sm">
          Şu an planlanmış bir koçluk seansın yok.
        </p>
      </div>
    );
  }

  const target = new Date(scheduledAt).getTime();
  const diff = target - now;
  const canJoin = diff <= 0 && !!meetingUrl;

  const formattedDate = new Date(scheduledAt).toLocaleString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="border-border from-primary/10 via-primary/5 flex flex-col gap-4 rounded-xl border bg-gradient-to-r to-transparent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-primary/15 flex size-11 shrink-0 items-center justify-center rounded-full">
          <Calendar className="text-primary size-5" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Yaklaşan Koçluk Seansı
          </p>
          <p className="text-foreground text-sm font-medium">{formattedDate}</p>
          <p className="text-foreground text-lg font-semibold tabular-nums">{formatCountdown(diff)}</p>
        </div>
      </div>

      {/* Right-aligned to match the Coach panel's own "Sıradaki Görüşme"
          banner: date/time (and here, the countdown) on the left, the join
          action as the sole element on the right. */}
      {canJoin ? (
        <Button asChild className="shrink-0 sm:ml-auto">
          <a href={meetingUrl!} target="_blank" rel="noopener noreferrer">
            <Video className="size-4" />
            Görüşmeye Katıl
          </a>
        </Button>
      ) : (
        <Button disabled className="shrink-0 sm:ml-auto">
          <Video className="size-4" />
          Görüşmeye Katıl
        </Button>
      )}
    </div>
  );
}
