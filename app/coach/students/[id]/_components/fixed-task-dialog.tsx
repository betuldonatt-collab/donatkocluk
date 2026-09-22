"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createFixedTask, deleteFixedTask, updateFixedTask, type StudentFixedTask } from "../../../actions";

// Monday=0..Sunday=6, matching this app's own existing convention
// (mondayIndexOf/DAY_LABELS_SHORT in schedule-board.tsx/task-drawer.tsx).
const DAY_LABELS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export type FixedTaskDialogState = { mode: "create"; dayOfWeek: number } | { mode: "edit"; task: StudentFixedTask };

// Create/edit/delete for a single "Sabit Görev" row. Plain modal on the
// shared Dialog primitive, same pattern as EventDialog (kanban/event-dialog.tsx)
// -- simpler than that one, though: a fixed task has a real title (typed
// directly, not derived from a type enum) and a single day-of-week instead
// of a date, no description, no order_index/lock (it's never part of the
// tasks/events drag order -- see migration 0081's own comment).
export function FixedTaskDialog({
  state,
  studentId,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
}: {
  state: FixedTaskDialogState;
  studentId: string;
  onClose: () => void;
  onCreated: (task: StudentFixedTask) => void;
  onSaved: (task: StudentFixedTask) => void;
  onDeleted: (taskId: string) => void;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.task : null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(initial?.day_of_week ?? (state.mode === "create" ? state.dayOfWeek : 0));
  const [startTime, setStartTime] = useState(initial?.start_time.slice(0, 5) ?? "08:00");
  const [endTime, setEndTime] = useState(initial?.end_time.slice(0, 5) ?? "09:00");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = !!title.trim() && Boolean(startTime) && Boolean(endTime) && endTime > startTime;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      // The description is only sent when there is one to save or one to clear,
      // so a fixed task that never had any is written exactly as before.
      const payload = {
        title: title.trim(),
        dayOfWeek,
        startTime,
        endTime,
        ...(description.trim() || initial?.description ? { description: description.trim() || null } : {}),
      };
      if (isEdit) {
        const saved = await updateFixedTask(studentId, state.task.id, payload);
        onSaved(saved);
      } else {
        const created = await createFixedTask(studentId, payload);
        onCreated(created);
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
      await deleteFixedTask(studentId, state.task.id);
      onDeleted(state.task.id);
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
          <DialogTitle>{isEdit ? "Sabit Görevi Düzenle" : "Yeni Sabit Görev"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="fixed-task-title">Başlık</Label>
          <Input id="fixed-task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn: Okul, Basketbol Antrenmanı" />
        </div>

        <div className="space-y-1.5">
          <Label>Gün</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS_SHORT.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={dayOfWeek === i}
                onClick={() => setDayOfWeek(i)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  dayOfWeek === i
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fixed-task-start">Başlangıç</Label>
            <Input id="fixed-task-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fixed-task-end">Bitiş</Label>
            <Input id="fixed-task-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fixed-task-description">Açıklama (opsiyonel)</Label>
          <Textarea
            id="fixed-task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Başlığın altında görünür; yazdığın satır boşlukları korunur"
          />
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
