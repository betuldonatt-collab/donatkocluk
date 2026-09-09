"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { sendToPool } from "../actions";

const REASON_OPTIONS: { value: "quota_completed" | "absenteeism"; label: string }[] = [
  { value: "quota_completed", label: "Kotasını Tamamladı" },
  { value: "absenteeism", label: "Devamsızlık" },
];

// Requires an explicit reason so the pool badge (Yenileme Bekliyor /
// Devamsız) stays accurate -- mirrors the existing exit-status flow's
// "pick a reason before deactivating" pattern.
export function SendToPoolButton({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSend(reason: "quota_completed" | "absenteeism") {
    setSaving(true);
    try {
      await sendToPool(studentId, reason);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Havuz&apos;a Gönder
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">Neden:</span>
      {REASON_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          variant="destructive"
          size="sm"
          disabled={saving}
          onClick={() => handleSend(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
        İptal
      </Button>
    </div>
  );
}
