"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateSessionPaymentStatus } from "../../../actions";
import type { DetailSession } from "../types";
import { AddSessionBatchDialog } from "./add-session-batch-dialog";

const OUTCOME_LABELS: Record<DetailSession["outcome"], string> = {
  pending: "Planlanan",
  completed: "Görüşme Gerçekleşti",
  not_happened: "Gerçekleşmedi",
};

const OUTCOME_COLORS: Record<DetailSession["outcome"], string> = {
  pending: "bg-muted text-muted-foreground",
  completed: "bg-emerald-500/15 text-emerald-700",
  not_happened: "bg-rose-500/15 text-rose-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Scheduling + payment tracking only -- marking a session "Tamamlandı" has
// its own dedicated evaluation flow already (the dashboard's meeting
// banner/calendar, evaluateSessionCompleted), not duplicated here.
export function SessionsTab({ studentId, initialSessions }: { studentId: string; initialSessions: DetailSession[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [batchOpen, setBatchOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const paidCount = sessions.filter((s) => s.is_paid).length;
  const completedCount = sessions.filter((s) => s.outcome === "completed").length;
  const remaining = paidCount - completedCount;

  async function handleTogglePaid(session: DetailSession) {
    setTogglingId(session.id);
    try {
      const updated = await updateSessionPaymentStatus(session.id, !session.is_paid);
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, is_paid: (updated as { is_paid: boolean }).is_paid } : s)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ödeme durumu güncellenemedi.");
    } finally {
      setTogglingId(null);
    }
  }

  const sorted = sessions.slice().sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return (
    <div className="space-y-4">
      <div className="border-border bg-card grid grid-cols-1 divide-y divide-border rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-3 text-center">
          <p className="text-muted-foreground text-xs">Ödenmiş</p>
          <p className="text-foreground text-lg font-semibold tabular-nums">{paidCount}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-muted-foreground text-xs">Tamamlanan</p>
          <p className="text-foreground text-lg font-semibold tabular-nums">{completedCount}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
            <BookOpen className="size-3" />
            Kalan
          </p>
          <p className={cn("text-lg font-semibold tabular-nums", remaining < 0 ? "text-rose-600" : "text-foreground")}>
            {remaining}
          </p>
        </div>
      </div>

      <Button type="button" className="h-10" onClick={() => setBatchOpen(true)}>
        Görüşme Paketi Ekle
      </Button>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz planlanmış bir görüşme yok.</p>
      ) : (
        <div className="border-border divide-border overflow-hidden rounded-lg border divide-y">
          {sorted.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">{formatDate(s.scheduled_at)}</p>
                <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", OUTCOME_COLORS[s.outcome])}>
                  {OUTCOME_LABELS[s.outcome]}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    s.is_paid ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700",
                  )}
                >
                  {s.is_paid ? "Ödendi" : "Ödeme Bekliyor"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => handleTogglePaid(s)}
                  disabled={togglingId === s.id}
                >
                  {s.is_paid ? "Ödenmedi işaretle" : "Ödendi işaretle"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddSessionBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        studentId={studentId}
        onCreated={(created) => setSessions((prev) => [...prev, ...created])}
      />
    </div>
  );
}
