"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { STUDENT_EVENT_TYPE_LABELS, type StudentEventType } from "@/lib/student-events";
import { createStudentEvent, deleteStudentEvent, updateStudentEvent, type StudentEvent } from "../../../../actions";

const EVENT_TYPES: StudentEventType[] = ["meeting", "school", "sports", "personal", "other"];

export type EventDialogState = { mode: "create"; date: string } | { mode: "edit"; event: StudentEvent };

// Create/edit/delete for a single "Time Block" (student_events row) -- no
// title field: the row's title is always just STUDENT_EVENT_TYPE_LABELS for
// whichever event_type is picked (see actions.ts), so the dialog just shows
// that label live as the type toggle changes. The coach can still freely
// rewrite the description and delete outright. Unlike TaskDrawer, this is a
// plain modal built on the shared Dialog primitive (same pattern as
// app/coach/dashboard/_components/event-dialogs.tsx) since time blocks have
// none of the task-specific fields that drove TaskDrawer's custom layout.
export function EventDialog({
  state,
  studentId,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
}: {
  state: EventDialogState;
  studentId: string;
  onClose: () => void;
  onCreated: (event: StudentEvent) => void;
  onSaved: (event: StudentEvent) => void;
  onDeleted: (eventId: string) => void;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.event : null;

  const [description, setDescription] = useState(initial?.description ?? "");
  const [eventType, setEventType] = useState<StudentEventType>(initial?.event_type ?? "other");
  const [eventDate, setEventDate] = useState(initial?.event_date ?? (state.mode === "create" ? state.date : ""));
  const [startTime, setStartTime] = useState(initial?.start_time.slice(0, 5) ?? "09:00");
  const [endTime, setEndTime] = useState(initial?.end_time.slice(0, 5) ?? "10:00");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = Boolean(eventDate) && Boolean(startTime) && Boolean(endTime) && endTime > startTime;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        description: description.trim() || null,
        eventType,
        eventDate,
        startTime,
        endTime,
      };
      if (isEdit) {
        const saved = await updateStudentEvent(studentId, state.event.id, payload);
        onSaved(saved as StudentEvent);
      } else {
        const created = await createStudentEvent(studentId, payload);
        onCreated(created as StudentEvent);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteStudentEvent(studentId, state.event.id);
      onDeleted(state.event.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi.");
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Zaman Bloğunu Düzenle" : "Yeni Zaman Bloğu"} — {STUDENT_EVENT_TYPE_LABELS[eventType]}
          </DialogTitle>
        </DialogHeader>

        <div className="bg-secondary flex w-fit flex-wrap rounded-lg p-1">
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEventType(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                eventType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {STUDENT_EVENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="event-description">Not / Açıklama</Label>
          <Textarea
            id="event-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="İsteğe bağlı detay..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="event-date">Tarih</Label>
            <Input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-start">Başlangıç</Label>
            <Input id="event-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-end">Bitiş</Label>
            <Input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter className="sm:justify-between">
          {isEdit ? (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? "Siliniyor..." : "Sil"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || deleting}>
              İptal
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave || saving || deleting}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
