"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { parseSessionCount, rsvpLabel, SESSION_COUNT_MAX, type AttendanceStatus, type RsvpResponse } from "@/lib/event-attendance";
import { lockEventAttendance, saveEventAttendance } from "../actions";

// One student of the roll call: who they are, what they said in the RSVP, and the marks already saved (session number -> status).
export type RollCallStudent = {
  studentId: string;
  studentName: string;
  rsvp: RsvpResponse | null;
  marks: Record<number, AttendanceStatus>;
};

type Draft = Record<string, AttendanceStatus>; // `${studentId}:${sessionNumber}`
const keyOf = (studentId: string, n: number) => `${studentId}:${n}`;

function initialDraft(students: RollCallStudent[], sessionCount: number | null): Draft {
  const draft: Draft = {};
  if (sessionCount === null) return draft;
  for (const s of students) {
    for (const [n, status] of Object.entries(s.marks)) if (Number(n) <= sessionCount) draft[keyOf(s.studentId, Number(n))] = status;
  }
  return draft;
}

type Saved = (sessionCount: number, marksByStudent: Record<string, Record<number, AttendanceStatus>>, lockedAt?: string) => void;

// Step 1 asks "how many sessions does this event have?", step 2 is the Geldi / Gelmedi checklist -- one cell per student per session.
// Nothing is written until "Kaydet": the whole roll call goes in one request (saveEventAttendance).
export function AttendanceDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  savedSessionCount,
  locked,
  students,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  savedSessionCount: number | null;
  // This coach has locked the roll call: everything is read-only.
  locked: boolean;
  students: RollCallStudent[];
  onSaved: Saved;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl">
        {/* mounted only while open, so every opening starts from the saved state */}
        <RollCall
          eventId={eventId}
          eventTitle={eventTitle}
          savedSessionCount={savedSessionCount}
          locked={locked}
          students={students}
          onSaved={(count, marks, lockedAt) => {
            onSaved(count, marks, lockedAt);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function RollCall({
  eventId,
  eventTitle,
  savedSessionCount,
  locked = false,
  students,
  onSaved,
}: {
  eventId: string;
  eventTitle: string;
  savedSessionCount: number | null;
  locked?: boolean;
  students: RollCallStudent[];
  onSaved: Saved;
}) {
  const [step, setStep] = useState<"count" | "roll">(savedSessionCount === null ? "count" : "roll");
  const [confirmLock, setConfirmLock] = useState(false);
  const [sessionCount, setSessionCount] = useState<number>(savedSessionCount ?? 1);
  const [countInput, setCountInput] = useState(String(savedSessionCount ?? 1));
  const [countError, setCountError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(students, savedSessionCount));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sessions = Array.from({ length: sessionCount }, (_, i) => i + 1);
  const markedCount = Object.keys(draft).filter((k) => Number(k.split(":")[1]) <= sessionCount).length;

  function confirmCount() {
    const n = parseSessionCount(countInput);
    if (n === null) {
      setCountError(`1 ile ${SESSION_COUNT_MAX} arasında bir sayı gir.`);
      return;
    }
    setCountError(null);
    setSessionCount(n);
    // Marks of sessions that no longer exist are dropped from the draft (and removed from the database on save).
    setDraft((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k.split(":")[1]) <= n)));
    setStep("roll");
  }

  function toggle(studentId: string, n: number, status: AttendanceStatus) {
    if (locked) return;
    setDraft((prev) => {
      const next = { ...prev };
      if (next[keyOf(studentId, n)] === status) delete next[keyOf(studentId, n)];
      else next[keyOf(studentId, n)] = status;
      return next;
    });
  }

  function markAll(n: number, status: AttendanceStatus) {
    if (locked) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const s of students) next[keyOf(s.studentId, n)] = status;
      return next;
    });
  }

  // Saves the roll call; with `lockAfter` it is locked right after it was saved (the unsaved changes are part of what gets locked).
  function save(lockAfter: boolean) {
    if (locked) return;
    setError(null);
    const marks = students.flatMap((s) => sessions.map((n) => ({ studentId: s.studentId, sessionNumber: n, status: draft[keyOf(s.studentId, n)] ?? null })));
    startTransition(async () => {
      try {
        const result = await saveEventAttendance(eventId, sessionCount, marks);
        if (!result.success) {
          setError(result.error);
          setConfirmLock(false);
          return;
        }
        let lockedAt: string | undefined;
        if (lockAfter) {
          const lockResult = await lockEventAttendance(eventId);
          if (!lockResult.success) {
            setError(`Yoklama kaydedildi ama kilitlenemedi: ${lockResult.error}`);
            setConfirmLock(false);
            return;
          }
          lockedAt = lockResult.lockedAt;
        }
        const byStudent: Record<string, Record<number, AttendanceStatus>> = {};
        for (const s of students) {
          byStudent[s.studentId] = {};
          for (const n of sessions) {
            const status = draft[keyOf(s.studentId, n)];
            if (status) byStudent[s.studentId][n] = status;
          }
        }
        toast.success(lockAfter ? "Yoklama kaydedildi ve kilitlendi." : "Yoklama kaydedildi.");
        onSaved(result.sessionCount, byStudent, lockedAt);
      } catch {
        setError("Yoklama kaydedilemedi, bağlantını kontrol edip tekrar dene.");
        setConfirmLock(false);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Yoklama — {eventTitle}</DialogTitle>
        <DialogDescription>
          {step === "count"
            ? "Önce etkinliğin kaç oturumdan oluştuğunu belirt."
            : locked
              ? `${sessionCount} oturum · yoklama kilitli, salt okunur.`
              : `${sessionCount} oturum · her öğrenci için her oturumda Geldi ya da Gelmedi işaretle.`}
        </DialogDescription>
      </DialogHeader>

      {step === "count" ? (
        <div className="space-y-3">
          <Label htmlFor="session-count">Bu etkinlik kaç oturumdan oluşuyor?</Label>
          <Input
            id="session-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={SESSION_COUNT_MAX}
            value={countInput}
            onChange={(e) => setCountInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmCount()}
            className="max-w-32"
          />
          {countError && <p className="text-destructive text-xs">{countError}</p>}
          {savedSessionCount !== null && Number(countInput) < savedSessionCount && Number(countInput) >= 1 && (
            <p className="text-xs text-amber-700">Oturum sayısını azaltırsan, kalmayan oturumların yoklaması kaydettiğinde silinir.</p>
          )}
          <div className="flex justify-end gap-2">
            {savedSessionCount !== null && (
              <Button type="button" variant="outline" onClick={() => setStep("roll")}>
                Vazgeç
              </Button>
            )}
            <Button type="button" onClick={confirmCount}>
              Devam
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-3">
          {locked && (
            <div role="status" className="bg-muted flex items-start gap-2 rounded-md px-3 py-2 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>Bu etkinliğin yoklaması kilitlendi. Kayıtlar artık değiştirilemez.</span>
            </div>
          )}
          <div className="border-border thin-scrollbar max-h-[55dvh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Öğrenci</th>
                  {sessions.map((n) => (
                    <th key={n} className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">
                      <div>{n}. Oturum</div>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => markAll(n, "attended")}
                        className="text-muted-foreground hover:text-emerald-600 text-[10px] font-normal underline"
                      >
                        Hepsi geldi
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId} className="border-border border-t">
                    <td className="px-3 py-1.5">
                      <p className="text-foreground max-w-48 truncate">{s.studentName}</p>
                      <p
                        className={cn(
                          "text-[11px]",
                          s.rsvp === "attending" ? "text-emerald-700" : s.rsvp === "not_attending" ? "text-rose-700" : "text-muted-foreground",
                        )}
                      >
                        {rsvpLabel(s.rsvp)}
                      </p>
                    </td>
                    {sessions.map((n) => {
                      const status = draft[keyOf(s.studentId, n)];
                      return (
                        <td key={n} className="px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggle(s.studentId, n, "attended")}
                              disabled={locked}
                              aria-pressed={status === "attended"}
                              aria-label={`${s.studentName} — ${n}. oturum: Geldi`}
                              title="Geldi"
                              className={cn(
                                "flex size-7 items-center justify-center rounded-full border transition-colors",
                                status === "attended"
                                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-600"
                                  : "border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-600",
                              )}
                            >
                              <Check className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggle(s.studentId, n, "not_attended")}
                              disabled={locked}
                              aria-pressed={status === "not_attended"}
                              aria-label={`${s.studentName} — ${n}. oturum: Gelmedi`}
                              title="Gelmedi"
                              className={cn(
                                "flex size-7 items-center justify-center rounded-full border transition-colors",
                                status === "not_attended"
                                  ? "border-rose-500 bg-rose-500/15 text-rose-600"
                                  : "border-border text-muted-foreground hover:border-rose-500 hover:text-rose-600",
                              )}
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}
          {confirmLock && !locked && (
            <div role="alertdialog" className="space-y-2 rounded-md border border-amber-400 bg-amber-500/10 p-3">
              <p className="text-sm font-semibold">Bunu bir daha değiştiremeyeceksin, emin misin?</p>
              <p className="text-muted-foreground text-xs">
                Kaydedilmemiş değişikliklerin de kaydedilip kilitlenir.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirmLock(false)}>
                  Vazgeç
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={() => save(true)}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  Evet, kaydet ve kilitle
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {markedCount} / {students.length * sessionCount} işaretlendi
            </p>
            {!locked && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={pending} onClick={() => setStep("count")}>
                  Oturum sayısını değiştir
                </Button>
                <Button type="button" variant="outline" disabled={pending || confirmLock} onClick={() => setConfirmLock(true)}>
                  <Lock className="size-4" />
                  Kilitle
                </Button>
                <Button type="button" disabled={pending} onClick={() => save(false)}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  Kaydet
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
