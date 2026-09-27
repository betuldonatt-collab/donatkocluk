"use client";

// =============================================================================
// TEMPORARY -- "Geçmiş Görüşmeler" quick-add, for entering historical sessions
// that happened before this coach started using the scheduler. DELETE THIS
// WHOLE FILE, plus backfillPastSession in ../../actions.ts and the two lines
// that mount <BackfillPastSessions /> in ../page.tsx, once the backfill is
// done -- nothing else imports either, so removing all three is a clean,
// self-contained delete. The sessions it created stay in the database exactly
// as normal completed sessions; only this entry form goes away.
//
// One student + one date/time + paid-or-not per submit, on purpose (not a
// multi-row grid): simplest to build, and a coach entering ~10 sessions per
// student can just leave the student picked and change the date each time --
// the form does NOT reset the student after a save, only the date/time, for
// exactly that reason.
// =============================================================================

import { useState } from "react";
import { History } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backfillPastSession } from "../../actions";
import type { RosterStudent } from "../../dashboard/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function BackfillPastSessions({ roster }: { roster: RosterStudent[] }) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState(roster[0]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("18:00");
  const [isPaid, setIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  if (roster.length === 0) return null;

  async function handleSave() {
    if (!studentId || !date || !time) return;
    setSaving(true);
    try {
      await backfillPastSession({ studentId, date, time, isPaid });
      setSavedCount((n) => n + 1);
      toast.success("Geçmiş görüşme eklendi.");
      // Student and "ödendi" stay picked on purpose (see file header) -- only
      // the date/time reset, so entering this student's next past session is
      // just "change the date, hit kaydet" again.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eklenemedi, tekrar dene.");
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
    <Card className="border-amber-500/40">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Geçmiş Görüşme Ekle</CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Kapat
          </Button>
        </div>
        <CardDescription>
          Geçici araç: zaten yapılmış eski görüşmeleri hızlıca kaydeder. Tamamlandı olarak eklenir, öğrenciye
          değerlendirme bildirimi veya &quot;Ara Görüşme&quot; görevi oluşturmaz.
          {savedCount > 0 && <span className="text-foreground font-medium"> Bu oturumda eklenen: {savedCount}.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="backfill-student">Öğrenci</Label>
            <select
              id="backfill-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="border-input bg-background flex h-10 md:h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              {roster.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name ?? "(İsimsiz)"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="backfill-date">Tarih</Label>
            <Input id="backfill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="backfill-time">Saat</Label>
            <Input id="backfill-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-foreground flex items-center gap-2 text-sm font-normal">
            <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} className="size-4" />
            Ödendi
          </Label>
        </div>

        <Button type="button" onClick={handleSave} disabled={saving || !studentId}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </CardContent>
    </Card>
  );
}
