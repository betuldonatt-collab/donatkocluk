"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StudentAnnouncement } from "@/lib/announcements";
import { submitAnnouncementRsvp } from "../../actions";
import { AnnouncementSideWidget } from "./announcement-side-widget";

const STORAGE_KEY = "student-announcements-last-seen";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatEventDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function AnnouncementCard({
  announcement,
  onResponded,
}: {
  announcement: StudentAnnouncement;
  onResponded: (id: string, response: "attending" | "not_attending") => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsResponse = announcement.requires_rsvp && !announcement.myResponse;

  async function respond(response: "attending" | "not_attending") {
    if (response === "not_attending" && !declining) {
      setDeclining(true);
      return;
    }
    if (response === "not_attending" && !declineReason.trim()) {
      setError("Lütfen katılamama nedenini yaz.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submitAnnouncementRsvp(announcement.id, response, response === "not_attending" ? declineReason.trim() : null);
      onResponded(announcement.id, response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yanıt gönderilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border rounded-lg border p-3">
      <p className="text-foreground text-sm font-medium">{announcement.title}</p>
      {announcement.event_date && (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {formatEventDate(announcement.event_date)}
          {announcement.event_time && ` — ${announcement.event_time.slice(0, 5)}`}
        </p>
      )}
      <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{announcement.content}</p>

      {announcement.requires_rsvp && (
        <div className="mt-3 space-y-2">
          {!needsResponse ? (
            <p className={cn("text-xs font-medium", announcement.myResponse === "attending" ? "text-emerald-600" : "text-rose-600")}>
              {announcement.myResponse === "attending" ? "Katılacağını belirttin." : "Katılamayacağını belirttin."}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                Bu etkinlik için yapacağınız katılım tercihi veliniz tarafından da görüntülenecektir.
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => respond("attending")} disabled={saving}>
                  Katılacağım
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => respond("not_attending")} disabled={saving}>
                  Katılmayacağım
                </Button>
              </div>
              {declining && (
                <div className="space-y-1.5">
                  <Textarea
                    rows={2}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Katılamama nedenini yaz (zorunlu)..."
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => respond("not_attending")} disabled={saving}>
                    {saving ? "Gönderiliyor..." : "Yanıtı Gönder"}
                  </Button>
                </div>
              )}
              {error && <p className="text-destructive text-xs">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Mounted once in app/student/layout.tsx -- owns both the dismissible,
// once-per-day popup (same localStorage-last-seen-date convention as the
// parent panel's own AnnouncementPopup) AND the persistent right-side
// widget, sharing one fetch and one RSVP-response state so responding in
// either place updates both immediately.
export function AnnouncementCenter({ announcements: initial }: { announcements: StudentAnnouncement[] }) {
  const [announcements, setAnnouncements] = useState(initial);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Needs a response today (unless already answered) -- the popup must
  // keep reappearing daily for these. Once every requires_rsvp
  // announcement has been answered, there's nothing left demanding daily
  // attention, so the popup stops reappearing entirely (a plain,
  // non-RSVP announcement still reappears daily until its own 7-day/
  // expiry window closes, same as before).
  const hasUnresolved = announcements.some((a) => !a.requires_rsvp || !a.myResponse);

  useEffect(() => {
    if (!hasUnresolved) return;
    let lastSeen: string | null = null;
    try {
      lastSeen = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastSeen !== todayISO()) setOpen(true);
  }, [hasUnresolved]);

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

  function handleResponded(id: string, response: "attending" | "not_attending") {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, myResponse: response } : a)));
  }

  if (announcements.length === 0) return null;

  const showWidget = pathname === "/student";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duyurular</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {announcements.map((a) => (
              <AnnouncementCard key={a.id} announcement={a} onResponded={handleResponded} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rendered at the layout level (so the popup fires on any student
          page), fixed to the viewport rather than the content column --
          DashboardShell's <main> owns its own left margin/max-width,
          which a layout-level sibling can't align with anyway. */}
      {showWidget && <AnnouncementSideWidget announcements={announcements} onOpenPopup={() => setOpen(true)} />}
    </>
  );
}
