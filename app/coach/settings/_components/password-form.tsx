"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "../actions";

export function PasswordForm() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function handleSave() {
    if (!oldPassword || !newPassword || mismatch) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await changePassword(oldPassword, newPassword);
      setSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="old-password">Mevcut Şifre</Label>
        <Input
          id="old-password"
          type="password"
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">Yeni Şifre</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Yeni Şifre (Tekrar)</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {mismatch && <p className="text-destructive text-sm">Şifreler eşleşmiyor.</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {success && <p className="text-muted-foreground text-sm">Şifre güncellendi.</p>}
      <Button type="button" onClick={handleSave} disabled={saving || !oldPassword || !newPassword || mismatch}>
        {saving ? "Kaydediliyor..." : "Şifreyi Güncelle"}
      </Button>
    </div>
  );
}
