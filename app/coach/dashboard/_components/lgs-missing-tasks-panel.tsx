"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupMissingByDate, MISSING_TASKS_WINDOW_DAYS } from "@/lib/missing-tasks";
import { cn } from "@/lib/utils";
import { MissingTaskDateGroups } from "../../_components/missing-task-groups";
import type { LgsMissingTasksAlert } from "../types";

// "LGS Eksik/Tamamlanmayan Görevler": every LGS student with past-due tasks
// that were never completed (and aren't just waiting for photo approval --
// those live in "LGS Onay Bekleyen Görevler" beside it). Same tile chrome as
// that card: icon + title + count, a one-line summary and "Detaylı İncele",
// which opens the per-student breakdown (tasks boxed by day, as on the
// student's own page). Read-only: the coach acts from the student's page.
export function LgsMissingTasksPanel({ alerts }: { alerts: LgsMissingTasksAlert[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const taskCount = alerts.reduce((n, a) => n + a.tasks.length, 0);

  function toggleExpanded(studentId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        className="hover:bg-accent/20 cursor-pointer transition-colors"
      >
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ClipboardList className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">LGS Eksik/Tamamlanmayan Görevler ({taskCount})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground text-xs">Yok</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {alerts.length} öğrencide {taskCount} tamamlanmayan görev.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                }}
              >
                Detaylı İncele
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>LGS Eksik/Tamamlanmayan Görevler</DialogTitle>
            <p className="text-muted-foreground text-xs">
              Son {MISSING_TASKS_WINDOW_DAYS} günde süresi geçen, tamamlanmayan görevler. Kitap Okuma dahil değildir; onay bekleyen fotoğraflar
              ayrı listededir.
            </p>
          </DialogHeader>

          {alerts.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Tamamlanmayan görev kalmadı.</p>
          ) : (
            <div className="divide-border divide-y rounded-lg border">
              {alerts.map((alert) => {
                const isOpen = expanded.has(alert.student.id);
                return (
                  <div key={alert.student.id}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(alert.student.id)}
                      aria-expanded={isOpen}
                      className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors"
                    >
                      <span className="text-foreground text-sm font-semibold">
                        {alert.student.full_name ?? "İsimsiz Öğrenci"} ({alert.tasks.length})
                      </span>
                      <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                    </button>

                    {isOpen && (
                      <div className="space-y-3 px-3 pb-3">
                        <MissingTaskDateGroups groups={groupMissingByDate(alert.tasks)} />
                        <Link
                          href={`/coach/students/${alert.student.id}`}
                          className="text-foreground inline-block text-xs underline underline-offset-2"
                        >
                          Öğrenci sayfasını aç
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
