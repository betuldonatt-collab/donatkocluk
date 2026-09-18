"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Megaphone } from "lucide-react";

import { computeAnnouncementCountdownMs, formatAnnouncementCountdown } from "@/lib/announcement-countdown";
import { useAnnouncementsWidgetCollapsed } from "@/lib/use-announcements-widget-collapsed";
import type { CoachAnnouncement } from "@/lib/announcements";

function formatEventDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function AnnouncementRow({ announcement, now }: { announcement: CoachAnnouncement; now: number }) {
  return (
    <div className="border-border space-y-2 rounded-md border p-3">
      <p className="text-foreground text-sm font-medium">{announcement.title}</p>
      <p className="text-muted-foreground line-clamp-3 text-xs whitespace-pre-wrap">{announcement.content}</p>

      {announcement.event_date && (
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs">
            {formatEventDate(announcement.event_date)}
            {announcement.event_time && ` — ${announcement.event_time.slice(0, 5)}`}
          </p>
          <p className="text-foreground text-sm font-semibold tabular-nums">
            {formatAnnouncementCountdown(computeAnnouncementCountdownMs(announcement.event_date, announcement.event_time, now))}
          </p>
        </div>
      )}
    </div>
  );
}

// Coach-panel mirror of the student/parent AnnouncementSideWidget -- same
// fixed-right, collapsible-to-a-purple-"book spine"-tab shape and the
// same shared useAnnouncementsWidgetCollapsed/countdown utilities, but
// with no RSVP status line: a coach has many students, not one linked
// student like the parent panel, so there's no single "response" of
// their own to show here (per-student declines already surface in the
// dashboard's own "Katılmayacak Öğrenciler" alert).
export function AnnouncementSideWidget({ announcements }: { announcements: CoachAnnouncement[] }) {
  const { collapsed, toggle } = useAnnouncementsWidgetCollapsed();
  const [now, setNow] = useState(() => Date.now());

  const hasCountdown = announcements.some((a) => a.event_date);
  useEffect(() => {
    if (!hasCountdown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasCountdown]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Duyuru panelini genişlet"
        className="fixed top-1/2 right-0 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-purple-300 bg-purple-100 px-2 py-3 text-purple-800 shadow-lg transition-colors hover:bg-purple-200 dark:border-purple-700/50 dark:bg-purple-900/40 dark:text-purple-200 dark:hover:bg-purple-900/60 print:hidden"
      >
        <Megaphone className="size-4 shrink-0" />
        <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">Duyurular</span>
      </button>
    );
  }

  return (
    <div className="border-border bg-card fixed top-1/2 right-4 z-40 flex max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] -translate-y-1/2 flex-col rounded-lg border shadow-lg print:hidden">
      <div className="flex shrink-0 items-start justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="text-purple-600 size-4 shrink-0" />
          <p className="text-foreground text-sm font-semibold">Duyurular</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label="Duyuru panelini küçült"
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="min-h-0 space-y-2 overflow-y-auto px-4 pb-4">
        {announcements.map((a) => (
          <AnnouncementRow key={a.id} announcement={a} now={now} />
        ))}
      </div>
    </div>
  );
}
