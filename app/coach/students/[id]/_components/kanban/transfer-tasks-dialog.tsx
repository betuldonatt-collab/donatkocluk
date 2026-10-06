"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/friendly-error";
import { formatShortDate } from "@/lib/task-transfer";
import { transferAssignedTasks, type TransferAssignedTasksResult } from "../../../../actions";

export type TransferSuccess = Extract<TransferAssignedTasksResult, { ok: true }> & { targetDate: string };

// "Seçilenleri Aktar": asks for the new date, then copies the selected tasks there (fresh, pending) and marks the
// originals "Ertelendi" -- see transferAssignedTasks in actions.ts. Nothing is deleted.
export function TransferTasksDialog({
  studentId,
  taskIds,
  defaultDate,
  onClose,
  onTransferred,
}: {
  studentId: string;
  taskIds: string[];
  defaultDate: string;
  onClose: () => void;
  onTransferred: (result: TransferSuccess) => void;
}) {
  const [targetDate, setTargetDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && taskIds.length > 0;

  async function handleConfirm() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await transferAssignedTasks(studentId, taskIds, targetDate);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onTransferred({ ...result, targetDate });
    } catch (e) {
      setError(friendlyError(e, "Görevler aktarılamadı."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seçilen Görevleri Aktar</DialogTitle>
          <DialogDescription>
            {taskIds.length} görev seçildi. Seçtiğin tarihe hepsinin yepyeni (bekliyor) bir kopyası eklenir. Asıl görevler silinmez; bulundukları günde
            &quot;Ertelendi&quot; olarak işaretlenir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="transfer-target-date">Yeni tarih</Label>
          <Input id="transfer-target-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} disabled={saving} />
          {canSubmit && <p className="text-muted-foreground text-xs">Görevler {formatShortDate(targetDate)} gününün sonuna eklenecek.</p>}
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canSubmit || saving}>
            {saving ? "Aktarılıyor..." : `${taskIds.length} Görevi Aktar`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
