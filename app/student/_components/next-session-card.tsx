"use client";

import { useEffect, useState } from "react";
import { Calendar, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Join button lights up this many minutes before the session starts, and
// stays lit afterward (no explicit session-duration field to expire it).
const JOIN_LEAD_MINUTES = 15;

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
      <Card>
        <CardHeader>
          <Calendar className="text-muted-foreground size-6" />
          <CardTitle className="text-base">Yaklaşan Koçluk Seansı</CardTitle>
          <CardDescription>Şu an planlanmış bir koçluk seansın yok.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const target = new Date(scheduledAt).getTime();
  const diff = target - now;
  const canJoin = diff <= JOIN_LEAD_MINUTES * 60 * 1000 && !!meetingUrl;

  const formattedDate = new Date(scheduledAt).toLocaleString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card>
      <CardHeader>
        <Calendar className="text-primary size-6" />
        <CardTitle className="text-base">Yaklaşan Koçluk Seansı</CardTitle>
        <CardDescription>{formattedDate}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-foreground text-2xl font-semibold tabular-nums">
          {formatCountdown(diff)}
        </div>
        {canJoin ? (
          <Button asChild>
            <a href={meetingUrl!} target="_blank" rel="noopener noreferrer">
              <Video className="size-4" />
              Toplantıya Katıl
            </a>
          </Button>
        ) : (
          <Button disabled>
            <Video className="size-4" />
            Toplantıya Katıl
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
