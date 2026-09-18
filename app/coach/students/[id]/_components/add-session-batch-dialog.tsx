"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPaidSessionBatch } from "../../../actions";
import type { DetailSession } from "../types";

const DEFAULT_ROW_COUNT = 1;
const MAX_ROWS = 20;

function emptyRow() {
  return { date: "", time: "10:00", meetingUrl: "" };
}

function defaultRows() {
  return Array.from({ length: DEFAULT_ROW_COUNT }, emptyRow);
}

// "Parent paid for N sessions" -- lets the coach schedule every date from
// one payment in a single submit instead of repeating the dashboard's
// single-session dialog N times. Every row created here is pre-marked
// paid (createPaidSessionBatch, app/coach/actions.ts); outcome stays the
// normal 'pending' default until the coach evaluates it later, same as
// any other scheduled session. Each row carries its own meeting link --
// one payment doesn't imply every session shares a single recurring URL.
export function AddSessionBatchDialog({
  open,
  onOpenChange,
  studentId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  onCreated: (sessions: DetailSession[]) => void;
}) {
  const [rows, setRows] = useState(defaultRows);
  const [saving, setSaving] = useState(false);

  function updateRow(index: number, patch: Partial<{ date: string; time: string; meetingUrl: string }>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, emptyRow()]));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setRows(defaultRows());
  }

  const validRows = rows.filter((r) => r.date && r.meetingUrl.trim());
  const canSubmit = validRows.length > 0 && validRows.length === rows.length;

  async function handleCreate() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const sessions = await createPaidSessionBatch({
        studentId,
        sessions: validRows.map((r) => ({
          scheduledAt: new Date(`${r.date}T${r.time || "00:00"}:00`).toISOString(),
          meetingUrl: r.meetingUrl.trim(),
        })),
      });
      onCreated(sessions as DetailSession[]);
      reset();
      onOpenChange(false);
      toast.success(`${sessions.length} görüşme ödendi olarak eklendi.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Görüşmeler eklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Görüşme Paketi Ekle</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Veli ödeme yaptığında, satın alınan görüşme sayısı kadar tarihi tek seferde ekle. Hepsi &ldquo;Ödendi&rdquo; olarak
          işaretlenir.
        </p>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="border-border space-y-2 rounded-lg border p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor={`batch-date-${i}`}>Tarih</Label>
                  <Input
                    id={`batch-date-${i}`}
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(i, { date: e.target.value })}
                  />
                </div>
                <div className="w-28 space-y-1.5">
                  <Label htmlFor={`batch-time-${i}`}>Saat</Label>
                  <Input
                    id={`batch-time-${i}`}
                    type="time"
                    value={row.time}
                    onChange={(e) => updateRow(i, { time: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeRow(i)}
                  disabled={rows.length <= 1}
                  aria-label="Satırı kaldır"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`batch-meeting-url-${i}`}>Görüşme Linki</Label>
                <Input
                  id={`batch-meeting-url-${i}`}
                  value={row.meetingUrl}
                  onChange={(e) => updateRow(i, { meetingUrl: e.target.value })}
                  placeholder="https://meet.google.com/..."
                />
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" onClick={addRow} disabled={rows.length >= MAX_ROWS} className="w-fit">
          <Plus className="size-4" />
          Tarih Ekle
        </Button>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" className="h-10" onClick={handleCreate} disabled={saving || !canSubmit}>
            {saving ? "Ekleniyor..." : `${validRows.length || ""} Görüşme Ekle`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
