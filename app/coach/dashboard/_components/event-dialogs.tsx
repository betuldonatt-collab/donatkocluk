"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createCalendarBlock,
  createCoachingSession,
  deleteCalendarBlock,
  deleteCoachingSession,
  updateSessionPaymentStatus,
} from "../../actions";
import { MISSED_REASON_LABELS, type CalendarBlock, type CoachingSession, type RosterStudent } from "../types";

type EventKind = "session" | "block";

function selectClassName(className?: string) {
  return cn(
    "border-input bg-background flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    className,
  );
}

export function CreateEventDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultHour,
  defaultMinute,
  roster,
  onCreatedSession,
  onCreatedBlock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  defaultHour: number;
  defaultMinute: number;
  roster: RosterStudent[];
  onCreatedSession: (session: CoachingSession) => void;
  onCreatedBlock: (block: CalendarBlock) => void;
}) {
  const [kind, setKind] = useState<EventKind>("session");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(`${String(defaultHour).padStart(2, "0")}:${String(defaultMinute).padStart(2, "0")}`);
  const [studentId, setStudentId] = useState(roster[0]?.id ?? "");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [blockTitle, setBlockTitle] = useState("");
  const [endTime, setEndTime] = useState(
    `${String(Math.min(defaultHour + 1, 23)).padStart(2, "0")}:${String(defaultMinute).padStart(2, "0")}`,
  );
  const [saving, setSaving] = useState(false);

  function reset() {
    setBlockTitle("");
    setMeetingUrl("");
    setIsPaid(false);
  }

  async function handleCreate() {
    setSaving(true);
    try {
      if (kind === "session") {
        if (!studentId || !meetingUrl.trim()) return;
        const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
        const session = await createCoachingSession({ studentId, scheduledAt, meetingUrl: meetingUrl.trim(), isPaid });
        onCreatedSession(session as CoachingSession);
      } else {
        if (!blockTitle.trim()) return;
        const startAt = new Date(`${date}T${time}:00`).toISOString();
        const endAt = new Date(`${date}T${endTime}:00`).toISOString();
        const block = await createCalendarBlock({ title: blockTitle.trim(), startAt, endAt });
        onCreatedBlock(block as CalendarBlock);
      }
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Takvime Ekle</DialogTitle>
        </DialogHeader>

        <div className="bg-secondary inline-flex w-fit rounded-lg p-1">
          {(["session", "block"] as EventKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                kind === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "session" ? "Öğrenci Görüşmesi" : "Kişisel Blok (Farklı bir iş)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-date">Tarih</Label>
            <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-time">{kind === "session" ? "Saat" : "Başlangıç"}</Label>
            <Input id="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        {kind === "session" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="event-student">Öğrenci</Label>
              <select
                id="event-student"
                className={selectClassName()}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                {roster.length === 0 && <option value="">Atanmış öğrenci yok</option>}
                {roster.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? "İsimsiz Öğrenci"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-meeting-url">Görüşme Linki</Label>
              <Input
                id="event-meeting-url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/..."
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="event-is-paid" checked={isPaid} onCheckedChange={(checked) => setIsPaid(checked === true)} />
              <Label htmlFor="event-is-paid" className="text-sm font-normal">
                Ödendi
              </Label>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="event-block-title">Başlık</Label>
              <Input
                id="event-block-title"
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                placeholder="Örn: Doktor randevusu"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-end-time">Bitiş</Label>
              <Input id="event-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={saving || (kind === "session" ? !studentId || !meetingUrl.trim() : !blockTitle.trim())}
          >
            {saving ? "Ekleniyor..." : "Ekle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SessionDetailDialog({
  session,
  open,
  onOpenChange,
  roster,
  onDeleted,
  onUpdated,
}: {
  session: CoachingSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: RosterStudent[];
  onDeleted: (id: string) => void;
  onUpdated: (session: CoachingSession) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [togglingPaid, setTogglingPaid] = useState(false);
  if (!session) return null;

  const student = roster.find((s) => s.id === session.student_id);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCoachingSession(session!.id);
      onDeleted(session!.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Görüşme iptal edilemedi.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleTogglePaid() {
    setTogglingPaid(true);
    try {
      const updated = await updateSessionPaymentStatus(session!.id, !session!.is_paid);
      onUpdated(updated as CoachingSession);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ödeme durumu güncellenemedi.");
    } finally {
      setTogglingPaid(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{student?.full_name ?? "Öğrenci"} — Görüşme</DialogTitle>
          <DialogDescription>
            {new Date(session.scheduled_at).toLocaleString("tr-TR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                session.is_paid ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700",
              )}
            >
              {session.is_paid ? "Ödendi" : "Ödeme Bekliyor"}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={handleTogglePaid} disabled={togglingPaid}>
              {session.is_paid ? "Ödenmedi olarak işaretle" : "Ödendi olarak işaretle"}
            </Button>
          </div>
          {session.meeting_url && (
            <p>
              <span className="text-muted-foreground">Link: </span>
              <a href={session.meeting_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {session.meeting_url}
              </a>
            </p>
          )}
          {session.outcome === "completed" && (
            <div>
              <p className="text-muted-foreground">Değerlendirme notu:</p>
              <p className="whitespace-pre-wrap">{session.evaluation_notes || "—"}</p>
            </div>
          )}
          {session.outcome === "not_happened" && (
            <p className="text-muted-foreground">
              Gerçekleşmedi — {session.missed_reason ? MISSED_REASON_LABELS[session.missed_reason] : "—"}
              {session.missed_reason_note ? `: ${session.missed_reason_note}` : ""}
            </p>
          )}
          <Link href={`/coach/students/${session.student_id}`} className="text-primary text-sm underline">
            Öğrenci detayına git
          </Link>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Siliniyor..." : "Görüşmeyi İptal Et"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BlockDetailDialog({
  block,
  open,
  onOpenChange,
  onDeleted,
}: {
  block: CalendarBlock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  if (!block) return null;

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCalendarBlock(block!.id);
      onDeleted(block!.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Blok silinemedi.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{block.title}</DialogTitle>
          <DialogDescription>
            {new Date(block.start_at).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" })} –{" "}
            {new Date(block.end_at).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Siliniyor..." : "Bloğu Sil"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
