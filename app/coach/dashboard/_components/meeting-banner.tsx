"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/friendly-error";
import Link from "next/link";
import { Calendar, CheckCircle2, Video, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { canConfirmMeeting, confirmOpensAt, meetingJoinState } from "@/lib/meeting-window";
import { evaluateSessionCompleted, evaluateSessionMissed } from "../../actions";
import { MISSED_REASON_LABELS, type CoachingSession, type CoachTask, type MissedReason, type RosterStudent } from "../types";

export function MeetingBanner({
  session,
  roster,
  onEvaluated,
}: {
  session: CoachingSession | null;
  roster: RosterStudent[];
  onEvaluated: (updated: CoachingSession, newTasks?: CoachTask[]) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [happenedOpen, setHappenedOpen] = useState(false);
  const [missedOpen, setMissedOpen] = useState(false);

  // Every second: the join button goes live at the exact start minute and the evaluation opens right after the 30th.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!session) {
    return (
      <div className="border-border bg-card flex items-center gap-3 rounded-xl border px-5 py-4">
        <Calendar className="text-muted-foreground size-5 shrink-0" />
        <p className="text-muted-foreground text-sm">Yaklaşan bir görüşme yok.</p>
      </div>
    );
  }

  const student = roster.find((s) => s.id === session.student_id);
  const studentName = student?.full_name ?? "Öğrenci";
  // Görüşmeye Katıl: live from the scheduled start for 10 minutes. Görüşme gerçekleşti mi?: only after start + 30 minutes
  // (lib/meeting-window.ts).
  const joinState = meetingJoinState(session.scheduled_at, now);
  const canEvaluate = canConfirmMeeting(session.scheduled_at, now);

  const formattedDate = new Date(session.scheduled_at).toLocaleString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!canEvaluate) {
    return (
      // A plain div, not a Link, now that there are two separate actions in
      // here (go to the student's page, or join the meeting) -- an anchor
      // can't contain another anchor/button without breaking, so each gets
      // its own clickable element instead of the whole banner being one link.
      <div className="border-border from-primary/10 via-primary/5 flex flex-col gap-4 rounded-xl border bg-gradient-to-r to-transparent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/coach/students/${session.student_id}`}
          className="hover:opacity-80 flex min-w-0 items-center gap-3 transition-opacity"
        >
          <div className="bg-primary/15 flex size-11 shrink-0 items-center justify-center rounded-full">
            <Calendar className="text-primary size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {joinState === "before" ? "Sıradaki Görüşme" : "Görüşme Başladı"}
            </p>
            <p className="text-foreground truncate text-sm font-medium">
              {studentName} — {formattedDate}
            </p>
          </div>
        </Link>

        {joinState === "closed" ? (
          // The 10-minute join window has passed: no button any more, and the evaluation is not open yet.
          <p className="text-muted-foreground shrink-0 text-xs sm:ml-auto">
            Katılım süresi doldu · Değerlendirme saat{" "}
            {confirmOpensAt(session.scheduled_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} sonrasında
            açılır.
          </p>
        ) : joinState === "open" && session.meeting_url ? (
          <Button asChild className="shrink-0 sm:ml-auto">
            <a href={session.meeting_url} target="_blank" rel="noopener noreferrer">
              <Video className="size-4" />
              Görüşmeye Katıl
            </a>
          </Button>
        ) : (
          // Before the start (or with no link): visible but not active.
          <Button disabled className="shrink-0 sm:ml-auto">
            <Video className="size-4" />
            Görüşmeye Katıl
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border-amber-500/40 bg-amber-500/10 flex flex-col gap-4 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium tracking-wide text-amber-700 uppercase">Görüşme Değerlendirmesi Bekliyor</p>
        <p className="text-foreground text-sm font-medium">
          {studentName} — {formattedDate}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setHappenedOpen(true)}>
          <CheckCircle2 className="size-4" />
          Görüşme Gerçekleşti
        </Button>
        <Button type="button" variant="outline" onClick={() => setMissedOpen(true)}>
          <XCircle className="size-4" />
          Görüşme Gerçekleşmedi
        </Button>
      </div>

      <HappenedDialog
        open={happenedOpen}
        onOpenChange={setHappenedOpen}
        sessionId={session.id}
        onSaved={onEvaluated}
      />
      <MissedDialog open={missedOpen} onOpenChange={setMissedOpen} sessionId={session.id} onSaved={onEvaluated} />
    </div>
  );
}

function HappenedDialog({
  open,
  onOpenChange,
  sessionId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onSaved: (updated: CoachingSession, newTasks?: CoachTask[]) => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const { session: updated, newTasks } = await evaluateSessionCompleted(sessionId, notes.trim());
      onSaved(updated as CoachingSession, newTasks as CoachTask[]);
      onOpenChange(false);
      setNotes("");
    } catch (e) {
      setError(friendlyError(e, "Bir hata oluştu."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Görüşme Değerlendirmesi</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="evaluation-notes">Görüşme Notları</Label>
          <Textarea
            id="evaluation-notes"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Görüşmede konuşulanlar, öğrencinin durumu, sonraki adımlar..."
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MissedDialog({
  open,
  onOpenChange,
  sessionId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onSaved: (updated: CoachingSession) => void;
}) {
  const [reason, setReason] = useState<MissedReason>("student_no_show");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await evaluateSessionMissed(sessionId, reason, reason === "other" ? note.trim() : null);
      onSaved(updated as CoachingSession);
      onOpenChange(false);
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Görüşme Neden Gerçekleşmedi?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {(Object.keys(MISSED_REASON_LABELS) as MissedReason[]).map((key) => (
            <label key={key} className="hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
              <input
                type="radio"
                name="missed-reason"
                value={key}
                checked={reason === key}
                onChange={() => setReason(key)}
                className="accent-primary"
              />
              {MISSED_REASON_LABELS[key]}
            </label>
          ))}
          {reason === "other" && (
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sebebi kısaca yaz..."
              className="mt-1"
            />
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || (reason === "other" && !note.trim())}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
