"use client";

import { UsernameCard } from "@/components/username-card";
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download } from "lucide-react";

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
import { mondayOf, weekDates } from "@/lib/date";
import { Input } from "@/components/ui/input";
import { getTasksForWeek } from "../actions";
import { cn } from "@/lib/utils";
import { submitCancellationRequest } from "./actions";
import { PasswordForm } from "./_components/password-form";
import { ThemeToggle } from "./theme-toggle";

// Monday..Sunday of the week containing `dateIso`, labelled like the rest of the app.
function buildWeek(dateIso: string): { date: string; label: string }[] {
  return weekDates(dateIso).map((date) => ({
    date,
    label: new Date(`${date}T00:00:00Z`).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  }));
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  // Which week gets printed: starts as the current week (already loaded by the
  // page) and can be moved to any past or future week. Only a change of week asks
  // the server for that one week's tasks; printing itself stays purely client-side.
  const currentMonday = weekDays[0].date;
  const [printDays, setPrintDays] = useState(weekDays);
  const [printTasks, setPrintTasks] = useState(weekTasks);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  async function selectWeek(dateIso: string) {
    if (!dateIso) return;
    const monday = mondayOf(dateIso);
    if (monday === printDays[0].date) return;
    setWeekLoading(true);
    setWeekError(null);
    try {
      const days = buildWeek(monday);
      const { tasks } = await getTasksForWeek(days[0].date, days[6].date);
      setPrintTasks(tasks as unknown as StudentTask[]);
      setPrintDays(days);
    } catch {
      setWeekError("Bu haftanın programı yüklenemedi. Tekrar dene.");
    } finally {
      setWeekLoading(false);
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
          <CardDescription>Yazdırmak veya PDF olarak kaydetmek istediğin haftayı seç</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Önceki hafta" disabled={weekLoading} onClick={() => void selectWeek(shiftDays(printDays[0].date, -7))}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-foreground min-w-0 flex-1 text-center text-sm font-medium sm:flex-none sm:min-w-56">
              {printDays[0].label} – {printDays[6].label}
            </span>
            <Button type="button" variant="outline" size="icon" aria-label="Sonraki hafta" disabled={weekLoading} onClick={() => void selectWeek(shiftDays(printDays[0].date, 7))}>
              <ChevronRight className="size-4" />
            </Button>
            <Input
              type="date"
              aria-label="Belirli bir tarihin haftasını seç"
              value={printDays[0].date}
              disabled={weekLoading}
              onChange={(e) => void selectWeek(e.target.value)}
              className="w-auto"
            />
            {printDays[0].date !== currentMonday && (
              <Button type="button" variant="ghost" size="sm" disabled={weekLoading} onClick={() => void selectWeek(currentMonday)}>
                Bu Hafta
              </Button>
            )}
          </div>
          {weekError && <p className="text-destructive text-sm">{weekError}</p>}
          <Button type="button" variant="outline" disabled={weekLoading} onClick={() => window.print()}>
            <Download className="size-4" />
            {weekLoading ? "Hafta yükleniyor..." : "Haftalık Programımı İndir"}
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
    <PrintableWeeklySchedule weekDays={printDays} weekTasks={printTasks} />
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

// The printed weekly program (Ayarlar > Haftalık Programımı İndir -> window.print()):
// a landscape timetable -- one column per day, Rutinler and Görevler as rows --
// with each task's subject colour, type, question/page target and status. It is
// pure client-side HTML/CSS; the print stylesheet (globals.css) keeps the colours.
function PrintableWeeklySchedule({
  weekDays,
  weekTasks,
}: {
  weekDays: { date: string; label: string }[];
  weekTasks: StudentTask[];
}) {
  const byDay = (date: string) => weekTasks.filter((t) => t.task_date === date).sort((a, b) => a.order_index - b.order_index);
  const routines = weekDays.map((d) => byDay(d.date).filter((t) => isRoutineCourseId(t.course_id)));
  const regular = weekDays.map((d) => byDay(d.date).filter((t) => !isRoutineCourseId(t.course_id)));
  const hasRoutines = routines.some((r) => r.length > 0);

  return (
    <div className="weekly-print hidden print:block">
      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-black">Haftalık Programım</h1>
        <p className="text-xs text-gray-600">
          {weekDays[0]?.label} – {weekDays[6]?.label}
        </p>
      </div>

      <table className="w-full table-fixed border-collapse text-[9px]">
        <thead>
          <tr>
            {weekDays.map((day) => (
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
                <td colSpan={7} className="border border-gray-500 bg-indigo-100 px-1 py-0.5 text-[9px] font-bold tracking-wide text-indigo-900 uppercase">
                  Rutinler
                </td>
              </tr>
              <tr>
                {routines.map((tasks, i) => (
                  <td key={weekDays[i].date} className="border border-gray-500 p-1 align-top">
                    <PrintTaskCell tasks={tasks} />
                  </td>
                ))}
              </tr>
            </>
          )}
          <tr>
            <td colSpan={7} className="border border-gray-500 bg-gray-200 px-1 py-0.5 text-[9px] font-bold tracking-wide text-gray-900 uppercase">
              Görevler
            </td>
          </tr>
          <tr>
            {regular.map((tasks, i) => (
              <td key={weekDays[i].date} className="border border-gray-500 p-1 align-top">
                <PrintTaskCell tasks={tasks} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
