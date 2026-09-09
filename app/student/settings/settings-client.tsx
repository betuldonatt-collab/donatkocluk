"use client";

import { useState } from "react";
import { AlertTriangle, Download, Printer } from "lucide-react";

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
import { TASK_TYPE_LABELS, type StudentTask } from "../_components/daily-tasks/types";
import { submitCancellationRequest } from "./actions";
import { PasswordForm } from "./_components/password-form";
import { ThemeToggle } from "./theme-toggle";

export function SettingsClient({
  weekDays,
  weekTasks,
  initialRequestedAt,
}: {
  weekDays: { date: string; label: string }[];
  weekTasks: StudentTask[];
  initialRequestedAt: string | null;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
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
          <CardDescription>Bu haftaki programını yazdır veya PDF olarak kaydet</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Download className="size-4" />
            Haftalık Programımı İndir
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

      <PrintableWeeklySchedule weekDays={weekDays} weekTasks={weekTasks} />
    </div>
  );
}

function PrintableWeeklySchedule({
  weekDays,
  weekTasks,
}: {
  weekDays: { date: string; label: string }[];
  weekTasks: StudentTask[];
}) {
  return (
    <div className="hidden print:block">
      <h1 className="mb-4 text-xl font-semibold">
        <Printer className="mr-2 inline size-5" />
        Haftalık Programım
      </h1>
      {weekDays.map((day) => {
        const dayTasks = weekTasks.filter((t) => t.task_date === day.date);
        return (
          <div key={day.date} className="mb-4 break-inside-avoid">
            <h2 className="mb-1 border-b border-black pb-1 text-sm font-semibold">{day.label}</h2>
            {dayTasks.length === 0 ? (
              <p className="text-xs text-gray-500">Görev yok.</p>
            ) : (
              <ul className="text-xs">
                {dayTasks.map((task) => (
                  <li key={task.id} className="py-0.5">
                    ☐ {task.title} — {TASK_TYPE_LABELS[task.task_type]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
