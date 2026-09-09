"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, CheckCircle2, XCircle } from "lucide-react";

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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
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
  const isPast = new Date(session.scheduled_at).getTime() <= now;

  const formattedDate = new Date(session.scheduled_at).toLocaleString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!isPast) {
    return (
      <Link
        href={`/coach/students/${session.student_id}`}
        className="border-border from-primary/10 via-primary/5 hover:bg-accent/20 flex flex-col gap-4 rounded-xl border bg-gradient-to-r to-transparent px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 flex size-11 shrink-0 items-center justify-center rounded-full">
            <Calendar className="text-primary size-5" />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Sıradaki Görüşme</p>
            <p className="text-foreground text-sm font-medium">
              {studentName} — {formattedDate}
            </p>
          </div>
        </div>
      </Link>
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
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
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
