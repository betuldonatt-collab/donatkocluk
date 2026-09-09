"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateCoachSettings } from "../actions";

export function StudentRadarForm({
  inactivityThresholdDays,
  criticalCompletionThresholdPct,
  successAlertEnabled,
}: {
  inactivityThresholdDays: number;
  criticalCompletionThresholdPct: number;
  successAlertEnabled: boolean;
}) {
  const [inactivityDays, setInactivityDays] = useState(String(inactivityThresholdDays));
  const [criticalPct, setCriticalPct] = useState(String(criticalCompletionThresholdPct));
  const [successEnabled, setSuccessEnabled] = useState(successAlertEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateCoachSettings({
        inactivityThresholdDays: Math.max(1, Number(inactivityDays) || 1),
        criticalCompletionThresholdPct: Math.min(100, Math.max(0, Number(criticalPct) || 0)),
        successAlertEnabled: successEnabled,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Buradaki ayarlar tamamen sizin kişisel asistanınız içindir. Belirlediğiniz şartlar oluştuğunda öğrencilere
        bildirim gitmez, sistem sadece size &quot;Bildirimler&quot; sekmesinde hatırlatma yapar.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="inactivity-days">
          Bana bildirim gönder: Öğrenci{" "}
          <Input
            id="inactivity-days"
            type="number"
            min={1}
            value={inactivityDays}
            onChange={(e) => setInactivityDays(e.target.value)}
            className="mx-1 inline-block w-16 align-middle"
          />{" "}
          gün boyunca sisteme girmezse/görev yapmazsa
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="critical-pct">
          Bana bildirim gönder: Haftalık tamamlama oranı %{" "}
          <Input
            id="critical-pct"
            type="number"
            min={0}
            max={100}
            value={criticalPct}
            onChange={(e) => setCriticalPct(e.target.value)}
            className="mx-1 inline-block w-16 align-middle"
          />{" "}
          altına düşerse
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="success-enabled" checked={successEnabled} onCheckedChange={setSuccessEnabled} />
        <Label htmlFor="success-enabled" className="font-normal">
          Bana bildirim gönder: Öğrenci haftalık hedeflerinin %100&apos;ünü bitirdiğinde
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
        {saved && <span className="text-muted-foreground text-sm">Kaydedildi.</span>}
      </div>
    </div>
  );
}
