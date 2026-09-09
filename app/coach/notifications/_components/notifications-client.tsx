"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, MessageSquareText, Trophy, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markNotificationDone } from "../actions";
import type { CoachNotification, NotificationType } from "../types";

const TYPE_LABELS: Record<NotificationType, string> = {
  inactive_student: "Pasif Öğrenci",
  critical_completion_drop: "Kritik Düşüş",
  success_completion: "Hedef Tamamlandı",
  note_revision_requested: "Not Revizyonu",
  checklist_task_done: "Görev Tamamlandı",
  pending_task_approval: "Onay Bekliyor",
};

const TYPE_ICONS: Record<NotificationType, typeof AlertTriangle> = {
  inactive_student: AlertTriangle,
  critical_completion_drop: TrendingDown,
  success_completion: Trophy,
  note_revision_requested: MessageSquareText,
  checklist_task_done: CheckCircle2,
  pending_task_approval: ClipboardCheck,
};

// Two shades within the "alert" tone so a still-ongoing inactivity notice
// (orange, needs attention) reads as one step less urgent than an
// already-happened completion-rate drop (red).
const TYPE_ACCENT: Record<NotificationType, { border: string; badge: string; icon: string }> = {
  inactive_student: { border: "border-l-orange-500", badge: "bg-orange-100 text-orange-700", icon: "text-orange-600" },
  critical_completion_drop: { border: "border-l-red-500", badge: "bg-red-100 text-red-700", icon: "text-red-600" },
  success_completion: { border: "border-l-green-500", badge: "bg-green-100 text-green-700", icon: "text-green-600" },
  checklist_task_done: { border: "border-l-green-500", badge: "bg-green-100 text-green-700", icon: "text-green-600" },
  note_revision_requested: { border: "border-l-blue-500", badge: "bg-blue-100 text-blue-700", icon: "text-blue-600" },
  // Amber, matching the dashboard's own pending-approvals card tone (same
  // "needs coach review" semantic, not urgent/negative like orange/red).
  pending_task_approval: { border: "border-l-amber-500", badge: "bg-amber-100 text-amber-700", icon: "text-amber-600" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function NotificationRow({
  notification,
  onDone,
}: {
  notification: CoachNotification;
  onDone?: (id: string) => void;
}) {
  const Icon = TYPE_ICONS[notification.type];
  const accent = TYPE_ACCENT[notification.type];
  const isHistory = !onDone;
  const [saving, setSaving] = useState(false);

  async function handleDone() {
    setSaving(true);
    try {
      await markNotificationDone(notification.id);
      onDone?.(notification.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border-l-4 p-3",
        accent.border,
        isHistory ? "bg-muted/40" : "bg-card shadow-sm",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", accent.icon)} />
      <div className={cn("min-w-0 flex-1", isHistory && "opacity-80")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", accent.badge)}>
            {TYPE_LABELS[notification.type]}
          </span>
          <span className="text-muted-foreground text-xs">{formatDate(notification.created_at)}</span>
        </div>
        <p className="text-foreground mt-1 text-sm">{notification.title}</p>
        {notification.body && <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-wrap">{notification.body}</p>}
        {notification.studentName && notification.student_id && (
          <Link href={`/coach/students/${notification.student_id}`} className="text-primary mt-1 inline-block text-xs underline">
            {notification.studentName}
          </Link>
        )}
      </div>
      {onDone && (
        <Button type="button" size="sm" variant="outline" onClick={handleDone} disabled={saving}>
          <Check className="size-4" />
          Tamam
        </Button>
      )}
    </div>
  );
}

export function NotificationsClient({ active, done }: { active: CoachNotification[]; done: CoachNotification[] }) {
  const [activeItems, setActiveItems] = useState(active);
  const [doneItems, setDoneItems] = useState(done);

  function handleDone(id: string) {
    const item = activeItems.find((n) => n.id === id);
    setActiveItems((prev) => prev.filter((n) => n.id !== id));
    if (item) setDoneItems((prev) => [{ ...item, status: "done", done_at: new Date().toISOString() }, ...prev]);
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-foreground mb-3 text-base font-semibold">Aktif Bildirimler</h2>
        {activeItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aktif bildirim yok.</p>
        ) : (
          <div className="space-y-2">
            {activeItems.map((n) => (
              <NotificationRow key={n.id} notification={n} onDone={handleDone} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-foreground mb-3 text-base font-semibold">Tamamlananlar</h2>
        {doneItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">Henüz kayıt yok.</p>
        ) : (
          <div className="space-y-2">
            {doneItems.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
