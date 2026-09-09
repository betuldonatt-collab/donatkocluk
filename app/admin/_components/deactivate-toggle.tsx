"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { setUserActive } from "../actions";

// Soft delete, not hard delete -- see setUserActive. Deactivating blocks
// login (lib/impersonation.ts + app/login/actions.ts) but every historical
// record the account ever touched stays intact and readable.
export function DeactivateToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [active, setActive] = useState(isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !active;
    const message = next
      ? "Bu kullanıcıyı yeniden aktif etmek istediğine emin misin?"
      : "Bu kullanıcıyı pasife almak istediğine emin misin? Giriş yapamayacak, ancak geçmiş kayıtları korunacak.";
    if (!confirm(message)) return;

    setSaving(true);
    setError(null);
    try {
      await setUserActive(userId, next);
      setActive(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" variant={active ? "destructive" : "outline"} size="sm" onClick={handleToggle} disabled={saving}>
        {saving ? "Kaydediliyor..." : active ? "Pasife Al" : "Aktif Et"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
