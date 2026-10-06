"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/friendly-error";
import { DEFAULT_SHIFT_DAYS, formatShortDate, type TransferTarget } from "@/lib/task-transfer";
import { transferAssignedTasks, type TransferAssignedTasksResult } from "../../../../actions";

export type TransferSuccess = Extract<TransferAssignedTasksResult, { ok: true }> & { target: TransferTarget };

// "Seçilenleri Aktar": copies the selected tasks (fresh, pending) and marks the originals "Ertelendi" -- see
// transferAssignedTasks in actions.ts. Nothing is deleted. By default every task moves to the SAME WEEKDAY NEXT WEEK
// (its own day +7: a Wednesday task lands on next Wednesday); the coach can instead put them all on one chosen day.
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
  const [mode, setMode] = useState<"shift" | "date">("shift");
  const [targetDate, setTargetDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = taskIds.length > 0 && (mode === "shift" || /^\d{4}-\d{2}-\d{2}$/.test(targetDate));

  async function handleConfirm() {
    if (!canSubmit || saving) return;
    const target: TransferTarget = mode === "shift" ? { mode: "shift", days: DEFAULT_SHIFT_DAYS } : { mode: "date", date: targetDate };
    setSaving(true);
    setError(null);
    try {
      const result = await transferAssignedTasks(studentId, taskIds, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onTransferred({ ...result, target });
    } catch (e) {
      setError(friendlyError(e, "Görevler aktarılamadı."));
    } finally {
      setSaving(false);
    }
  }

  const option = (value: "shift" | "date", title: string, hint: string) => (
    <label
      className={
        "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm " + (mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-accent")
      }
    >
      <input type="radio" name="transfer-mode" className="mt-1" checked={mode === value} onChange={() => setMode(value)} disabled={saving} />
      <span>
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seçilen Görevleri Ertele</DialogTitle>
          <DialogDescription>
            {taskIds.length} görev seçildi. Her görevin yepyeni (bekliyor) bir kopyası eklenir. Asıl görevler silinmez; bulundukları günde &quot;Ertelendi&quot;
            olarak işaretlenir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {option("shift", "Bir sonraki haftaya (+7 gün)", "Her görev kendi gününün 7 gün sonrasına gider: Çarşamba görevi gelecek Çarşamba'ya. Hiçbiri tek güne yığılmaz.")}
          {option("date", "Hepsini tek bir tarihe", "Seçtiğin güne hepsi birlikte eklenir.")}
        </div>

        {mode === "date" && (
          <div className="space-y-1.5">
            <Label htmlFor="transfer-target-date">Yeni tarih</Label>
            <Input id="transfer-target-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} disabled={saving} />
            {canSubmit && <p className="text-muted-foreground text-xs">Görevler {formatShortDate(targetDate)} gününün sonuna eklenecek.</p>}
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canSubmit || saving}>
            {saving ? "Aktarılıyor..." : `${taskIds.length} Görevi Ertele`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
