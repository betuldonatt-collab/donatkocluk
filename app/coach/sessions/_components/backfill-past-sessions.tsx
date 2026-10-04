"use client";

// =============================================================================
// "Geçmiş Görüşmeler" bulk quick-add -- for entering historical sessions (ones
// that happened before this coach started using the scheduler, a new student's
// prior sessions, or a missed entry noticed later) without going through the
// live "schedule then complete" flow one row at a time.
//
// One student picked once, then a spreadsheet-style list of date/time/ödendi
// rows for THAT student, submitted together as one "Toplu Kaydet" -- one
// action call inserts every row in a single statement (see
// backfillPastSessions), instead of one click (and one round trip) per date.
// =============================================================================

import { useState } from "react";
import { friendlyError } from "@/lib/friendly-error";
import { History, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backfillPastSessions } from "../../actions";
import type { RosterStudent } from "../../dashboard/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type Row = { key: number; date: string; time: string; isPaid: boolean };

let nextKey = 1;
function emptyRow(defaultPaid: boolean): Row {
  return { key: nextKey++, date: "", time: "", isPaid: defaultPaid };
}

export function BackfillPastSessions({ roster }: { roster: RosterStudent[] }) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState(roster[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(true)]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  if (roster.length === 0) return null;

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(true)]);
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  const validRows = rows.filter((r) => r.date);

  async function handleBulkSave() {
    if (!studentId || validRows.length === 0) return;
    setSaving(true);
    try {
      const { inserted } = await backfillPastSessions(
        studentId,
        validRows.map((r) => ({ date: r.date, time: r.time || null, isPaid: r.isPaid })),
      );
      setSavedCount((n) => n + inserted);
      toast.success(`${inserted} görüşme eklendi.`);
      // Student stays picked (see file header); rows reset to one fresh blank
      // row so the next student's dates start clean.
      setRows([emptyRow(true)]);
    } catch (e) {
      toast.error(friendlyError(e, "Eklenemedi, tekrar dene."));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <History className="size-4" />
        Geçmiş Görüşmeler
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Geçmiş Görüşme Ekle (Toplu)</CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Kapat
          </Button>
        </div>
        <CardDescription>
          Zaten yapılmış eski görüşmeleri hızlıca kaydeder. Tamamlandı olarak eklenir, öğrenciye
          değerlendirme bildirimi veya &quot;Ara Görüşme&quot; görevi oluşturmaz. Saat boş bırakılırsa 12:00 kullanılır.
          {savedCount > 0 && <span className="text-foreground font-medium"> Bu oturumda eklenen: {savedCount}.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="backfill-student">Öğrenci</Label>
          <select
            id="backfill-student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="border-input bg-background flex h-10 md:h-9 w-full max-w-sm min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {roster.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? "(İsimsiz)"}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {/* Column headings, desktop only -- each row repeats its own labels
              below sm so the form stays usable on a phone. */}
          <div className="text-muted-foreground hidden grid-cols-[1fr_1fr_auto_auto] gap-2 px-1 text-xs font-medium sm:grid">
            <span>Tarih</span>
            <span>Saat (opsiyonel)</span>
            <span>Ödendi</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div key={row.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <div className="space-y-1 sm:space-y-0">
                <Label htmlFor={`backfill-date-${row.key}`} className="text-xs sm:hidden">
                  Tarih
                </Label>
                <Input
                  id={`backfill-date-${row.key}`}
                  type="date"
                  value={row.date}
                  onChange={(e) => updateRow(row.key, { date: e.target.value })}
                  max={todayISO()}
                  autoFocus={i === rows.length - 1 && rows.length > 1}
                />
              </div>
              <div className="space-y-1 sm:space-y-0">
                <Label htmlFor={`backfill-time-${row.key}`} className="text-xs sm:hidden">
                  Saat (opsiyonel)
                </Label>
                <Input
                  id={`backfill-time-${row.key}`}
                  type="time"
                  value={row.time}
                  onChange={(e) => updateRow(row.key, { time: e.target.value })}
                  placeholder="12:00"
                />
              </div>
              <Label className="text-foreground flex items-center gap-2 text-sm font-normal">
                <input
                  type="checkbox"
                  checked={row.isPaid}
                  onChange={(e) => updateRow(row.key, { isPaid: e.target.checked })}
                  className="size-4"
                />
                <span className="sm:hidden">Ödendi</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
                aria-label="Bu satırı kaldır"
                className="text-muted-foreground hover:text-destructive justify-self-start"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
            <Plus className="size-4" />
            Başka Görüşme Ekle
          </Button>
          <Button type="button" onClick={handleBulkSave} disabled={saving || !studentId || validRows.length === 0}>
            {saving ? "Kaydediliyor..." : `Toplu Kaydet (${validRows.length})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
