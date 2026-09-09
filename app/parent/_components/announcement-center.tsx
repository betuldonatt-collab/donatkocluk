"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ParentAnnouncement } from "@/lib/announcements";
import { AnnouncementSideWidget } from "./announcement-side-widget";

const STORAGE_KEY = "parent-announcements-last-seen";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatEventDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function statusText(a: ParentAnnouncement): { text: string; tone: string } | null {
  if (!a.requires_rsvp) return null;
  if (a.studentResponse === "attending") return { text: "Öğrenci katılacağını belirtti.", tone: "text-emerald-600" };
  if (a.studentResponse === "not_attending") {
    return {
      text: a.studentDeclineReason ? `Öğrenci katılmayacak: "${a.studentDeclineReason}"` : "Öğrenci katılmayacağını belirtti.",
      tone: "text-rose-600",
    };
  }
  return { text: "Öğrenci henüz yanıtlamadı.", tone: "text-amber-600" };
}

// Read-only mirror of the student panel's own AnnouncementCenter -- same
// dismissible-once-per-day popup + persistent right-side widget shape,
// but no RSVP action here, just a view of the (active) linked student's
// response (see lib/announcements.ts's fetchParentAnnouncements).
export function AnnouncementCenter({ announcements }: { announcements: ParentAnnouncement[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (announcements.length === 0) return;
    let lastSeen: string | null = null;
    try {
      lastSeen = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastSeen !== todayISO()) setOpen(true);
  }, [announcements]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      try {
        localStorage.setItem(STORAGE_KEY, todayISO());
      } catch {
        // ignore
      }
    }
  }

  if (announcements.length === 0) return null;

  const showWidget = pathname === "/parent";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duyurular</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {announcements.map((a) => {
              const status = statusText(a);
              return (
                <div key={a.id} className="border-border rounded-lg border p-3">
                  <p className="text-foreground text-sm font-medium">{a.title}</p>
                  {a.event_date && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatEventDate(a.event_date)}
                      {a.event_time && ` — ${a.event_time.slice(0, 5)}`}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{a.content}</p>
                  {status && <p className={cn("mt-2 text-xs font-medium", status.tone)}>{status.text}</p>}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {showWidget && <AnnouncementSideWidget announcements={announcements} />}
    </>
  );
}
