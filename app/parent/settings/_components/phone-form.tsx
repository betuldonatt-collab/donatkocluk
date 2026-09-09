"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateParentPhone } from "../actions";

export function PhoneForm({ initialPhone }: { initialPhone: string | null }) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSuccess(false);
    try {
      await updateParentPhone(phone);
      setSuccess(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="parent-phone">Telefon</Label>
        <Input id="parent-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {success && <p className="text-muted-foreground text-sm">Telefon güncellendi.</p>}
      <Button type="button" onClick={handleSave} disabled={saving}>
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </div>
  );
}
