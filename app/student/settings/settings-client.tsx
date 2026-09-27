"use client";

import { UsernameCard } from "@/components/username-card";
import { useState } from "react";
import { AlertTriangle, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TASK_TYPE_LABELS, subjectTintClass, type StudentTask } from "../_components/daily-tasks/types";
import { isRoutineCourseId } from "@/lib/curriculum";
import { Input } from "@/components/ui/input";
import { getTasksForPrint } from "../actions";
import { cn } from "@/lib/utils";
import { submitCancellationRequest } from "./actions";
import { PasswordForm } from "./_components/password-form";
import { ThemeToggle } from "./theme-toggle";

const PRINT_MAX_DAYS = 62;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayCount(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

// Every day from `start` to `end` inclusive, labelled like the rest of the app.
function buildRange(start: string, end: string): { date: string; label: string }[] {
  const days: { date: string; label: string }[] = [];
  for (let i = 0; i < dayCount(start, end); i++) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
    });
  }
  return days;
}

// "21 Eylül 2026"
function formatLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function SettingsClient({
  weekDays,
  weekTasks,
  initialRequestedAt,
  username,
}: {
  weekDays: { date: string; label: string }[];
  weekTasks: StudentTask[];
  initialRequestedAt: string | null;
  username: string | null;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  // The printed range: starts as the current week (already loaded by the page) and
  // can be any custom start..end span (1 to ${PRINT_MAX_DAYS} days). Only a change of range
  // asks the server, with one lean query for exactly that span; printing itself is
  // purely client-side.
  const [startInput, setStartInput] = useState(weekDays[0].date);
  const [endInput, setEndInput] = useState(weekDays[6].date);
  const [printDays, setPrintDays] = useState(weekDays);
  const [printTasks, setPrintTasks] = useState(weekTasks);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const currentStart = weekDays[0].date;
  const currentEnd = weekDays[6].date;

  async function applyRange(start: string, end: string) {
    setStartInput(start);
    setEndInput(end);
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) return; // still typing
    const n = dayCount(start, end);
    if (n < 1) {
      setRangeError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
      return;
    }
    if (n > PRINT_MAX_DAYS) {
      setRangeError(`En fazla ${PRINT_MAX_DAYS} günlük bir aralık seçebilirsin.`);
      return;
    }
    setRangeError(null);
    if (start === printDays[0].date && end === printDays[printDays.length - 1].date) return;
    setRangeLoading(true);
    try {
      const rows = await getTasksForPrint(start, end);
      setPrintTasks(rows as unknown as StudentTask[]);
      setPrintDays(buildRange(start, end));
    } catch {
      setRangeError("Bu aralığın programı yüklenemedi. Tekrar dene.");
    } finally {
      setRangeLoading(false);
    }
  }

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestedAt, setRequestedAt] = useState(initialRequestedAt);

  async function handleSubmitCancellation() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await submitCancellationRequest(reason.trim());
      setRequestedAt(new Date().toISOString());
      setCancelOpen(false);
      setReason("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <div className="space-y-6 print:hidden">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Görünüm</CardTitle>
          <CardDescription>Açık veya koyu temayı seç</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <UsernameCard username={username} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Şifre Değiştir</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Çevrimdışı Kullanım</CardTitle>
          <CardDescription>Yazdırmak veya PDF olarak kaydetmek istediğin tarih aralığını seç</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="print-start">Başlangıç Tarihi</Label>
              <Input id="print-start" type="date" value={startInput} disabled={rangeLoading} onChange={(e) => void applyRange(e.target.value, endInput)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="print-end">Bitiş Tarihi</Label>
              <Input id="print-end" type="date" value={endInput} min={startInput || undefined} disabled={rangeLoading} onChange={(e) => void applyRange(startInput, e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={rangeLoading} onClick={() => void applyRange(currentStart, currentEnd)}>
              Bu Hafta
            </Button>
            <span className="text-muted-foreground text-xs">
              {printDays.length} gün · {formatLongDate(printDays[0].date)} — {formatLongDate(printDays[printDays.length - 1].date)}
            </span>
          </div>
          {rangeError && <p className="text-destructive text-sm">{rangeError}</p>}
          <Button type="button" variant="outline" disabled={rangeLoading || rangeError !== null} onClick={() => window.print()}>
            <Download className="size-4" />
            {rangeLoading ? "Program yükleniyor..." : "Haftalık Programımı İndir"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">Üyelik</CardTitle>
          <CardDescription>Ayrılmadan önce bize sebebini söyle, yardımcı olmaya çalışalım</CardDescription>
        </CardHeader>
        <CardContent>
          {requestedAt ? (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              <AlertTriangle className="size-4 shrink-0" />
              Ayrılma talebin alındı, koçluk ekibimiz seninle iletişime geçecek.
            </div>
          ) : (
            <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
              Üyeliği Sonlandır
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neden ayrılmak istiyorsun?</DialogTitle>
            <DialogDescription>
              Bu bilgi yalnızca yönetici ekibiyle paylaşılır, koçun bu talebi göremez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancellation-reason">Sebep</Label>
            <Textarea
              id="cancellation-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Bize ayrılma sebebini anlatır mısın?"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmitCancellation}
              disabled={!reason.trim() || submitting}
            >
              {submitting ? "Gönderiliyor..." : "Talebi Gönder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>

    {/* Outside the print:hidden wrapper: it used to sit INSIDE it, so the printed
        page was the hidden wrapper's empty shell (a blank page). */}
    <PrintableWeeklySchedule days={printDays} tasks={printTasks} />
    </>
  );
}

// One short line for what the task asks: the assigned target ("50 soru", "2 adet",
// "120 sayfa") and/or the planned duration -- the numbers a student needs on paper.
function printTarget(task: StudentTask): string {
  const parts: string[] = [];
  if (task.total_count !== null && task.total_count > 0) {
    const unit = task.task_type === "branch_exam" ? "adet" : task.task_type === "reading" ? "sayfa" : "soru";
    if (task.task_type !== "general_exam" && task.task_type !== "video") parts.push(`${task.total_count} ${unit}`);
  }
  if (task.duration_minutes !== null && task.duration_minutes > 0) parts.push(`${task.duration_minutes} dk`);
  return parts.join(" · ");
}

const PRINT_STATUS: Record<StudentTask["status"], { label: string; className: string }> = {
  pending: { label: "Bekliyor", className: "bg-gray-200 text-gray-700" },
  done: { label: "Tamamlandı", className: "bg-emerald-200 text-emerald-800" },
  half_done: { label: "Yarım", className: "bg-amber-200 text-amber-800" },
  not_done: { label: "Yapılmadı", className: "bg-rose-200 text-rose-800" },
};

function PrintTaskCell({ tasks }: { tasks: StudentTask[] }) {
  if (tasks.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="space-y-1">
      {tasks.map((task) => {
        const target = printTarget(task);
        const status = PRINT_STATUS[task.status];
        return (
          <div key={task.id} className={cn("break-inside-avoid rounded border border-gray-400 p-1 leading-tight", subjectTintClass(task))}>
            <p className="font-semibold break-words text-black">{task.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-gray-800">
              <span className="rounded bg-white/70 px-1 font-medium">{TASK_TYPE_LABELS[task.task_type]}</span>
              {target && <span className="font-semibold">{target}</span>}
            </p>
            <p className="mt-0.5">
              <span className={cn("rounded px-1 font-medium", status.className)}>{status.label}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

// The printed program (Ayarlar > Haftalık Programımı İndir -> window.print()): a
// landscape timetable for ANY start..end range -- one column per day (in rows of up
// to seven, so a 14-day span prints as two week-sized tables and a 3-day span as
// one narrow one), Rutinler and Görevler as rows -- with each task's subject
// colour, type, question/page target and status. Pure client-side HTML/CSS; the
// print stylesheet (globals.css) keeps the colours.
function PrintableWeeklySchedule({ days, tasks }: { days: { date: string; label: string }[]; tasks: StudentTask[] }) {
  const byDay = (date: string) => tasks.filter((t) => t.task_date === date).sort((a, b) => a.order_index - b.order_index);
  const chunks: { date: string; label: string }[][] = [];
  for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));

  return (
    <div className="weekly-print hidden print:block">
      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-black">Haftalık Programım</h1>
        <p className="text-xs font-medium text-gray-700">
          {formatLongDate(days[0].date)} — {formatLongDate(days[days.length - 1].date)}
        </p>
      </div>

      {chunks.map((chunk) => {
        const routines = chunk.map((d) => byDay(d.date).filter((t) => isRoutineCourseId(t.course_id)));
        const regular = chunk.map((d) => byDay(d.date).filter((t) => !isRoutineCourseId(t.course_id)));
        const hasRoutines = routines.some((r) => r.length > 0);
        return (
          <table key={chunk[0].date} className="mb-3 w-full table-fixed border-collapse text-[9px]">
            <thead>
              <tr>
                {chunk.map((day) => (
                  <th key={day.date} className="border border-gray-500 bg-[#1e2a5a] px-1 py-1 text-center text-[10px] font-semibold text-white">
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hasRoutines && (
                <>
                  <tr>
                    <td colSpan={chunk.length} className="border border-gray-500 bg-indigo-100 px-1 py-0.5 text-[9px] font-bold tracking-wide text-indigo-900 uppercase">
                      Rutinler
                    </td>
                  </tr>
                  <tr>
                    {routines.map((dayTasks, i) => (
                      <td key={chunk[i].date} className="border border-gray-500 p-1 align-top">
                        <PrintTaskCell tasks={dayTasks} />
                      </td>
                    ))}
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={chunk.length} className="border border-gray-500 bg-gray-200 px-1 py-0.5 text-[9px] font-bold tracking-wide text-gray-900 uppercase">
                  Görevler
                </td>
              </tr>
              <tr>
                {regular.map((dayTasks, i) => (
                  <td key={chunk[i].date} className="border border-gray-500 p-1 align-top">
                    <PrintTaskCell tasks={dayTasks} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
