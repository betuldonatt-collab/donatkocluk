"use client";

import { useState } from "react";
import { friendlyError } from "@/lib/friendly-error";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteCoachingSession, updateSessionPaymentStatus, updateSessionSchedule } from "../../../actions";
import type { DetailSession } from "../types";
import { AddSessionBatchDialog } from "./add-session-batch-dialog";

const OUTCOME_LABELS: Record<DetailSession["outcome"], string> = {
  pending: "Planlanan",
  completed: "Görüşme Gerçekleşti",
  not_happened: "Gerçekleşmedi",
};

const OUTCOME_COLORS: Record<DetailSession["outcome"], string> = {
  pending: "bg-muted text-muted-foreground",
  completed: "bg-emerald-500/15 text-emerald-700",
  not_happened: "bg-rose-500/15 text-rose-700",
};

// The inverse of updateSessionSchedule's own `${date}T${time}:00+03:00` ->
// toISOString() -- reading the stored instant back as Turkey wall-clock
// date/time, regardless of the browser's own timezone, so re-saving an
// untouched edit round-trips to the exact same scheduled_at.
function turkeyDateTime(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Scheduling + payment tracking only -- marking a session "Tamamlandı" has
// its own dedicated evaluation flow already (the dashboard's meeting
// banner/calendar, evaluateSessionCompleted), not duplicated here.
export function SessionsTab({ studentId, initialSessions }: { studentId: string; initialSessions: DetailSession[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [batchOpen, setBatchOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Which session's date/time is being edited inline, and the form's own
  // draft values -- independent of the session's real values until saved.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // The session pending a delete confirmation -- kept as the whole object
  // (not just an id) so the confirm dialog can still show its date after
  // the underlying session list has changed.
  const [pendingDelete, setPendingDelete] = useState<DetailSession | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startEdit(session: DetailSession) {
    const { date, time } = turkeyDateTime(session.scheduled_at);
    setEditingId(session.id);
    setEditDate(date);
    setEditTime(time);
  }

  async function handleSaveEdit(sessionId: string) {
    if (!editDate || !editTime) return;
    setSavingEdit(true);
    try {
      const updated = await updateSessionSchedule(sessionId, editDate, editTime);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, scheduled_at: (updated as { scheduled_at: string }).scheduled_at } : s)));
      setEditingId(null);
      toast.success("Görüşme tarihi güncellendi.");
    } catch (e) {
      toast.error(friendlyError(e, "Tarih güncellenemedi, tekrar dene."));
    } finally {
      setSavingEdit(false);
    }
  }

  const paidCount = sessions.filter((s) => s.is_paid).length;
  const completedCount = sessions.filter((s) => s.outcome === "completed").length;
  const remaining = paidCount - completedCount;

  async function handleTogglePaid(session: DetailSession) {
    setTogglingId(session.id);
    try {
      const updated = await updateSessionPaymentStatus(session.id, !session.is_paid);
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, is_paid: (updated as { is_paid: boolean }).is_paid } : s)));
    } catch (e) {
      toast.error(friendlyError(e, "Ödeme durumu güncellenemedi."));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCoachingSession(pendingDelete.id);
      setSessions((prev) => prev.filter((s) => s.id !== pendingDelete.id));
      setPendingDelete(null);
      toast.success("Görüşme silindi.");
    } catch (e) {
      toast.error(friendlyError(e, "Görüşme silinemedi."));
    } finally {
      setDeleting(false);
    }
  }

  const sorted = sessions.slice().sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return (
    <div className="space-y-4">
      <div className="border-border bg-card grid grid-cols-1 divide-y divide-border rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-3 text-center">
          <p className="text-muted-foreground text-xs">Ödenmiş</p>
          <p className="text-foreground text-lg font-semibold tabular-nums">{paidCount}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-muted-foreground text-xs">Tamamlanan</p>
          <p className="text-foreground text-lg font-semibold tabular-nums">{completedCount}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
            <BookOpen className="size-3" />
            Kalan
          </p>
          <p className={cn("text-lg font-semibold tabular-nums", remaining < 0 ? "text-rose-600" : "text-foreground")}>
            {remaining}
          </p>
        </div>
      </div>

      <Button type="button" className="h-10" onClick={() => setBatchOpen(true)}>
        Görüşme Paketi Ekle
      </Button>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz planlanmış bir görüşme yok.</p>
      ) : (
        <div className="border-border divide-border overflow-hidden rounded-lg border divide-y">
          {sorted.map((s) =>
            editingId === s.id ? (
              <div key={s.id} className="flex flex-wrap items-end gap-2 px-4 py-3">
                <div className="space-y-1">
                  <label htmlFor={`session-edit-date-${s.id}`} className="text-muted-foreground text-xs">
                    Tarih
                  </label>
                  <Input id={`session-edit-date-${s.id}`} type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} disabled={savingEdit} />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`session-edit-time-${s.id}`} className="text-muted-foreground text-xs">
                    Saat
                  </label>
                  <Input id={`session-edit-time-${s.id}`} type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} disabled={savingEdit} />
                </div>
                <Button type="button" size="sm" className="h-10" onClick={() => handleSaveEdit(s.id)} disabled={savingEdit || !editDate || !editTime}>
                  {savingEdit ? "Kaydediliyor..." : "Kaydet"}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => setEditingId(null)} disabled={savingEdit}>
                  Vazgeç
                </Button>
              </div>
            ) : (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium">{formatDate(s.scheduled_at)}</p>
                  <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", OUTCOME_COLORS[s.outcome])}>
                    {OUTCOME_LABELS[s.outcome]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      s.is_paid ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700",
                    )}
                  >
                    {s.is_paid ? "Ödendi" : "Ödeme Bekliyor"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-10"
                    onClick={() => startEdit(s)}
                    aria-label="Tarihi düzenle"
                    title="Tarihi düzenle"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => handleTogglePaid(s)}
                    disabled={togglingId === s.id}
                  >
                    {s.is_paid ? "Ödenmedi işaretle" : "Ödendi işaretle"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-10 disabled:opacity-40"
                    onClick={() => setPendingDelete(s)}
                    disabled={s.outcome === "completed"}
                    aria-label="Görüşmeyi sil"
                    title={s.outcome === "completed" ? "Gerçekleşmiş bir görüşme silinemez." : "Görüşmeyi sil"}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <AddSessionBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        studentId={studentId}
        onCreated={(created) => setSessions((prev) => [...prev, ...created])}
      />

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Görüşmeyi Sil</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {pendingDelete && <p className="text-foreground font-medium">{formatDate(pendingDelete.scheduled_at)}</p>}
            <p className="text-muted-foreground">Bu paketi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              İptal
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
